// Portfolio project builder. For a job's missing skills, a developer agent (Claude Agent SDK, sandboxed to the
// project folder) builds a small working project, runs its tests and writes a README; then we scan for secrets,
// push it to GitHub with the local `gh` login, and add it to the job's tailored resume (with Undo).
// Stages: building -> verifying -> publishing -> updating_resume -> done, or failed (with failed_stage).
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { z } from 'zod';
import { dataDir, db, getJobRow } from './db.js';
import { saveTailoredResume } from './jobProcessor.js';
import { completeJSON, llmInfo, stripFences } from './llm.js';
import { PROJECT_SYSTEM, RESUME_PROJECT_SYSTEM, projectPrompt, resumeProjectPrompt } from './prompts.js';
import { ProjectSchema, ResumeProjectSchema } from './schemas.js';

export const PROJECTS_DIR = path.join(dataDir, 'projects');
const BUILD_MINUTES = Number(process.env.PROJECT_BUILD_MINUTES) || 25;
const MAX_PARALLEL = 2;
// .NET SDK and NuGet packages are shared by all builds, so the ~200 MB SDK downloads once (on first use).
// ponytail: every build agent can write here; split per build if builds ever stop being equally trusted.
const TOOLCHAINS = path.join(dataDir, 'toolchains');
const DOTNET_HOSTS = ['dot.net', 'dotnet.microsoft.com', 'builds.dotnet.microsoft.com', 'ci.dot.net', 'dotnetcli.azureedge.net',
  'dotnetcli.blob.core.windows.net', 'api.nuget.org', 'globalcdn.nuget.org'];
const NPM_BIN = path.join(path.dirname(createRequire(import.meta.url).resolve('npm/package.json')), 'bin');
const ACTIVE = ['building', 'verifying', 'publishing', 'updating_resume'];
const running = new Map(); // project id -> AbortController of its developer agent
let shuttingDown = false;

const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const stageError = (stage, message) => Object.assign(new Error(message), { stage });
export const projectDir = (id) => path.join(PROJECTS_DIR, String(id));

/** Run a command without a shell. Never throws: returns { ok, stdout, stderr }. */
export function run(cmd, args, { cwd, timeout = 120_000 } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: String(stdout), stderr: String(stderr || err?.message || '') });
    });
  });
}

// ---- Records
const parse = (p) => p && {
  ...p,
  keywords: JSON.parse(p.keywords),
  details: p.details ? JSON.parse(p.details) : null,
  log: JSON.parse(p.log || '[]'),
  can_undo: !!p.resume_after,
  resume_before: undefined,
  resume_after: undefined,
};
const getRow = (id) => db.prepare('SELECT * FROM portfolio_projects WHERE id = ?').get(id);
export const getProject = (id) => parse(getRow(id));

function update(id, fields) {
  const keys = Object.keys(fields);
  const values = keys.map((k) => (fields[k] !== null && typeof fields[k] === 'object' ? JSON.stringify(fields[k]) : fields[k]));
  db.prepare(`UPDATE portfolio_projects SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...values, now(), id);
}

function addLog(id, line) {
  const log = JSON.parse(getRow(id).log || '[]');
  log.push({ at: now(), line: String(line).slice(0, 300) });
  update(id, { log: log.slice(-60) });
}

export function listProjects(jobId) {
  return db.prepare('SELECT * FROM portfolio_projects WHERE job_id = ? ORDER BY id DESC').all(jobId).map((p) => {
    const readme = path.join(projectDir(p.id), 'README.md');
    return { ...parse(p), readme: fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8').slice(0, 60_000) : null };
  });
}

/** Latest project per job, for the board. */
export function latestProjectByJob(userId) {
  return new Map(db.prepare(`
    SELECT p.job_id, p.id, p.status, p.failed_stage, p.repo_url FROM portfolio_projects p JOIN jobs j ON j.id = p.job_id
    WHERE j.user_id = ? AND p.id IN (SELECT MAX(id) FROM portfolio_projects GROUP BY job_id)
  `).all(userId).map((p) => [p.job_id, p]));
}

// ---- Requirements (R24)
export async function projectRequirements() {
  const problems = [];
  if (!['claude-agent-sdk', 'claude-code'].includes(llmInfo().provider)) {
    problems.push('Set LLM_PROVIDER=claude-agent-sdk in server/.env. Only the Agent SDK can write and run code.');
  }
  if (!(await run('gh', ['auth', 'status'])).ok) problems.push('Log in to GitHub on this machine: run `gh auth login`.');
  if (process.platform === 'linux' && !(await run('bwrap', ['--version'])).ok) problems.push('Install bubblewrap (bwrap); the build sandbox needs it.');
  return problems;
}

// ---- Start / retry
export async function startProject(row, { keywords, visibility = 'private' } = {}) {
  keywords = [...new Set((Array.isArray(keywords) ? keywords : []).map((k) => String(k).trim()).filter(Boolean))];
  if (!keywords.length || keywords.length > 8) throw fail(400, 'Pick between 1 and 8 skills to build a project for');
  if (!['public', 'private'].includes(visibility)) throw fail(400, 'Visibility must be public or private');
  const active = db.prepare(`SELECT job_id FROM portfolio_projects WHERE status IN (${ACTIVE.map(() => '?').join(',')})`).all(...ACTIVE);
  if (active.some((p) => p.job_id === row.id)) throw fail(409, 'A project is already being built for this job');
  if (active.length >= MAX_PARALLEL) throw fail(409, `${active.length} projects are already building. Try again when one finishes.`);
  const problems = await projectRequirements();
  if (problems.length) throw fail(400, problems.join(' '));

  const id = Number(db.prepare(`INSERT INTO portfolio_projects (job_id, keywords, status, visibility, created_at, updated_at)
    VALUES (?, ?, 'building', ?, ?, ?)`).run(row.id, JSON.stringify(keywords), visibility, now(), now()).lastInsertRowid);
  runPipeline(id, 'building');
  return getProject(id);
}

export function retryProject(userJobRow, projectId) {
  const p = getRow(projectId);
  if (!p || p.job_id !== userJobRow.id) throw fail(404, 'Project not found');
  if (p.status !== 'failed') throw fail(400, 'Only a failed project can be retried');
  // Publishing and resume steps resume where they failed; anything earlier rebuilds from scratch.
  const from = ['publishing', 'updating_resume'].includes(p.failed_stage) && p.details ? p.failed_stage : 'building';
  update(projectId, { status: from, failed_stage: null, error: null });
  runPipeline(projectId, from);
  return getProject(projectId);
}

// ---- Pipeline
async function runPipeline(id, from) {
  const p = getRow(id);
  const dir = projectDir(id);
  let stage = from;
  try {
    if (stage === 'building') {
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      const result = await buildWithAgent(id, getJobRow(p.job_id), JSON.parse(p.keywords), dir, (s) => { stage = s; });
      update(id, { details: result });
      stage = 'verifying';
      if (!result.verified) throw stageError('verifying', `The project and its tests did not pass: ${result.verification}`);
      const readme = path.join(dir, 'README.md');
      if (!fs.existsSync(readme) || fs.readFileSync(readme, 'utf8').length < 800) throw stageError('verifying', 'The README is missing or too short');
      stage = 'publishing';
    }
    if (stage === 'publishing') {
      update(id, { status: 'publishing' });
      const repoUrl = await publish(id, dir, JSON.parse(getRow(id).details), getRow(id).visibility);
      update(id, { repo_url: repoUrl });
      stage = 'updating_resume';
    }
    if (stage === 'updating_resume') {
      update(id, { status: 'updating_resume' });
      await addToResume(id);
    }
    update(id, { status: 'done' });
    addLog(id, 'Done');
  } catch (err) {
    console.error(`Project ${id} failed at ${err.stage || stage}:`, err);
    update(id, { status: 'failed', failed_stage: err.stage || stage, error: err.message || String(err) });
    addLog(id, `Failed: ${err.message}`);
  }
}

// The SDK's validator rejects the $schema header zod adds.
const { $schema, ...PROJECT_JSON_SCHEMA } = z.toJSONSchema(ProjectSchema);

const TEST_COMMAND = /\b(test|pytest|unittest|jest|vitest|mocha|smoke|verify|check)\b/i;

async function buildWithAgent(id, job, keywords, dir, setStage) {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  // Same isolation as the other agents, plus: caches and temp files stay inside the project folder (the sandbox only
  // allows writes there), and ANTHROPIC_API_KEY is hidden so the machine's Claude login is used.
  const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ANTHROPIC_API_KEY, ...env } = process.env;
  // Temp files get a SHORT directory: the sandbox puts Unix sockets in TMPDIR, and socket paths are limited to ~108 chars.
  const tmp = path.join(os.tmpdir(), `jtp-${id}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(path.join(dir, '.cache'), { recursive: true });
  // The sandbox's network proxy needs the credentials in its URL; old npm (Debian's 9.2) doesn't send them and gets
  // 407 on every install. Put a bundled npm 10 first on PATH.
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['npm', 'npx']) {
    const cli = path.join(NPM_BIN, `${name}-cli.js`);
    fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`, { mode: 0o755 });
  }
  // `dotnet` installs the .NET 8 SDK on first use (flock: two builds may start it at once), then runs it in its own
  // session: inside the sandbox the session id is 0, and .NET's named mutexes (NuGet-Migrations) fail with that.
  const dotnetRoot = path.join(TOOLCHAINS, 'dotnet');
  fs.mkdirSync(dotnetRoot, { recursive: true });
  fs.mkdirSync('/tmp/.dotnet', { recursive: true }); // .NET's lock files, at a fixed path
  fs.writeFileSync(path.join(bin, 'dotnet'), `#!/bin/sh
if [ ! -x "${dotnetRoot}/dotnet" ]; then
  flock "${dotnetRoot}/.install.lock" sh -c '[ -x "${dotnetRoot}/dotnet" ] || { curl -sSfL https://dot.net/v1/dotnet-install.sh -o "$TMPDIR/dotnet-install.sh" && bash "$TMPDIR/dotnet-install.sh" --channel 8.0 --install-dir "${dotnetRoot}" >&2; }' || exit 1
fi
exec setsid -w "${dotnetRoot}/dotnet" "$@"
`, { mode: 0o755 });
  Object.assign(env, {
    PATH: `${bin}${path.delimiter}${env.PATH || ''}`,
    XDG_CACHE_HOME: path.join(dir, '.cache'),
    npm_config_cache: path.join(dir, '.cache', 'npm'),
    PIP_CACHE_DIR: path.join(dir, '.cache', 'pip'),
    TMPDIR: tmp,
    DOTNET_ROOT: dotnetRoot,
    NUGET_PACKAGES: path.join(TOOLCHAINS, 'nuget'),
    DOTNET_CLI_HOME: path.join(dir, '.cache'),
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    DOTNET_CLI_WORKLOAD_UPDATE_NOTIFY_DISABLE: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    NUGET_CERT_REVOCATION_MODE: 'offline', // CRL/OCSP hosts are not reachable from the sandbox
  });
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
  const abortController = new AbortController();
  running.set(id, abortController);
  const timer = setTimeout(() => abortController.abort(), BUILD_MINUTES * 60_000);
  let result;
  try {
    addLog(id, `Developer agent started for: ${keywords.join(', ')}`);
    for await (const message of query({
      prompt: projectPrompt({ job, keywords }),
      options: {
        model: process.env.LLM_MODEL || 'sonnet',
        systemPrompt: PROJECT_SYSTEM,
        cwd: dir,
        tools,
        allowedTools: tools,
        permissionMode: 'acceptEdits',
        sandbox: {
          enabled: true,
          failIfUnavailable: true,
          autoAllowBashIfSandboxed: true,
          allowUnsandboxedCommands: false,
          filesystem: { allowWrite: [dir, tmp, TOOLCHAINS, '/tmp/.dotnet'] },
          // Package registries and the .NET SDK only, so real libraries (grpcio, kafka clients, xUnit) can be installed.
          network: { allowedDomains: ['pypi.org', 'files.pythonhosted.org', 'registry.npmjs.org', ...DOTNET_HOSTS] },
        },
        settingSources: [],
        mcpServers: {},
        strictMcpConfig: true,
        persistSession: false,
        maxTurns: 120,
        env,
        abortController,
        outputFormat: { type: 'json_schema', schema: PROJECT_JSON_SCHEMA },
      },
    })) {
      if (message.type === 'assistant') {
        for (const block of message.message?.content || []) {
          if (block.type !== 'tool_use') continue;
          const what = block.input?.command || block.input?.file_path || block.input?.pattern || '';
          addLog(id, `${block.name}${what ? `: ${String(what).replace(dir, '.')}` : ''}`);
          if (block.name === 'Bash' && TEST_COMMAND.test(what) && getRow(id).status === 'building') {
            update(id, { status: 'verifying' });
            setStage('verifying');
          }
        }
      }
      if (message.type === 'result') result = message;
    }
  } catch (err) {
    if (abortController.signal.aborted && shuttingDown) throw stageError('building', 'Interrupted by a server restart');
    if (abortController.signal.aborted) throw stageError('building', `The developer agent ran out of time (${BUILD_MINUTES} minutes)`);
    throw err;
  } finally {
    clearTimeout(timer);
    running.delete(id);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (!result) throw new Error('The developer agent returned no result');
  if (result.subtype !== 'success' || result.is_error) {
    throw new Error(`Developer agent: ${result.subtype === 'success' ? result.result : (result.errors || []).join('; ') || result.subtype}`);
  }
  const parsed = ProjectSchema.safeParse(result.structured_output);
  if (!parsed.success) throw new Error('The developer agent did not return a complete project summary');
  addLog(id, `Agent finished: ${parsed.data.verified ? 'tests passed' : 'tests did NOT pass'}`);
  return parsed.data;
}

// ---- Publish (R14-R16)
const IGNORED = ['node_modules/', '.venv/', 'venv/', '__pycache__/', '*.pyc', '.env', '.cache/', '.tmp/', 'dist/', 'build/', 'bin/', 'obj/', '.DS_Store'];

export function ensureGitignore(dir) {
  const file = path.join(dir, '.gitignore');
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const lines = new Set(have.split(/\r?\n/).map((l) => l.trim()));
  const missing = IGNORED.filter((l) => !lines.has(l));
  if (missing.length) fs.writeFileSync(file, `${have.replace(/\s*$/, '')}${have ? '\n' : ''}${missing.join('\n')}\n`);
}

const SECRET_PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
];

/** Secrets in the given files (paths relative to dir). Also catches this server's own keys verbatim. */
export function scanSecrets(dir, files) {
  const own = ['ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'MAIL_SECRET'].map((k) => process.env[k]).filter((v) => v && v.length >= 12);
  const found = [];
  for (const rel of files) {
    if (/(^|\/)\.env(\.|$)/.test(rel) && !/\.env\.example$/.test(rel)) { found.push(`${rel}: environment file`); continue; }
    const full = path.join(dir, rel);
    if (!fs.statSync(full).isFile() || fs.statSync(full).size > 1_000_000) continue;
    const text = fs.readFileSync(full, 'utf8');
    for (const [name, re] of SECRET_PATTERNS) if (re.test(text)) found.push(`${rel}: ${name}`);
    if (own.some((v) => text.includes(v))) found.push(`${rel}: one of this app's own keys`);
  }
  return found;
}

async function publish(id, dir, details, visibility) {
  ensureGitignore(dir);
  const git = async (...args) => {
    const r = await run('git', args, { cwd: dir });
    if (!r.ok) throw stageError('publishing', `git ${args[0]} failed: ${r.stderr.trim()}`);
    return r;
  };
  if (!fs.existsSync(path.join(dir, '.git'))) await git('init', '-b', 'main');
  await git('add', '-A');
  // Scan exactly what would be pushed.
  const files = (await git('ls-files')).stdout.split('\n').filter(Boolean);
  const leaks = scanSecrets(dir, files);
  if (leaks.length) throw stageError('publishing', `Not pushed: possible secrets found (${leaks.join('; ')})`);
  if (!(await run('git', ['rev-parse', 'HEAD'], { cwd: dir })).ok) await git('commit', '-m', `Initial commit: ${details.title}`);
  addLog(id, `Committed ${files.length} files`);

  await run('git', ['remote', 'remove', 'origin'], { cwd: dir }); // left over from an earlier attempt, if any
  for (let n = 1; n <= 5; n++) {
    const name = n === 1 ? details.repo_name : `${details.repo_name}-${n}`;
    const r = await run('gh', ['repo', 'create', name, `--${visibility}`, '--source', dir, '--remote', 'origin', '--push',
      '--description', details.summary.slice(0, 300)], { cwd: dir, timeout: 180_000 });
    if (r.ok) {
      const url = (await run('gh', ['repo', 'view', '--json', 'url', '-q', '.url'], { cwd: dir })).stdout.trim()
        || (`${r.stdout}${r.stderr}`.match(/https:\/\/github\.com\/[\w.-]+\/[\w.-]+/) || [])[0];
      if (!url) throw stageError('publishing', 'Pushed, but could not read the repository URL');
      addLog(id, `Pushed to ${url}`);
      return url.replace(/\.git$/, '');
    }
    if (!/already exists/i.test(r.stderr)) throw stageError('publishing', `gh repo create failed: ${r.stderr.trim()}`);
    addLog(id, `Repository name ${name} is taken; trying another`);
    await run('git', ['remote', 'remove', 'origin'], { cwd: dir });
  }
  throw stageError('publishing', 'Could not find a free repository name');
}

// ---- Resume (R17-R20)
export async function addToResume(id, complete = completeJSON) {
  const p = getRow(id);
  const job = getJobRow(p.job_id);
  if (!job.tailored_markdown) {
    update(id, { resume_note: "Will be added when this job's resume is tailored" });
    return;
  }
  const details = JSON.parse(p.details);
  const out = await complete(RESUME_PROJECT_SYSTEM, resumeProjectPrompt({ resume: job.tailored_markdown, project: { ...details, repo_url: p.repo_url } }),
    ResumeProjectSchema, { maxTokens: 12000 });
  const md = stripFences(out.resume_markdown);
  if (!md.includes(p.repo_url)) throw stageError('updating_resume', 'The updated resume did not include the repository link');
  db.transaction(() => {
    saveTailoredResume(job, md);
    db.prepare(`INSERT INTO resume_chat (job_id, role, content, proposal, change_summary, applied, created_at)
      VALUES (?, 'assistant', ?, ?, ?, 1, ?)`).run(job.id,
      `I added your portfolio project “${details.title}” (${p.repo_url}) to this resume. You can undo it from the Projects tab.`,
      md, out.change_summary, now());
    update(id, { resume_before: job.tailored_markdown, resume_after: md, resume_note: out.change_summary });
  })();
  addLog(id, `Resume updated: ${out.change_summary}`);
}

/** R20: projects finished before the job had a tailored resume are added once it does. */
export async function applyPendingProjects(jobId) {
  const pending = db.prepare(`SELECT id FROM portfolio_projects WHERE job_id = ? AND status = 'done' AND repo_url IS NOT NULL
    AND resume_after IS NULL AND resume_note LIKE 'Will be added%'`).all(jobId);
  for (const { id } of pending) {
    try {
      await addToResume(id);
    } catch (err) {
      update(id, { resume_note: `Could not add to the resume yet: ${err.message}` });
    }
  }
}

export function undoResume(userJobRow, projectId) {
  const p = getRow(projectId);
  if (!p || p.job_id !== userJobRow.id) throw fail(404, 'Project not found');
  if (!p.resume_after) throw fail(400, 'Nothing to undo');
  if (userJobRow.tailored_markdown !== p.resume_after) {
    throw fail(409, 'The resume has changed since the project was added. Remove it with Edit on page instead.');
  }
  db.transaction(() => {
    saveTailoredResume(userJobRow, p.resume_before);
    update(projectId, { resume_after: null, resume_before: null, resume_note: 'Removed from the resume (undone)' });
  })();
  return getProject(projectId);
}

export function deleteLocal(userJobRow, projectId) {
  const p = getRow(projectId);
  if (!p || p.job_id !== userJobRow.id) throw fail(404, 'Project not found');
  if (ACTIVE.includes(p.status)) throw fail(409, 'Wait for the build to finish first');
  fs.rmSync(projectDir(projectId), { recursive: true, force: true });
  db.prepare('DELETE FROM portfolio_projects WHERE id = ?').run(projectId);
}

/** .tar.gz of the project, without dependencies, caches or git internals. */
export function archiveStream(projectId) {
  const child = spawn('tar', ['-czf', '-', '--exclude=node_modules', '--exclude=.venv', '--exclude=__pycache__',
    '--exclude=.cache', '--exclude=.tmp', '--exclude=.git', '-C', PROJECTS_DIR, String(projectId)]);
  return child.stdout;
}

/** On boot: builds that were running when the server died are failed, and their orphaned agent processes stopped. */
export function recoverStuckProjects() {
  // Nothing can legitimately be building at boot, so stop any agent left over from a crash: their command lines
  // carry this data dir's projects path in the sandbox settings.
  execFile('pkill', ['-f', `"${PROJECTS_DIR}/`], () => {});
  db.prepare(`UPDATE portfolio_projects SET failed_stage = status, status = 'failed', error = 'Interrupted by a server restart'
    WHERE status IN (${ACTIVE.map(() => '?').join(',')})`).run(...ACTIVE);
}

/** On a normal shutdown: stop running developer agents so none are left behind. */
export function abortRunningBuilds() {
  shuttingDown = true;
  for (const controller of running.values()) controller.abort();
}
