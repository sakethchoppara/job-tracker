import { Router } from 'express';
import {
  db, getJobRow, getResume, getUserJob, insertJob, serializeJob, statusKeys, updateJob,
} from '../db.js';
import { saveTailoredResume, startProcessing } from '../jobProcessor.js';
import { applyProposal, chatTurn, clearChat, listChat } from '../coach.js';
import {
  archiveStream, deleteLocal, getProject, latestProjectByJob, listProjects, retryProject, startProject, undoResume,
} from '../projects.js';
import { applyPanel, startPanel, undoPanel } from '../panel.js';
import { clearInterview, interviewTurn, listInterview } from '../interview.js';
import { completeText, stripFences } from '../llm.js';
import { COVER_SYSTEM, coverPrompt } from '../prompts.js';
import { renderDocx, renderLetterDocx, renderLetterPdf, renderPdf } from '../resumeFormat.js';

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
  const projects = latestProjectByJob(req.user.id);
  res.json(rows.map((r) => ({ ...serializeJob(r), project: projects.get(r.id) || null })));
});

router.post('/', (req, res) => {
  const { title, company, description } = req.body;
  if (!clean(title) || !clean(company) || !clean(description)) {
    return res.status(400).json({ error: 'Job title, company and description are required' });
  }
  const keys = statusKeys(req.user.id);
  const status = keys.includes(req.body.status) ? req.body.status : keys[0];
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
  const keys = statusKeys(req.user.id);
  const stmt = db.prepare('UPDATE jobs SET status = ?, position = ?, updated_at = ? WHERE id = ? AND user_id = ?');
  const ts = new Date().toISOString();
  db.transaction(() => {
    for (const [status, ids] of Object.entries(columns)) {
      if (!keys.includes(status) || !Array.isArray(ids)) continue;
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
    if (!statusKeys(req.user.id).includes(req.body.status)) return res.status(400).json({ error: 'That status no longer exists' });
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
  res.json(serializeJob(saveTailoredResume(row, markdown)));
});

// "Saketh Choppara Swiggy Backend Engineer Resume" -> "Saketh_Choppara_Swiggy_Backend_Engineer_Resume.pdf"
const fileName = (base, format) => `${base.replace(/[^\w\-+ ]+/g, '').trim().replace(/\s+/g, '_') || 'Resume'}.${format}`;

export async function sendResume(res, markdown, format, baseName) {
  const filename = fileName(baseName, format);
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
  await sendResume(res, row.tailored_markdown, req.params.format, `${name} ${row.company} ${row.title} Resume`);
});

// Cover letter: written from the tailored resume when there is one, else the base resume.
router.post('/:id/cover-letter', async (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const base = getResume(req.user.id);
  if (!base) return res.status(400).json({ error: 'Upload your resume first' });
  const resume = row.tailored_markdown || base.markdown;
  const letter = stripFences(await completeText(COVER_SYSTEM, coverPrompt({ job: row, resume, instructions: clean(req.body?.instructions) }), { maxTokens: 2000 }));
  if (letter.length < 200) return res.status(502).json({ error: 'The AI returned an empty cover letter. Try again.' });
  res.json(serializeJob(updateJob(row.id, { cover_letter: letter })));
});

router.put('/:id/cover-letter', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const text = clean(req.body?.text);
  if (!text) return res.status(400).json({ error: 'Cover letter cannot be empty' });
  res.json(serializeJob(updateJob(row.id, { cover_letter: text })));
});

router.get('/:id/cover-letter.:format', async (req, res) => {
  if (!['pdf', 'docx', 'txt'].includes(req.params.format)) return res.status(400).json({ error: 'Unsupported format' });
  const row = findJob(req, res);
  if (!row) return;
  if (!row.cover_letter) return res.status(404).json({ error: 'No cover letter for this job yet' });
  const { structured } = getResume(req.user.id) || { structured: {} };
  const header = { name: structured.name, contact: (structured.contact || []).join(' | ') };
  const filename = fileName(`${header.name || ''} ${row.company} ${row.title} Cover Letter`, req.params.format);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  if (req.params.format === 'pdf') return res.type('application/pdf').send(await renderLetterPdf(row.cover_letter, header));
  if (req.params.format === 'docx') {
    return res.type('application/vnd.openxmlformats-officedocument.wordprocessingml.document').send(await renderLetterDocx(row.cover_letter, header));
  }
  res.type('text/plain').send(row.cover_letter);
});

// Resume coach conversation (its memory) for this job.
router.get('/:id/chat', (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(listChat(row.id));
});

router.post('/:id/chat', async (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(await chatTurn(row, req.body?.message));
});

router.post('/:id/chat/:messageId/apply', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const { job, message } = applyProposal(row, Number(req.params.messageId));
  res.json({ job: serializeJob(job), message });
});

router.delete('/:id/chat', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  clearChat(row.id);
  res.status(204).end();
});

// Portfolio projects built by the developer agent for this job's missing skills.
router.get('/:id/projects', (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(listProjects(row.id));
});

router.post('/:id/projects', async (req, res) => {
  const row = findJob(req, res);
  if (row) res.status(201).json(await startProject(row, req.body || {}));
});

router.post('/:id/projects/:pid/retry', (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(retryProject(row, Number(req.params.pid)));
});

router.post('/:id/projects/:pid/undo', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const project = undoResume(row, Number(req.params.pid));
  res.json({ project, job: serializeJob(getJobRow(row.id)) });
});

router.delete('/:id/projects/:pid', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  deleteLocal(row, Number(req.params.pid));
  res.status(204).end();
});

router.get('/:id/projects/:pid/download', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  const project = getProject(Number(req.params.pid));
  if (!project || project.job_id !== row.id) return res.status(404).json({ error: 'Project not found' });
  const name = project.details?.repo_name || `project-${project.id}`;
  res.setHeader('Content-Disposition', `attachment; filename="${name}.tar.gz"`);
  res.type('application/gzip');
  archiveStream(project.id).pipe(res);
});

// Hiring panel (the /hiring-panel skill): seven reviewers, then a rebuilt resume the user can apply.
for (const [action, fn] of [['', startPanel], ['/apply', applyPanel], ['/undo', undoPanel]]) {
  router.post(`/:id/panel${action}`, (req, res) => {
    const row = findJob(req, res);
    if (row) res.json(serializeJob(fn(row)));
  });
}

// Mock interview: POST with no answer starts (or restarts) it; with { answer } it scores that and asks the next question.
router.get('/:id/interview', (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(listInterview(row.id));
});

router.post('/:id/interview', async (req, res) => {
  const row = findJob(req, res);
  if (row) res.json(await interviewTurn(row, req.body?.answer));
});

router.delete('/:id/interview', (req, res) => {
  const row = findJob(req, res);
  if (!row) return;
  clearInterview(row.id);
  res.status(204).end();
});

export default router;
