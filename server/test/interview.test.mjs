import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-interview-test-'));
const { db, insertJob, updateJob, getJobRow } = await import('../src/db.js');
const { interviewTurn, listInterview } = await import('../src/interview.js');
const { correctCheck } = await import('../src/jobProcessor.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('i', 'x', '')").run().lastInsertRowid);
const RESUME = '# Saketh\na@b.com\n\n## Experience\n- Cut p99 latency 40% on the payments API in Python\n';
const job = insertJob({ user_id: userId, title: 'Backend Engineer', company: 'Swiggy', description: 'd', experience: null, location: null, url: null, notes: null, status: 'applied' });
updateJob(job.id, { tailored_markdown: RESUME });

const prompts = [];
const ask = (n) => async (system, prompt) => { prompts.push(prompt); return { feedback: n > 1 ? { score: 6, landed: 'x', stronger: 'y' } : null, question: `Q${n}?`, final: null }; };
const decide = async (system, prompt) => { prompts.push(prompt); return { feedback: { score: 4, landed: 'x', stronger: 'y' }, question: null, final: { decision: 'NO HIRE', reason: 'Could not prove the 40%.' } }; };

test('eight questions one at a time, answers remembered, then a final verdict; nothing after it', async () => {
  let msgs = await interviewTurn(getJobRow(job.id), '', ask(1));
  assert.deepEqual(msgs.map((m) => m.role), ['interviewer']);
  await assert.rejects(interviewTurn(getJobRow(job.id), '', async () => ({ feedback: null, question: null, final: null })), /did not reply properly/);
  assert.equal(listInterview(job.id).length, 1, 'a failed restart keeps the interview');

  for (let n = 2; n <= 8; n++) msgs = await interviewTurn(getJobRow(job.id), `answer ${n - 1}`, ask(n));
  assert.match(prompts.at(-1), /CANDIDATE: answer 6/);
  assert.match(prompts.at(-1), /ask question 8 of 8/);

  await assert.rejects(interviewTurn(getJobRow(job.id), 'answer 8', ask(9)), /did not reply properly/); // 9th question refused
  msgs = await interviewTurn(getJobRow(job.id), 'answer 8', decide);
  assert.equal(msgs.length, 17); // 8 questions, 8 answers, the verdict
  assert.deepEqual(msgs.at(-1).final, { decision: 'NO HIRE', reason: 'Could not prove the 40%.' });
  assert.equal(msgs.at(-1).feedback.score, 4);
  await assert.rejects(interviewTurn(getJobRow(job.id), 'one more', decide), /interview is over/);

  msgs = await interviewTurn(getJobRow(job.id), '', ask(1)); // start over
  assert.equal(msgs.length, 1);
});

test('an answer without feedback is refused and not stored', async () => {
  await interviewTurn(getJobRow(job.id), '', ask(1));
  await assert.rejects(interviewTurn(getJobRow(job.id), 'my answer', async () => ({ feedback: null, question: 'Q2?', final: null })), /did not score/);
  assert.equal(listInterview(job.id).length, 1);
});

test('keyword check: code overrides the model where the text decides', () => {
  const check = { score: 70, keywords: [
    { keyword: 'Python', status: 'missing', fix: null }, // present -> at least weak
    { keyword: 'Kafka', status: 'covered', fix: null }, // absent -> missing
    { keyword: 'latency', status: 'covered', fix: null },
  ] };
  assert.deepEqual(correctCheck(check, RESUME).keywords.map((k) => k.status), ['weak', 'missing', 'covered']);
});

test('keyword matching ignores bold markers and singular/plural, but stays exact for acronyms and C/C++', async () => {
  const { hasKeyword } = await import('../src/resumeFormat.js');
  assert.ok(hasKeyword('using **Terraform** and **CI/CD** pipelines', 'CI/CD pipelines'));
  assert.ok(hasKeyword('PostgreSQL (relational database)', 'Relational databases'));
  assert.ok(hasKeyword('Built 15 REST APIs', 'API'));
  assert.ok(!hasKeyword('Built with AW tools', 'AWS'));
  assert.ok(!hasKeyword('Wrote C++ and C#', 'C'));
  assert.ok(hasKeyword('Wrote C++', 'C++'));
  assert.ok(!hasKeyword('Used Java', 'JavaScript'));
});
