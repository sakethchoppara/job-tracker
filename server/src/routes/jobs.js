import { Router } from 'express';
import {
  STATUSES, db, getJobRow, getResume, getUserJob, insertJob, serializeJob, updateJob,
} from '../db.js';
import { checkResume, startProcessing } from '../jobProcessor.js';
import { renderDocx, renderPdf } from '../resumeFormat.js';

const router = Router();
export const FORMATS = ['pdf', 'docx', 'md'];

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

function findJob(req, res) {
  const row = getUserJob(Number(req.params.id), req.user.id);
  if (!row) res.status(404).json({ error: 'Job not found' });
  return row;
}

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM jobs WHERE user_id = ? ORDER BY status, position, id').all(req.user.id);
  res.json(rows.map(serializeJob));
});

router.post('/', (req, res) => {
  const { title, company, description } = req.body;
  if (!clean(title) || !clean(company) || !clean(description)) {
    return res.status(400).json({ error: 'Job title, company and description are required' });
  }
  const status = STATUSES.includes(req.body.status) ? req.body.status : 'saved';
  const row = insertJob({
    user_id: req.user.id,
    title: clean(title),
    company: clean(company),
    description: description.trim(),
    experience: clean(req.body.experience),
    location: clean(req.body.location),
    url: clean(req.body.url),
    notes: clean(req.body.notes),
    status,
  });
  startProcessing(row.id);
  res.status(201).json(serializeJob(getJobRow(row.id)));
});

// Persist a drag-and-drop result: { columns: { applied: [3, 1, 7], saved: [2] } }
router.put('/order', (req, res) => {
  const columns = req.body.columns || {};
  const stmt = db.prepare('UPDATE jobs SET status = ?, position = ?, updated_at = ? WHERE id = ? AND user_id = ?');
  const ts = new Date().toISOString();
  db.transaction(() => {
    for (const [status, ids] of Object.entries(columns)) {
      if (!STATUSES.includes(status) || !Array.isArray(ids)) continue;
      ids.forEach((id, index) => stmt.run(status, index, ts, Number(id), req.user.id));
    }
  })();
  res.json({ ok: true });
});

router.patch('/:id', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const fields = {};
  for (const key of ['title', 'company', 'description', 'experience', 'location', 'url', 'notes']) {
    if (key in req.body) fields[key] = clean(req.body[key]);
  }
  if (('title' in fields && !fields.title) || ('company' in fields && !fields.company) || ('description' in fields && !fields.description)) {
    return res.status(400).json({ error: 'Job title, company and description cannot be empty' });
  }
  if ('status' in req.body) {
    if (!STATUSES.includes(req.body.status)) return res.status(400).json({ error: 'Invalid status' });
    fields.status = req.body.status;
  }
  // A field the user touched is no longer "AI-filled".
  const aiFilled = JSON.parse(row.ai_filled).filter((f) => !(f in fields) || fields[f] === row[f]);
  res.json(serializeJob(updateJob(row.id, { ...fields, ai_filled: aiFilled })));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
  res.status(204).end();
});

function runStage(stage) {
  return (req, res) => {
    const row = findJob(req, res);
    if (!row) return;
    if (row.ai_status === 'processing') return res.status(409).json({ error: 'Already processing' });
    if (!getResume(req.user.id)) return res.status(400).json({ error: 'Upload your resume first' });
    if (stage === 'tailor' && !row.analysis) return res.status(400).json({ error: 'Run the analysis first' });
    startProcessing(row.id, { stage, instructions: clean(req.body?.instructions) });
    res.json(serializeJob(getJobRow(row.id)));
  };
}

// Stage 1: recruiter analysis (also runs automatically on create).
router.post('/:id/analyze', runStage('analyze'));
// Stages 2 + 3: accept the analysis -> rewrite experience -> ATS/skim pass. Optional { instructions }.
router.post('/:id/tailor', runStage('tailor'));

// Save a manual edit of the tailored resume.
router.put('/:id/resume', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const markdown = clean(req.body.markdown);
  if (!markdown) return res.status(400).json({ error: 'Resume cannot be empty' });
  const tailoring = { ...JSON.parse(row.tailoring || '{}'), ...checkResume(markdown, JSON.parse(row.analysis || 'null')) };
  res.json(serializeJob(updateJob(row.id, { tailored_markdown: markdown, tailored_edited: 1, tailoring })));
});

export async function sendResume(res, markdown, format, baseName) {
  const filename = `${baseName.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'Resume'}.${format}`;
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (format === 'pdf') return res.type('application/pdf').send(await renderPdf(markdown));
  if (format === 'docx') {
    return res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(await renderDocx(markdown));
  }
  return res.type('text/markdown').send(markdown);
}

router.get('/:id/resume.:format', async (req, res) => {
  if (!FORMATS.includes(req.params.format)) return res.status(400).json({ error: 'Unsupported format' });
  const row = findJob(req, res);
  if (!row) return;
  if (!row.tailored_markdown) return res.status(404).json({ error: 'No tailored resume for this job yet' });
  const name = row.tailored_markdown.match(/^#\s+(.+)$/m)?.[1] || 'Resume';
  await sendResume(res, row.tailored_markdown, req.params.format, `${name} ${row.company} Resume`);
});

export default router;
