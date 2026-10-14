// Hiring panel: runs the /hiring-panel skill (vendor/hiring-panel-skill, MIT, unchanged) through the Claude Agent SDK.
// Seven sub-agents try to reject the job's resume, then the skill rebuilds it; the user can apply the rebuilt resume
// as the tailored resume (with Undo). Each run works in its own folder and may only touch files inside it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { dataDir, db, getJobRow, getResume, updateJob } from './db.js';
import { saveTailoredResume } from './jobProcessor.js';
import { llmInfo } from './llm.js';
import { PanelSchema } from './schemas.js';

const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'vendor', 'hiring-panel-skill');
const SKILL = 'hiring-panel-skill:hiring-panel';
const CREDIT = /^\s*Made with \/hiring-panel by .*$/gm;
const TIMEOUT_MS = 15 * 60_000;
const MAX_PARALLEL = 2;
const RUNS_DIR = path.join(dataDir, 'panel-runs'); // one temp folder per run, removed when it ends
const running = new Map(); // job id -> AbortController
const { $schema, ...PANEL_JSON_SCHEMA } = z.toJSONSchema(PanelSchema);

const fail = (status, message) => Object.assign(new Error(message), { status });
const getPanel = (row) => (row.panel ? JSON.parse(row.panel) : null);
const setPanel = (id, panel) => updateJob(id, { panel });

/** The resume the panel reviews: the tailored one if there is one, else the base resume. */
function sourceResume(row) {
  if (row.tailored_markdown) return { source: 'tailored', markdown: row.tailored_markdown };
  const base = getResume(row.user_id);
  return base ? { source: 'base', markdown: base.markdown } : null;
}

export function startPanel(row) {
  if (llmInfo().provider !== 'claude-agent-sdk') throw fail(400, 'The hiring panel runs as a Claude Code skill, so it needs LLM_PROVIDER=claude-agent-sdk.');
  if (running.has(row.id)) throw fail(409, 'The panel is already reviewing this resume');
  if (running.size >= MAX_PARALLEL) throw fail(409, `${running.size} panels are already running. Try again when one finishes.`);
  const input = sourceResume(row);
  if (!input) throw fail(400, 'Upload your resume first');
  const previous = getPanel(row);
  setPanel(row.id, { status: 'running', source: input.source, input: input.markdown, started_at: new Date().toISOString(),
    // Keep an applied run's undo information until the new run replaces it.
    ...(previous?.applied ? { applied: true, resume_before: previous.resume_before, improved_md: previous.improved_md } : {}) });
  runPanel(row.id, input).catch((e) => console.error(e));
  return getJobRow(row.id);
}

async function runPanel(id, input) {
  const job = getJobRow(id);
  const abortController = new AbortController();
  running.set(id, abortController);
  const timer = setTimeout(() => abortController.abort(), TIMEOUT_MS);
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(RUNS_DIR, 'run-'));
  try {
    fs.writeFileSync(path.join(dir, 'resume.md'), input.markdown);
    const { query } = await import('@anthropic-ai/claude-agent-sdk');
    const { CLAUDECODE, CLAUDE_CODE_ENTRYPOINT, ANTHROPIC_API_KEY, ...env } = process.env;
    const inside = (p) => !p || path.resolve(dir, p).startsWith(dir + path.sep) || path.resolve(dir, p) === dir;
    let result;
    for await (const message of query({
      prompt: `/${SKILL} resume.md for this job: ${job.title} at ${job.company}\n\n${job.description}\n\n`
        + 'resume.md uses this Markdown format: "# Name", contact line, "## Section", "### Role — Company", "_dates_", "- bullets". '
        + 'Write RESUME-IMPROVED.md in the same format. Your final reply is the structured result: put in it what you would show in chat.',
      options: {
        model: process.env.LLM_MODEL || 'sonnet',
        cwd: dir,
        plugins: [{ type: 'local', path: PLUGIN }],
        skills: [SKILL],
        tools: ['Skill', 'Agent', 'Task', 'Read', 'Write', 'Edit', 'Glob'],
        // Every call goes through here: the skill and its sub-agents are allowed, files only inside the run folder.
        canUseTool: async (name, toolInput) => (['Skill', 'Agent', 'Task'].includes(name) || inside(toolInput.file_path || toolInput.path)
          ? { behavior: 'allow', updatedInput: toolInput }
          : { behavior: 'deny', message: 'Only files in the current directory can be used' }),
        settingSources: [],
        mcpServers: {},
        strictMcpConfig: true,
        persistSession: false,
        maxTurns: 40,
        env,
        abortController,
        outputFormat: { type: 'json_schema', schema: PANEL_JSON_SCHEMA },
      },
    })) {
      if (message.type === 'result') result = message;
    }
    if (result?.subtype !== 'success' || result.is_error || !result.structured_output) {
      throw new Error(`The panel did not finish: ${result?.subtype === 'success' ? result.result : (result?.errors || []).join('; ') || result?.subtype || 'no result'}`);
    }
    const out = PanelSchema.parse(result.structured_output);
    const files = fs.readdirSync(path.join(dir, '.hiring-panel'), { recursive: true }).map(String);
    const read = (name) => {
      const f = files.find((x) => path.basename(x) === name);
      return f ? fs.readFileSync(path.join(dir, '.hiring-panel', f), 'utf8') : null;
    };
    const improved = read('RESUME-IMPROVED.md');
    if (!improved || improved.length < 200) throw new Error('The panel did not write an improved resume');
    const current = getPanel(getJobRow(id)) || {};
    setPanel(id, { ...current, status: 'done', result: out, panel_md: read('PANEL.md'), improved_md: improved,
      applied: false, resume_before: null, finished_at: new Date().toISOString(), cost_usd: result.total_cost_usd });
  } catch (err) {
    console.error(`Hiring panel for job ${id} failed:`, err);
    const message = abortController.signal.aborted ? (shuttingDown ? 'Interrupted by a server restart' : 'The panel ran out of time') : err.message;
    const current = getPanel(getJobRow(id) || {}) || {};
    if (getJobRow(id)) setPanel(id, { ...current, status: 'failed', error: message, finished_at: new Date().toISOString() });
  } finally {
    clearTimeout(timer);
    running.delete(id);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Use the panel's rebuilt resume as this job's tailored resume. Refused if the resume changed since the panel read it. */
export function applyPanel(row) {
  const panel = getPanel(row);
  if (panel?.status !== 'done' || !panel.improved_md) throw fail(400, 'Run the panel first');
  if (panel.applied) throw fail(400, 'Already applied');
  if (sourceResume(row)?.markdown !== panel.input) throw fail(409, 'The resume changed after the panel read it. Run the panel again.');
  const markdown = panel.improved_md.replace(CREDIT, '').trim();
  const updated = saveTailoredResume(row, markdown);
  setPanel(row.id, { ...panel, applied: true, applied_md: markdown, resume_before: row.tailored_markdown || null });
  return getJobRow(updated.id);
}

/** Put back the resume from before Apply, only if nobody edited it since. */
export function undoPanel(row) {
  const panel = getPanel(row);
  if (!panel?.applied) throw fail(400, 'Nothing to undo');
  if (row.tailored_markdown !== panel.applied_md) throw fail(409, 'The resume was edited after the panel’s version was applied, so Undo would lose those edits.');
  if (panel.resume_before) saveTailoredResume(row, panel.resume_before);
  else updateJob(row.id, { tailored_markdown: null, tailored_edited: 0, tailoring: null });
  setPanel(row.id, { ...panel, applied: false, applied_md: null, resume_before: null });
  return getJobRow(row.id);
}

let shuttingDown = false;
export function abortRunningPanels() {
  shuttingDown = true;
  for (const c of running.values()) c.abort();
}

/** Runs cut off by a restart are marked failed at boot, and their temp folders removed. */
export function recoverStuckPanels() {
  fs.rmSync(RUNS_DIR, { recursive: true, force: true });
  for (const row of db.prepare("SELECT id, panel FROM jobs WHERE panel LIKE '%\"status\":\"running\"%'").all()) {
    setPanel(row.id, { ...JSON.parse(row.panel), status: 'failed', error: 'Interrupted by a server restart' });
  }
}
