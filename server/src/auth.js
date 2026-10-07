// Username/password auth with opaque session tokens in an httpOnly cookie (only a SHA-256 of the token is stored).
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { db } from './db.js';

const COOKIE = 'sid';
const SESSION_DAYS = 30;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

export const hashPassword = (password) => bcrypt.hash(password, 12);
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);

function readCookie(req, name) {
  for (const part of (req.headers.cookie || '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export function startSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 864e5);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sha256(token), userId, expires.toISOString());
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: req.secure, expires, path: '/' });
}

export function endSession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
  res.clearCookie(COOKIE, { path: '/' });
}

export function currentUser(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  return db.prepare(`
    SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(sha256(token), new Date().toISOString()) || null;
}

export function requireAuth(req, res, next) {
  req.user = currentUser(req);
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  next();
}
