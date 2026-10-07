import { Router } from 'express';
import { currentUser, endSession, hashPassword, startSession, verifyPassword } from '../auth.js';
import { db, getResume } from '../db.js';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;

const profile = (user) => ({ user, hasResume: !!getResume(user.id) });

router.post('/register', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Username must be 3–32 characters: letters, numbers, _ . -' });
  }
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    return res.status(409).json({ error: 'That username is taken' });
  }
  const info = db.prepare('INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)')
    .run(username, await hashPassword(password), new Date().toISOString());
  const user = { id: Number(info.lastInsertRowid), username };
  startSession(req, res, user.id);
  res.status(201).json(profile(user));
});

router.post('/login', async (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Same message for unknown user and wrong password.
  if (!row || !(await verifyPassword(password, row.password_hash))) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  startSession(req, res, row.id);
  res.json(profile({ id: row.id, username: row.username }));
});

router.post('/logout', (req, res) => {
  endSession(req, res);
  res.status(204).end();
});

router.get('/me', (req, res) => {
  const user = currentUser(req);
  res.json(user ? profile(user) : { user: null, hasResume: false });
});

export default router;
