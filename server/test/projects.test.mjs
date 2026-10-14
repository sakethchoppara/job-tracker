import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-project-test-'));
const { db, insertJob, updateJob, getJobRow } = await import('../src/db.js');
const P = await import('../src/projects.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('p', 'x', '')").run().lastInsertRowid);
const RESUME = '# Saketh\na@b.com\n\n## Experience\n- Built APIs in Python\n\n## Skills\n**Languages:** Python\n';
const newJob = () => insertJob({ user_id: userId, title: 'Backend Engineer', company: 'Swiggy', description: 'd', experience: null, location: null, url: null, notes: null, status: 'applied' });
const details = { title: 'Order Events Pipeline', repo_name: 'order-events-pipeline', summary: 'Streams orders.', stack: ['Python'], keywords_covered: ['Kafka'],
  how_to_run: 'python main.py', verified: true, verification: 'ran tests', talking_points: ['partitions'] };
const insertProject = (jobId, fields = {}) => Number(db.prepare(`INSERT INTO portfolio_projects (job_id, keywords, status, details, repo_url, created_at, updated_at)
  VALUES (?, '["Kafka"]', ?, ?, ?, '', '')`).run(jobId, fields.status || 'done', JSON.stringify(details), fields.repo_url ?? 'https://github.com/u/order-events-pipeline').lastInsertRowid);
const addsProject = async (system, prompt) => ({
  resume_markdown: RESUME.replace('## Skills', '## Projects\n### Order Events Pipeline — Portfolio project\nhttps://github.com/u/order-events-pipeline\n- Built a Kafka pipeline\n\n## Skills'),
  change_summary: 'Adds Order Events Pipeline',
});

test('secret scan catches keys, env files and this server\'s own keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-scan-'));
  fs.writeFileSync(path.join(dir, 'ok.py'), 'print("hello")\n');
  fs.writeFileSync(path.join(dir, 'config.js'), "const key = 'AKIAABCDEFGHIJKLMNOP';\n");
  fs.writeFileSync(path.join(dir, '.env'), 'X=1\n');
  fs.writeFileSync(path.join(dir, '.env.example'), 'X=\n');
  process.env.GEMINI_API_KEY = 'super-secret-test-value-123';
  fs.writeFileSync(path.join(dir, 'notes.md'), 'token super-secret-test-value-123\n');
  const found = P.scanSecrets(dir, ['ok.py', 'config.js', '.env', '.env.example', 'notes.md']);
  assert.deepEqual(found, ['config.js: AWS access key', '.env: environment file', "notes.md: one of this app's own keys"]);
});

test('.gitignore keeps the agent\'s lines and adds the required ones once', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-ignore-'));
  fs.writeFileSync(path.join(dir, '.gitignore'), 'coverage/\nnode_modules/\n');
  P.ensureGitignore(dir);
  P.ensureGitignore(dir);
  const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8').trim().split('\n');
  assert.equal(lines[0], 'coverage/');
  assert.equal(lines.filter((l) => l === 'node_modules/').length, 1);
  for (const l of ['.env', '.venv/', '.cache/', '__pycache__/']) assert.ok(lines.includes(l), l);
});

test('adds the project to the resume, records it for the coach, and Undo restores the exact resume', async () => {
  const job = newJob();
  updateJob(job.id, { tailored_markdown: RESUME });
  const id = insertProject(job.id, { status: 'updating_resume' });
  await P.addToResume(id, addsProject);
  assert.match(getJobRow(job.id).tailored_markdown, /Order Events Pipeline/);
  assert.equal(db.prepare('SELECT applied FROM resume_chat WHERE job_id = ?').get(job.id).applied, 1);
  assert.equal(P.getProject(id).can_undo, true);
  P.undoResume(getJobRow(job.id), id);
  assert.equal(getJobRow(job.id).tailored_markdown, RESUME);
  assert.throws(() => P.undoResume(getJobRow(job.id), id), /Nothing to undo/);
});

test('undo refuses after the resume was edited, and a resume update must keep the repo link', async () => {
  const job = newJob();
  updateJob(job.id, { tailored_markdown: RESUME });
  const id = insertProject(job.id);
  await P.addToResume(id, addsProject);
  updateJob(job.id, { tailored_markdown: `${getJobRow(job.id).tailored_markdown}\n- edited` });
  assert.throws(() => P.undoResume(getJobRow(job.id), id), /changed since/);
  const id2 = insertProject(job.id);
  await assert.rejects(P.addToResume(id2, async () => ({ resume_markdown: RESUME, change_summary: 'x' })), /did not include the repository link/);
});

test('a project finished before tailoring is added once the resume is tailored (R20)', async () => {
  const job = newJob();
  const id = insertProject(job.id);
  await P.addToResume(id, addsProject);
  assert.match(P.getProject(id).resume_note, /Will be added/);
  updateJob(job.id, { tailored_markdown: RESUME });
  // applyPendingProjects uses the real LLM; here we call the same step with the scripted one.
  await P.addToResume(id, addsProject);
  assert.match(getJobRow(job.id).tailored_markdown, /Order Events Pipeline/);
});

test('one active build per job, and the parallel limit', async () => {
  const a = newJob();
  const b = newJob();
  const c = newJob();
  insertProject(a.id, { status: 'building' });
  insertProject(b.id, { status: 'verifying' });
  await assert.rejects(P.startProject(getJobRow(a.id), { keywords: ['Kafka'] }), /already being built for this job/);
  await assert.rejects(P.startProject(getJobRow(c.id), { keywords: ['Kafka'] }), /projects are already building/);
  await assert.rejects(P.startProject(getJobRow(c.id), { keywords: [] }), /between 1 and 8/);
  await assert.rejects(P.startProject(getJobRow(c.id), { keywords: ['x'], visibility: 'everyone' }), /public or private/);
});

test('a restart marks running builds as failed at their stage, and only failed ones can be retried', () => {
  const job = newJob();
  const id = insertProject(job.id, { status: 'publishing' });
  P.recoverStuckProjects();
  const p = P.getProject(id);
  assert.equal(p.status, 'failed');
  assert.equal(p.failed_stage, 'publishing');
  assert.match(p.error, /restart/);
  const done = insertProject(job.id, { status: 'done' });
  assert.throws(() => P.retryProject(getJobRow(job.id), done), /Only a failed project/);
});
