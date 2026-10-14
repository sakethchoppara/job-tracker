import { Router } from 'express';
import { db, getUserJob, serializeJob, getJobRow } from '../db.js';
import { checkMailbox, encrypt, undoEmailMove, verifyGmail } from '../mail.js';

const router = Router();

function status(userId) {
  const account = db.prepare('SELECT email, last_checked, last_error, created_at FROM mail_accounts WHERE user_id = ?').get(userId) || null;
  const events = db.prepare(`
    SELECT e.*, j.title AS job_title, j.company AS job_company FROM job_emails e JOIN jobs j ON j.id = e.job_id
    WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 30
  `).all(userId);
  return { account, events };
}

router.get('/', (req, res) => res.json(status(req.user.id)));

// Connect (or replace) the Gmail account. The app password is verified against Gmail before it is stored.
router.put('/', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.appPassword || '').replace(/\s+/g, ''); // Google shows it as "abcd efgh ijkl mnop"
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Enter your Gmail address' });
  if (password.length < 16) return res.status(400).json({ error: 'App passwords are 16 characters long' });
  await verifyGmail(email, password);
  db.prepare(`
    INSERT INTO mail_accounts (user_id, email, secret, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      secret = excluded.secret, last_error = NULL,
      last_uid = CASE WHEN mail_accounts.email = excluded.email THEN mail_accounts.last_uid END,
      email = excluded.email
  `).run(req.user.id, email, encrypt(password), new Date().toISOString());
  checkMailbox(req.user.id); // first sync runs in the background
  res.json(status(req.user.id));
});

router.delete('/', (req, res) => {
  db.prepare('DELETE FROM mail_accounts WHERE user_id = ?').run(req.user.id);
  res.json(status(req.user.id));
});

router.post('/check', async (req, res) => {
  await checkMailbox(req.user.id);
  res.json(status(req.user.id));
});

router.post('/events/:id/undo', (req, res) => {
  const ev = undoEmailMove(req.user.id, Number(req.params.id));
  res.json({ event: ev, job: serializeJob(getJobRow(ev.job_id)) });
});

router.get('/jobs/:id', (req, res) => {
  if (!getUserJob(Number(req.params.id), req.user.id)) return res.status(404).json({ error: 'Job not found' });
  res.json(db.prepare('SELECT * FROM job_emails WHERE job_id = ? ORDER BY received_at DESC').all(Number(req.params.id)));
});

export default router;
