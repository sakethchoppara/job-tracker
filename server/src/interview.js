// Mock interview: a skeptical hiring manager asks 8 questions one at a time, attacking the resume's numbers and weakest
// claims, scores each answer and ends with hire / no hire. Like the coach, its memory is the stored conversation.
import { db, getResume } from './db.js';
import { completeJSON } from './llm.js';
import { INTERVIEW_QUESTIONS, INTERVIEW_SYSTEM, interviewPrompt } from './prompts.js';
import { InterviewSchema } from './schemas.js';

const now = () => new Date().toISOString();
const fail = (status, message) => Object.assign(new Error(message), { status });
const serialize = (m) => ({ ...m, feedback: m.feedback ? JSON.parse(m.feedback) : null, final: m.final ? JSON.parse(m.final) : null });
const history = (jobId) => db.prepare('SELECT * FROM interview_messages WHERE job_id = ? ORDER BY id').all(jobId);

export function listInterview(jobId) {
  return history(jobId).map(serialize);
}

/** One interviewer turn. With no answer it (re)starts the interview. `complete` is injectable for tests. */
export async function interviewTurn(row, answer, complete = completeJSON) {
  const resume = row.tailored_markdown || getResume(row.user_id)?.markdown;
  if (!resume) throw fail(400, 'Upload your resume first');
  answer = String(answer || '').trim();
  let past = history(row.id);
  if (!answer) past = [];
  else {
    if (!past.length) throw fail(400, 'Start the interview first');
    if (past.at(-1).final) throw fail(400, 'The interview is over. Start a new one to practise again.');
    if (past.at(-1).role !== 'interviewer') throw fail(409, 'Wait for the next question');
  }
  const convo = answer ? [...past, { role: 'candidate', content: answer }] : [];
  const asked = convo.filter((m) => m.role === 'interviewer').length;
  const out = await complete(INTERVIEW_SYSTEM, interviewPrompt({ job: row, resume, history: convo }), InterviewSchema, { maxTokens: 3000 });
  const last = asked >= INTERVIEW_QUESTIONS;
  if (answer && !out.feedback) throw fail(502, 'The interviewer did not score your answer. Send it again.');
  if (last ? !out.final : !out.question) throw fail(502, 'The interviewer did not reply properly. Send it again.');

  // Stored only after a good reply, so a failed call never leaves an unanswered answer behind.
  return db.transaction(() => {
    if (!answer) db.prepare('DELETE FROM interview_messages WHERE job_id = ?').run(row.id);
    const ins = db.prepare('INSERT INTO interview_messages (job_id, role, content, feedback, final, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    if (answer) ins.run(row.id, 'candidate', answer, null, null, now());
    ins.run(row.id, 'interviewer', last ? out.final.reason : out.question,
      out.feedback ? JSON.stringify(out.feedback) : null, last ? JSON.stringify(out.final) : null, now());
    return listInterview(row.id);
  })();
}

export function clearInterview(jobId) {
  db.prepare('DELETE FROM interview_messages WHERE job_id = ?').run(jobId);
}
