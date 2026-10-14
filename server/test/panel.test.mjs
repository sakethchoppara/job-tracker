import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-panel-test-'));
const { db, insertJob, updateJob, getJobRow, serializeJob } = await import('../src/db.js');
const P = await import('../src/panel.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('h', 'x', '')").run().lastInsertRowid);
const TAILORED = '# Saketh\na@b.com\n\n## Experience\n- Built APIs in Python\n';
const IMPROVED = `# Saketh\na@b.com\n\n## Experience\n- Built 15 Python APIs [ADD: users]\n${'- more\n'.repeat(40)}\nMade with /hiring-panel by Alex Chen (@nocodealex) · chen.media\n`;
const newJob = (fields) => {
  const row = insertJob({ user_id: userId, title: 'SWE', company: 'Infor', description: 'd', experience: null, location: null, url: null, notes: null, status: 'saved' });
  return updateJob(row.id, fields);
};
const done = (input) => ({ status: 'done', source: 'tailored', input, improved_md: IMPROVED, panel_md: '# Panel', result: {} });

test('apply uses the rebuilt resume without the credit line, flags its [ADD] placeholders, and undo restores it exactly', () => {
  const row = newJob({ tailored_markdown: TAILORED, panel: done(TAILORED) });
  const applied = P.applyPanel(row);
  assert.ok(!applied.tailored_markdown.includes('Made with /hiring-panel'));
  assert.ok(applied.tailored_markdown.startsWith('# Saketh'));
  assert.deepEqual(JSON.parse(applied.tailoring).placeholders, ['[ADD: users]']);
  assert.equal(serializeJob(applied).panel.applied, true);
  assert.throws(() => P.applyPanel(applied), /Already applied/);

  const undone = P.undoPanel(applied);
  assert.equal(undone.tailored_markdown, TAILORED);
  assert.equal(serializeJob(undone).panel.applied, false);
});

test('apply is refused when the resume changed after the panel read it; undo is refused after a later edit', () => {
  const stale = newJob({ tailored_markdown: `${TAILORED}- edited later\n`, panel: done(TAILORED) });
  assert.throws(() => P.applyPanel(stale), (e) => e.status === 409);

  const row = newJob({ tailored_markdown: TAILORED, panel: done(TAILORED) });
  const applied = P.applyPanel(row);
  const edited = updateJob(applied.id, { tailored_markdown: `${applied.tailored_markdown}\n- my edit\n` });
  assert.throws(() => P.undoPanel(edited), (e) => e.status === 409);
});

test('a panel on the base resume (no tailored one yet) creates the tailored resume, and undo removes it again', () => {
  const base = '# Saketh\nbase resume\n';
  db.prepare("INSERT OR REPLACE INTO resumes (user_id, filename, raw_text, markdown, structured, updated_at) VALUES (?, 'r.pdf', '', ?, '{}', '')").run(userId, base);
  const row = newJob({ panel: { ...done(base), source: 'base' } });
  const applied = P.applyPanel(row);
  assert.ok(applied.tailored_markdown.includes('Built 15 Python APIs'));
  assert.equal(P.undoPanel(applied).tailored_markdown, null);
});

test('runs cut off by a restart are marked failed; starting needs the Agent SDK provider', () => {
  const row = newJob({ tailored_markdown: TAILORED, panel: { status: 'running', input: TAILORED } });
  P.recoverStuckPanels();
  const panel = serializeJob(getJobRow(row.id)).panel;
  assert.equal(panel.status, 'failed');
  assert.match(panel.error, /restart/);

  process.env.LLM_PROVIDER = 'gemini';
  process.env.GEMINI_API_KEY ||= 'test';
  assert.throws(() => P.startPanel(getJobRow(row.id)), /claude-agent-sdk/);
});
