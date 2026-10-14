import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-coach-test-'));
const { db, insertJob, updateJob, getJobRow } = await import('../src/db.js');
const { chatTurn, applyProposal, listChat, clearChat } = await import('../src/coach.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('c', 'x', '')").run().lastInsertRowid);
const RESUME = '# Saketh\na@b.com\n\n## Summary\nBackend engineer.\n\n## Experience\n- Built APIs in Python\n';
const job = insertJob({ user_id: userId, title: 'Backend Engineer', company: 'Swiggy', description: 'd', experience: null, location: null, url: null, notes: null, status: 'applied' });
updateJob(job.id, { tailored_markdown: RESUME, analysis: { score: 60, missing_keywords: [{ keyword: 'AWS' }], red_flags: [{ flag: 'Generic summary' }] } });

// A scripted coach that records every prompt it was given.
const prompts = [];
const coach = (...replies) => async (system, prompt) => { prompts.push(prompt); return replies.shift(); };

test('needs a tailored resume and a message', async () => {
  const bare = insertJob({ user_id: userId, title: 't', company: 'c', description: 'd', experience: null, location: null, url: null, notes: null, status: 'saved' });
  await assert.rejects(chatTurn(bare, 'hi', coach()), /Tailor the resume first/);
  await assert.rejects(chatTurn(getJobRow(job.id), '   ', coach()), /Type a message/);
});

test('remembers earlier turns: they are replayed into the next prompt', async () => {
  await chatTurn(getJobRow(job.id), 'I led a team of 4 on the payments API', coach({ reply: 'Great, want me to add that?', resume_markdown: null, change_summary: null }));
  const [, answer] = await chatTurn(getJobRow(job.id), 'Yes, add it', coach({
    reply: 'Added to your first bullet.',
    resume_markdown: RESUME.replace('- Built APIs in Python', '- Led a team of 4 building the payments API in Python'),
    change_summary: 'Adds team leadership to the first bullet',
  }));
  assert.match(prompts.at(-1), /CANDIDATE: I led a team of 4 on the payments API/);
  assert.match(prompts.at(-1), /COACH: Great, want me to add that\?/);
  assert.equal(answer.change_summary, 'Adds team leadership to the first bullet');
  assert.equal(listChat(job.id).length, 4);
});

test('a proposal only changes the resume when applied', async () => {
  const proposal = listChat(job.id).at(-1);
  assert.equal(getJobRow(job.id).tailored_markdown, RESUME);
  const { job: updated, message } = applyProposal(getJobRow(job.id), proposal.id);
  assert.match(updated.tailored_markdown, /Led a team of 4/);
  assert.equal(message.applied, true);
  assert.throws(() => applyProposal(getJobRow(job.id), proposal.id), /Already applied/);
});

test('a stale proposal is refused after the resume changed', async () => {
  const [, answer] = await chatTurn(getJobRow(job.id), 'Shorten the summary', coach({
    reply: 'Here you go.', resume_markdown: getJobRow(job.id).tailored_markdown.replace('Backend engineer.', 'Python backend engineer.'), change_summary: 'Tightens summary',
  }));
  updateJob(job.id, { tailored_markdown: `${getJobRow(job.id).tailored_markdown}\n- Edited by hand\n` });
  assert.throws(() => applyProposal(getJobRow(job.id), answer.id), /changed since this suggestion/);
});

test('an unchanged "proposal" is not offered, and a failed call stores nothing', async () => {
  const before = listChat(job.id).length;
  const [, answer] = await chatTurn(getJobRow(job.id), 'Looks good?', coach({ reply: 'Yes.', resume_markdown: getJobRow(job.id).tailored_markdown, change_summary: 'none' }));
  assert.equal(answer.proposal, null);
  await assert.rejects(chatTurn(getJobRow(job.id), 'Again', async () => { throw new Error('AI down'); }), /AI down/);
  assert.equal(listChat(job.id).length, before + 2);
});

test('clearing starts a fresh conversation', () => {
  clearChat(job.id);
  assert.equal(listChat(job.id).length, 0);
});
