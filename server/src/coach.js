// Resume coach: a conversation per job. Its memory is the stored conversation, replayed into each turn's prompt,
// so it survives reloads and restarts and works with any LLM provider. Proposed edits wait for the user's Apply.
import crypto from 'node:crypto';
import { db, getJobRow } from './db.js';
import { saveTailoredResume } from './jobProcessor.js';
import { completeJSON, stripFences } from './llm.js';
import { COACH_SYSTEM, coachPrompt } from './prompts.js';
import { CoachSchema } from './schemas.js';

const MEMORY_TURNS = 30; // messages replayed into each prompt; older ones drop out of the coach's view

const hash = (text) => crypto.createHash('sha256').update(String(text)).digest('hex');
const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });

const serialize = (m) => ({ ...m, applied: !!m.applied, based_on: undefined });

export function listChat(jobId) {
  return db.prepare('SELECT * FROM resume_chat WHERE job_id = ? ORDER BY id').all(jobId).map(serialize);
}

/** One exchange. `complete` is injectable for tests. Returns the stored [user, assistant] messages. */
export async function chatTurn(row, message, complete = completeJSON) {
  message = String(message || '').trim();
  if (!message) throw fail(400, 'Type a message first');
  if (!row.tailored_markdown) throw fail(400, 'Tailor the resume first, then the coach can help improve it');

  const history = db.prepare('SELECT * FROM (SELECT * FROM resume_chat WHERE job_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id')
    .all(row.id, MEMORY_TURNS);
  const out = await complete(COACH_SYSTEM, coachPrompt({
    job: row,
    analysis: JSON.parse(row.analysis || 'null'),
    resume: row.tailored_markdown,
    history,
    message,
  }), CoachSchema, { maxTokens: 12000 });

  let proposal = out.resume_markdown ? stripFences(out.resume_markdown) : null;
  if (proposal && (proposal.length < 50 || proposal.trim() === row.tailored_markdown.trim())) proposal = null;

  // Both sides are stored only after a successful reply, so a failed call never leaves a dangling question in memory.
  return db.transaction(() => {
    const ins = db.prepare(`INSERT INTO resume_chat (job_id, role, content, proposal, change_summary, based_on, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`);
    const u = ins.run(row.id, 'user', message, null, null, null, now()).lastInsertRowid;
    const a = ins.run(row.id, 'assistant', out.reply, proposal, proposal ? out.change_summary || 'Proposed changes' : null,
      proposal ? hash(row.tailored_markdown) : null, now()).lastInsertRowid;
    return db.prepare('SELECT * FROM resume_chat WHERE id IN (?, ?) ORDER BY id').all(u, a).map(serialize);
  })();
}

/** Apply a proposal, unless the resume has changed since it was made (which would silently undo those edits). */
export function applyProposal(row, messageId) {
  const msg = db.prepare('SELECT * FROM resume_chat WHERE id = ? AND job_id = ?').get(messageId, row.id);
  if (!msg?.proposal) throw fail(404, 'No proposed changes on that message');
  if (msg.applied) throw fail(400, 'Already applied');
  if (msg.based_on !== hash(row.tailored_markdown)) {
    throw fail(409, 'The resume has changed since this suggestion. Ask the coach again so it works from the current version.');
  }
  db.transaction(() => {
    saveTailoredResume(row, msg.proposal);
    db.prepare('UPDATE resume_chat SET applied = 1 WHERE id = ?').run(msg.id);
  })();
  return { job: getJobRow(row.id), message: serialize(db.prepare('SELECT * FROM resume_chat WHERE id = ?').get(msg.id)) };
}

export function clearChat(jobId) {
  db.prepare('DELETE FROM resume_chat WHERE job_id = ?').run(jobId);
}
