// Gmail sync: polls each connected inbox over IMAP (works on localhost; no public webhook URL needed), asks the LLM
// which application an email is about and what happened, and moves the card. Every move is recorded and can be undone.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { dataDir, db, getJobRow, statusKeys, updateJob } from './db.js';
import { completeJSON } from './llm.js';
import { EMAIL_SYSTEM, emailPrompt } from './prompts.js';
import { EmailSchema } from './schemas.js';

const POLL_MINUTES = Number(process.env.MAIL_POLL_MINUTES) || 5;
const FIRST_SYNC_DAYS = 14;
const MIN_CONFIDENCE = 0.7;

// ---- App-password encryption at rest (AES-256-GCM). Key from MAIL_SECRET, else a random key kept in the data dir.
function key() {
  let secret = process.env.MAIL_SECRET;
  if (!secret) {
    const file = path.join(dataDir, 'mail.key');
    if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    secret = fs.readFileSync(file, 'utf8').trim();
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(blob) {
  const [iv, tag, data] = blob.split('.').map((s) => Buffer.from(s, 'base64url'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

// ---- Rules (pure)
// Email kinds move cards to these lanes, when the user has them.
const KIND_TO_STATUS = {
  application_received: 'applied',
  shortlisted: 'accepted',
  interview: 'interview',
  offer: 'offer',
  rejection: 'rejected',
};
/**
 * `order` is the user's lanes, left to right. Cards only move forward in that order, so a late confirmation never drags
 * an interview back; rejection can land from any open stage. Lanes the user removed are never targets.
 */
export function canMove(current, target, order) {
  if (!target || current === target || !order.includes(target) || current === 'hired' || current === 'rejected') return false;
  if (target === 'rejected') return true;
  const from = order.indexOf(current);
  return from !== -1 && order.indexOf(target) > from;
}

const JOB_WORDS = /\b(application|applied|applying|interview|candidacy|candidate|position|role|recruit\w*|hiring|offer|unfortunately|next steps|assessment|shortlist\w*|take-home)\b/i;

/** Cheap pre-filter so only plausible job mail costs an LLM call. */
export function looksRelevant(email, jobs) {
  const head = `${email.from} ${email.subject}`.toLowerCase();
  const body = email.text.slice(0, 3000).toLowerCase();
  return jobs.some((j) => head.includes(j.company.toLowerCase()) || body.includes(j.company.toLowerCase()))
    || JOB_WORDS.test(`${email.subject} ${email.text.slice(0, 1500)}`);
}

const classifyWithLlm = (email, jobs) => completeJSON(EMAIL_SYSTEM, emailPrompt({ email, jobs }), EmailSchema, { maxTokens: 1000 });

/**
 * Match one email to an application and move its card when the email clearly advances it.
 * Returns the recorded event, or null when the email is skipped. `classify` is injectable for tests.
 */
export async function processEmail(userId, email, classify = classifyWithLlm) {
  const jobs = db.prepare('SELECT id, title, company, status FROM jobs WHERE user_id = ?').all(userId);
  if (!jobs.length || !looksRelevant(email, jobs)) return null;
  if (db.prepare('SELECT 1 FROM job_emails WHERE user_id = ? AND message_id = ?').get(userId, email.messageId)) return null;

  const verdict = await classify(email, jobs);
  const job = jobs.find((j) => j.id === verdict.job_id);
  if (!job || verdict.kind === 'not_job_related') return null;

  const target = KIND_TO_STATUS[verdict.kind];
  const move = verdict.confidence >= MIN_CONFIDENCE && canMove(job.status, target, statusKeys(userId));
  const now = new Date().toISOString();
  return db.transaction(() => {
    if (move) {
      const { minPos } = db.prepare('SELECT MIN(position) AS minPos FROM jobs WHERE user_id = ? AND status = ?').get(userId, target);
      updateJob(job.id, { status: target, position: (minPos ?? 1) - 1 });
    }
    const info = db.prepare(`
      INSERT INTO job_emails (user_id, job_id, message_id, sender, subject, received_at, kind, summary, confidence, moved_from, moved_to, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(userId, job.id, email.messageId, email.from, email.subject, email.date, verdict.kind, verdict.summary,
      verdict.confidence, move ? job.status : null, move ? target : null, now);
    return db.prepare('SELECT * FROM job_emails WHERE id = ?').get(info.lastInsertRowid);
  })();
}

/** Put the card back where it was, unless it has been moved again since. */
export function undoEmailMove(userId, eventId) {
  const ev = db.prepare('SELECT * FROM job_emails WHERE id = ? AND user_id = ?').get(eventId, userId);
  if (!ev) throw Object.assign(new Error('Email not found'), { status: 404 });
  if (!ev.moved_to || ev.undone) throw Object.assign(new Error('Nothing to undo'), { status: 400 });
  const job = getJobRow(ev.job_id);
  if (job.status !== ev.moved_to) throw Object.assign(new Error('The card has been moved since; drag it back instead'), { status: 409 });
  if (!statusKeys(userId).includes(ev.moved_from)) throw Object.assign(new Error('The lane it came from has been removed; drag the card instead'), { status: 409 });
  db.transaction(() => {
    updateJob(job.id, { status: ev.moved_from });
    db.prepare('UPDATE job_emails SET undone = 1 WHERE id = ?').run(ev.id);
  })();
  return db.prepare('SELECT * FROM job_emails WHERE id = ?').get(ev.id);
}

// ---- IMAP
function client(email, password) {
  return new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: email, pass: password }, logger: false });
}

function friendly(err) {
  const text = `${err.responseText || ''} ${err.message || ''}`;
  if (err.authenticationFailed || /AUTHENTICATIONFAILED|Invalid credentials|Application-specific password/i.test(text)) {
    return 'Gmail rejected the address or app password. Create a new app password and try again.';
  }
  if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') return 'Could not reach Gmail. Check your internet connection.';
  return err.message || String(err);
}

export async function verifyGmail(email, password) {
  const c = client(email, password);
  try {
    await c.connect();
    await c.logout();
  } catch (err) {
    throw Object.assign(new Error(friendly(err)), { status: 400 });
  }
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

async function fetchNewEmails(account, password) {
  const c = client(account.email, password);
  await c.connect();
  const lock = await c.getMailboxLock('INBOX');
  try {
    const uids = account.last_uid == null
      ? await c.search({ since: new Date(Date.now() - FIRST_SYNC_DAYS * 864e5) }, { uid: true })
      : (await c.search({ uid: `${account.last_uid + 1}:*` }, { uid: true })).filter((u) => u > account.last_uid);
    const emails = [];
    if (uids.length) {
      for await (const msg of c.fetch(uids, { uid: true, source: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source);
        const body = parsed.text || clean(String(parsed.html || '').replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, ' '));
        emails.push({
          uid: msg.uid,
          messageId: parsed.messageId || `uid-${msg.uid}`,
          from: parsed.from?.text || '',
          subject: parsed.subject || '',
          date: (parsed.date || new Date()).toISOString(),
          text: clean(body).slice(0, 6000),
        });
      }
    }
    const nextUid = c.mailbox.uidNext - 1;
    return { emails: emails.sort((a, b) => a.uid - b.uid), nextUid };
  } finally {
    lock.release();
    await c.logout().catch(() => {});
  }
}

const running = new Set();

/** Fetch and process new mail for one user. Errors are stored on the account rather than thrown. */
export async function checkMailbox(userId) {
  const account = db.prepare('SELECT * FROM mail_accounts WHERE user_id = ?').get(userId);
  if (!account || running.has(userId)) return { checked: false };
  running.add(userId);
  const events = [];
  try {
    const { emails, nextUid } = await fetchNewEmails(account, decrypt(account.secret));
    const saveUid = db.prepare('UPDATE mail_accounts SET last_uid = ? WHERE user_id = ?');
    for (const email of emails) {
      if (!email.from.toLowerCase().includes(account.email.toLowerCase())) {
        const ev = await processEmail(userId, email);
        if (ev) events.push(ev);
      }
      saveUid.run(email.uid, userId); // progress is saved per email, so a failure never reprocesses earlier mail
    }
    db.prepare('UPDATE mail_accounts SET last_uid = MAX(COALESCE(last_uid, 0), ?), last_checked = ?, last_error = NULL WHERE user_id = ?')
      .run(nextUid, new Date().toISOString(), userId);
  } catch (err) {
    console.error(`Mail check for user ${userId} failed:`, err);
    db.prepare('UPDATE mail_accounts SET last_checked = ?, last_error = ? WHERE user_id = ?').run(new Date().toISOString(), friendly(err), userId);
  } finally {
    running.delete(userId);
  }
  return { checked: true, events };
}

export function startMailPoller() {
  const tick = async () => {
    for (const { user_id: userId } of db.prepare('SELECT user_id FROM mail_accounts').all()) await checkMailbox(userId);
  };
  setTimeout(tick, 10_000);
  setInterval(tick, POLL_MINUTES * 60_000).unref();
}
