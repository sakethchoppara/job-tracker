import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-status-test-'));
const { db, addStatus, removeStatus, getStatuses, insertJob } = await import('../src/db.js');

const userId = Number(db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES ('s', 'x', '')").run().lastInsertRowid);
const keys = () => getStatuses(userId).map((s) => s.key);

test('a new user starts with the default lanes', () => {
  assert.deepEqual(keys(), ['saved', 'applied', 'accepted', 'interview', 'offer', 'hired', 'rejected']);
});

test('adds a lane after the chosen one, with a unique key', () => {
  addStatus(userId, { label: 'Phone screen', color: '#8b5cf6', after: 'applied' });
  assert.deepEqual(keys().slice(0, 4), ['saved', 'applied', 'phone_screen', 'accepted']);
  assert.throws(() => addStatus(userId, { label: 'phone SCREEN', color: '#8b5cf6' }), /already/);
  addStatus(userId, { label: 'Phone screen!', color: '#8b5cf6' }); // different label, same slug
  assert.equal(keys().at(-1), 'phone_screen_2');
});

test('validates the name and colour', () => {
  assert.throws(() => addStatus(userId, { label: '  ', color: '#000000' }), /name/);
  assert.throws(() => addStatus(userId, { label: 'X', color: 'red' }), /colour/);
});

test('only empty lanes can be removed, and positions stay contiguous', () => {
  insertJob({ user_id: userId, title: 't', company: 'c', description: 'd', experience: null, location: null, url: null, notes: null, status: 'phone_screen' });
  assert.throws(() => removeStatus(userId, 'phone_screen'), /Move the 1 card/);
  removeStatus(userId, 'accepted');
  assert.equal(keys().includes('accepted'), false);
  assert.deepEqual(getStatuses(userId).map((s) => s.position), keys().map((_, i) => i));
});

test('the last lane cannot be removed', () => {
  db.prepare('DELETE FROM jobs WHERE user_id = ?').run(userId);
  for (const k of keys().slice(1)) removeStatus(userId, k);
  assert.throws(() => removeStatus(userId, keys()[0]), /at least one/);
});
