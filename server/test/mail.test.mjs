import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-mail-test-'));
const { db, insertJob, getJobRow } = await import('../src/db.js');
const { canMove, looksRelevant, processEmail, undoEmailMove, encrypt, decrypt } = await import('../src/mail.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('u', 'x', '')").run().lastInsertRowid);
const job = insertJob({ user_id: userId, title: 'Backend Engineer', company: 'Swiggy', description: 'd', experience: null, location: null, url: null, notes: null, status: 'applied' });
let n = 0;
const email = (subject, text = 'Thanks for your application to Swiggy.') => ({ messageId: `<m${++n}@x>`, from: 'Swiggy Careers <jobs@swiggy.in>', subject, date: new Date().toISOString(), text });
const says = (kind, confidence = 0.95, jobId = job.id) => async () => ({ job_id: jobId, kind, summary: kind, confidence });

test('moves only forward in the user\'s lane order; rejection from any open stage', () => {
  const order = ['saved', 'applied', 'accepted', 'interview', 'offer', 'hired', 'rejected'];
  assert.equal(canMove('applied', 'interview', order), true);
  assert.equal(canMove('interview', 'applied', order), false);
  assert.equal(canMove('saved', 'applied', order), true);
  assert.equal(canMove('offer', 'rejected', order), true);
  assert.equal(canMove('hired', 'rejected', order), false);
  assert.equal(canMove('rejected', 'interview', order), false);
  // a removed lane is never a target; a custom lane counts by its position
  assert.equal(canMove('applied', 'interview', ['saved', 'applied', 'offer', 'rejected']), false);
  assert.equal(canMove('phone_screen', 'interview', ['saved', 'applied', 'phone_screen', 'interview']), true);
});

test('pre-filter skips unrelated mail', () => {
  const jobs = [{ company: 'Swiggy' }];
  assert.equal(looksRelevant(email('Your order is on the way', 'Pizza delivered'), [{ company: 'Zomato' }]), false);
  assert.equal(looksRelevant(email('Hello', 'Swiggy team here'), jobs), true);
  assert.equal(looksRelevant(email('Interview availability', 'Are you free Tuesday?'), [{ company: 'Acme' }]), true);
});

test('app password round-trips through encryption', () => {
  const blob = encrypt('abcdefghijklmnop');
  assert.notEqual(blob, 'abcdefghijklmnop');
  assert.equal(decrypt(blob), 'abcdefghijklmnop');
});

test('an interview invite moves the card, records the email, and can be undone', async () => {
  const ev = await processEmail(userId, email('Interview invitation'), says('interview'));
  assert.equal(ev.moved_from, 'applied');
  assert.equal(getJobRow(job.id).status, 'interview');
  undoEmailMove(userId, ev.id);
  assert.equal(getJobRow(job.id).status, 'applied');
  assert.throws(() => undoEmailMove(userId, ev.id), /Nothing to undo/);
});

test('the same message is never processed twice', async () => {
  const m = email('Application received');
  const first = await processEmail(userId, m, says('application_received'));
  assert.equal(first.moved_to, null); // already in Applied: recorded, not moved
  assert.equal(await processEmail(userId, m, says('application_received')), null);
  assert.equal(getJobRow(job.id).status, 'applied');
});

test('low confidence and backward moves are recorded but do not move the card', async () => {
  const unsure = await processEmail(userId, email('Next steps?'), says('offer', 0.4));
  assert.equal(unsure.moved_to, null);
  const late = await processEmail(userId, email('We received your application'), says('application_received'));
  assert.equal(late.moved_to, null);
  assert.equal(getJobRow(job.id).status, 'applied');
});

test('emails the model marks unrelated, or matched to no known job, are skipped', async () => {
  assert.equal(await processEmail(userId, email('Jobs you may like at Swiggy'), says('not_job_related')), null);
  assert.equal(await processEmail(userId, email('Interview'), says('interview', 0.9, 9999)), null);
});

test('undo refuses when the card has been moved since', async () => {
  const ev = await processEmail(userId, email('Unfortunately'), says('rejection'));
  db.prepare("UPDATE jobs SET status = 'saved' WHERE id = ?").run(job.id);
  assert.throws(() => undoEmailMove(userId, ev.id), /moved since/);
});
