import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toStructured } from './resumeFormat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, 'job-tracker.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS resumes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT,
    pdf BLOB,                 -- the original upload
    raw_text TEXT NOT NULL,   -- text layer extracted from the PDF (may be empty for scans)
    markdown TEXT NOT NULL,   -- editable source used for tailoring and rendering
    structured TEXT NOT NULL, -- JSON derived from markdown: contact, sections, entries, skills
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    description TEXT NOT NULL,
    experience TEXT,
    location TEXT,
    url TEXT,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'saved',
    position REAL NOT NULL DEFAULT 0,
    ai_status TEXT NOT NULL DEFAULT 'idle', -- processing | analyzed | done | no_resume | error
    ai_stage TEXT,                          -- while processing: analyze | rewrite | skim
    ai_error TEXT,
    ai_filled TEXT NOT NULL DEFAULT '[]',
    tailored_markdown TEXT,
    tailored_edited INTEGER NOT NULL DEFAULT 0,
    analysis TEXT,  -- JSON: stage 1 recruiter analysis
    tailoring TEXT, -- JSON: stage 2 + 3 notes and code-verified checks
    cover_letter TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_user ON jobs (user_id, status, position);
`);

// Gmail sync: one connected mailbox per user, and every job-related email it matched.
db.exec(`
  CREATE TABLE IF NOT EXISTS mail_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    secret TEXT NOT NULL,        -- app password, AES-256-GCM encrypted (see mail.js)
    last_uid INTEGER,            -- highest IMAP UID already processed
    last_checked TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS job_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    message_id TEXT NOT NULL,
    sender TEXT,
    subject TEXT,
    received_at TEXT,
    kind TEXT NOT NULL,          -- application_received | shortlisted | interview | offer | rejection | other
    summary TEXT,
    confidence REAL,
    moved_from TEXT,             -- set when this email moved the card
    moved_to TEXT,
    undone INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, message_id)
  );
  CREATE INDEX IF NOT EXISTS job_emails_job ON job_emails (job_id);
`);

// Resume coach: the conversation per job is the coach's memory. An assistant turn may carry a proposed full resume.
db.exec(`
  CREATE TABLE IF NOT EXISTS resume_chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    role TEXT NOT NULL,          -- user | assistant
    content TEXT NOT NULL,
    proposal TEXT,               -- proposed tailored resume (Markdown), assistant turns only
    change_summary TEXT,
    based_on TEXT,               -- hash of the resume the proposal was made against
    applied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS resume_chat_job ON resume_chat (job_id, id);
`);

// Mock interview: a skeptical hiring manager asks 8 questions one at a time and scores each answer.
db.exec(`
  CREATE TABLE IF NOT EXISTS interview_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    role TEXT NOT NULL,          -- interviewer | candidate
    content TEXT NOT NULL,       -- the question, or the candidate's answer
    feedback TEXT,               -- JSON on interviewer turns after an answer: { score, landed, stronger }
    final TEXT,                  -- JSON on the last interviewer turn: { decision, reason }
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS interview_job ON interview_messages (job_id, id);
`);

// Portfolio projects the agent builds for a job's missing keywords. Files live in data/projects/<id>/.
db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    keywords TEXT NOT NULL,      -- JSON array the user asked for
    status TEXT NOT NULL,        -- building | verifying | publishing | updating_resume | done | failed
    failed_stage TEXT,
    error TEXT,
    visibility TEXT NOT NULL DEFAULT 'private',
    details TEXT,                -- JSON from the builder: title, repo_name, summary, stack, how_to_run, verification, talking points
    log TEXT NOT NULL DEFAULT '[]', -- JSON: recent agent activity, newest last
    repo_url TEXT,
    resume_before TEXT,          -- tailored resume before the project was added (for Undo)
    resume_after TEXT,
    resume_note TEXT,            -- change summary, or why the resume was not updated yet
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);
for (const [col, def] of [['failed_stage', 'TEXT'], ['visibility', "TEXT NOT NULL DEFAULT 'private'"], ['log', "TEXT NOT NULL DEFAULT '[]'"],
  ['repo_url', 'TEXT'], ['resume_before', 'TEXT'], ['resume_after', 'TEXT'], ['resume_note', 'TEXT']]) {
  if (!db.prepare('PRAGMA table_info(portfolio_projects)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE portfolio_projects ADD COLUMN ${col} ${def}`);
}

// Columns added after the first release.
for (const col of ['cover_letter', 'panel']) { // panel: JSON, latest hiring-panel run (see panel.js)
  if (!db.prepare('PRAGMA table_info(jobs)').all().some((c) => c.name === col)) db.exec(`ALTER TABLE jobs ADD COLUMN ${col} TEXT`);
}

// Board lanes are per-user. Everyone starts with these; keys are what jobs.status stores.
db.exec(`
  CREATE TABLE IF NOT EXISTS statuses (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    label TEXT NOT NULL,
    color TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
`);

export const DEFAULT_STATUSES = [
  ['saved', 'Saved', '#64748b'],
  ['applied', 'Applied', '#0ea5e9'],
  ['accepted', 'Accepted', '#14b8a6'],
  ['interview', 'Interview', '#f59e0b'],
  ['offer', 'Offer', '#84cc16'],
  ['hired', 'Hired', '#10b981'],
  ['rejected', 'Rejected', '#f43f5e'],
];

// Status names from earlier versions, mapped once when a user's lanes are first created (never again, so a lane the
// user later names "Screening" is left alone).
const LEGACY_STATUSES = { screening: 'applied', mail_received: 'applied', interviewing: 'interview' };

export function ensureStatuses(userId) {
  if (db.prepare('SELECT 1 FROM statuses WHERE user_id = ?').get(userId)) return;
  db.transaction(() => {
    const ins = db.prepare('INSERT INTO statuses (user_id, key, label, color, position) VALUES (?, ?, ?, ?, ?)');
    DEFAULT_STATUSES.forEach(([key, label, color], i) => ins.run(userId, key, label, color, i));
    for (const [from, to] of Object.entries(LEGACY_STATUSES)) {
      db.prepare('UPDATE jobs SET status = ? WHERE user_id = ? AND status = ?').run(to, userId, from);
      db.prepare('UPDATE job_emails SET moved_from = ? WHERE user_id = ? AND moved_from = ?').run(to, userId, from);
      db.prepare('UPDATE job_emails SET moved_to = ? WHERE user_id = ? AND moved_to = ?').run(to, userId, from);
    }
    db.prepare('UPDATE job_emails SET moved_from = NULL, moved_to = NULL WHERE user_id = ? AND moved_from = moved_to').run(userId);
    db.prepare(`UPDATE jobs SET status = 'saved' WHERE user_id = ? AND status NOT IN (SELECT key FROM statuses WHERE user_id = ?)`).run(userId, userId);
  })();
}
for (const { id } of db.prepare('SELECT id FROM users').all()) ensureStatuses(id);

/** The user's lanes in board order, each with how many cards it holds. */
export function getStatuses(userId) {
  ensureStatuses(userId);
  return db.prepare(`
    SELECT key, label, color, position,
      (SELECT COUNT(*) FROM jobs j WHERE j.user_id = s.user_id AND j.status = s.key) AS count
    FROM statuses s WHERE user_id = ? ORDER BY position
  `).all(userId);
}

export const statusKeys = (userId) => getStatuses(userId).map((s) => s.key);

const fail = (status, message) => Object.assign(new Error(message), { status });

/** Add a lane after `after` (a key; omitted = at the end). Returns the updated lanes. */
export function addStatus(userId, { label, color, after }) {
  label = String(label || '').trim().replace(/\s+/g, ' ');
  if (!label || label.length > 30) throw fail(400, 'Give the status a name of up to 30 characters');
  if (!/^#[0-9a-f]{6}$/i.test(String(color))) throw fail(400, 'Pick a colour');
  const lanes = getStatuses(userId);
  if (lanes.some((s) => s.label.toLowerCase() === label.toLowerCase())) throw fail(409, `There is already a “${label}” status`);
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'status';
  let key = base;
  for (let i = 2; lanes.some((s) => s.key === key); i++) key = `${base}_${i}`;
  const afterIndex = after ? lanes.findIndex((s) => s.key === after) : -1;
  const position = afterIndex === -1 ? lanes.length : afterIndex + 1;
  db.transaction(() => {
    db.prepare('UPDATE statuses SET position = position + 1 WHERE user_id = ? AND position >= ?').run(userId, position);
    db.prepare('INSERT INTO statuses (user_id, key, label, color, position) VALUES (?, ?, ?, ?, ?)').run(userId, key, label, color, position);
  })();
  return getStatuses(userId);
}

/** Remove a lane; only allowed when it holds no cards and is not the last one. Returns the updated lanes. */
export function removeStatus(userId, key) {
  const lanes = getStatuses(userId);
  const lane = lanes.find((s) => s.key === key);
  if (!lane) throw fail(404, 'Status not found');
  if (lane.count > 0) throw fail(409, `Move the ${lane.count} card${lane.count === 1 ? '' : 's'} out of “${lane.label}” before removing it`);
  if (lanes.length === 1) throw fail(400, 'The board needs at least one status');
  db.transaction(() => {
    db.prepare('DELETE FROM statuses WHERE user_id = ? AND key = ?').run(userId, key);
    db.prepare('UPDATE statuses SET position = position - 1 WHERE user_id = ? AND position > ?').run(userId, lane.position);
  })();
  return getStatuses(userId);
}

const now = () => new Date().toISOString();

// Everything except the PDF bytes.
export function getResume(userId) {
  const row = db.prepare(`
    SELECT user_id, filename, raw_text, markdown, structured, updated_at, pdf IS NOT NULL AS has_pdf
    FROM resumes WHERE user_id = ?
  `).get(userId);
  return row ? { ...row, structured: JSON.parse(row.structured), has_pdf: !!row.has_pdf } : null;
}

export function getResumePdf(userId) {
  return db.prepare('SELECT filename, pdf FROM resumes WHERE user_id = ? AND pdf IS NOT NULL').get(userId) || null;
}

// Omit `pdf` / `raw_text` to keep the stored ones (e.g. when saving a manual edit).
export function saveResume(userId, { filename, pdf = null, raw_text = null, markdown }) {
  db.prepare(`
    INSERT INTO resumes (user_id, filename, pdf, raw_text, markdown, structured, updated_at)
    VALUES (@user_id, @filename, @pdf, COALESCE(@raw_text, ''), @markdown, @structured, @updated_at)
    ON CONFLICT(user_id) DO UPDATE SET
      filename = COALESCE(excluded.filename, filename),
      pdf = COALESCE(@pdf, pdf),
      raw_text = COALESCE(@raw_text, raw_text),
      markdown = excluded.markdown, structured = excluded.structured, updated_at = excluded.updated_at
  `).run({
    user_id: userId, filename: filename ?? null, pdf, raw_text, markdown,
    structured: JSON.stringify(toStructured(markdown)), updated_at: now(),
  });
  return getResume(userId);
}

// Unscoped lookup — only for internal use after ownership has been checked.
export function getJobRow(id) {
  return db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) || null;
}

export function getUserJob(id, userId) {
  return db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(id, userId) || null;
}

export function serializeJob(row) {
  if (!row) return null;
  return {
    ...row,
    ai_filled: JSON.parse(row.ai_filled || '[]'),
    analysis: row.analysis ? JSON.parse(row.analysis) : null,
    tailoring: row.tailoring ? JSON.parse(row.tailoring) : null,
    tailored_edited: !!row.tailored_edited,
    panel: row.panel ? JSON.parse(row.panel) : null,
  };
}

const UPDATABLE = new Set([
  'title', 'company', 'description', 'experience', 'location', 'url', 'notes', 'status', 'position',
  'ai_status', 'ai_stage', 'ai_error', 'ai_filled', 'tailored_markdown', 'tailored_edited', 'analysis', 'tailoring', 'cover_letter', 'panel',
]);

export function updateJob(id, fields) {
  const keys = Object.keys(fields).filter((k) => UPDATABLE.has(k));
  if (!keys.length) return getJobRow(id);
  const values = { id, updated_at: now() };
  for (const k of keys) {
    const v = fields[k];
    values[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  }
  const set = [...keys.map((k) => `${k} = @${k}`), 'updated_at = @updated_at'].join(', ');
  db.prepare(`UPDATE jobs SET ${set} WHERE id = @id`).run(values);
  return getJobRow(id);
}

export function insertJob(job) {
  const ts = now();
  const { minPos } = db.prepare('SELECT MIN(position) AS minPos FROM jobs WHERE user_id = ? AND status = ?')
    .get(job.user_id, job.status);
  const info = db.prepare(`
    INSERT INTO jobs (user_id, title, company, description, experience, location, url, notes, status, position,
                      ai_status, created_at, updated_at)
    VALUES (@user_id, @title, @company, @description, @experience, @location, @url, @notes, @status, @position,
            'processing', @ts, @ts)
  `).run({ ...job, position: (minPos ?? 1) - 1, ts });
  return getJobRow(info.lastInsertRowid);
}
