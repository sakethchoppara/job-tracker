import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toStructured } from './resumeFormat.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS jobs_user ON jobs (user_id, status, position);
`);

export const STATUSES = ['saved', 'applied', 'screening', 'interviewing', 'offer', 'rejected'];

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
  };
}

const UPDATABLE = new Set([
  'title', 'company', 'description', 'experience', 'location', 'url', 'notes', 'status', 'position',
  'ai_status', 'ai_stage', 'ai_error', 'ai_filled', 'tailored_markdown', 'tailored_edited', 'analysis', 'tailoring',
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
