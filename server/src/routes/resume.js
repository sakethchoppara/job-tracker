import { Router } from 'express';
import multer from 'multer';
import { extractText, getDocumentProxy } from 'unpdf';
import { getResume, getResumePdf, saveResume } from '../db.js';
import { completeText, stripFences } from '../llm.js';
import { countPdfPages } from '../resumeFormat.js';
import { CONVERT_SYSTEM } from '../prompts.js';
import { FORMATS, sendResume } from './jobs.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const badRequest = (message) => Object.assign(new Error(message), { status: 400 });

// Text layer for search/keyword matching. Empty for scanned PDFs — the LLM still reads those from the PDF itself.
async function pdfText(buffer) {
  try {
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(buffer)), { mergePages: true });
    return text.trim();
  } catch {
    throw badRequest('That PDF could not be opened — is it password-protected or corrupted?');
  }
}

router.get('/', (req, res) => res.json(getResume(req.user.id)));

// Upload a PDF resume; the LLM reads the PDF directly and transcribes it into our Markdown format.
router.post('/import', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) throw badRequest('Choose a PDF file to upload');
  if (file.buffer.subarray(0, 5).toString() !== '%PDF-') throw badRequest('Only PDF resumes are supported for now');

  const rawText = await pdfText(file.buffer);
  const markdown = stripFences(await completeText(CONVERT_SYSTEM, 'Transcribe the attached resume.', { maxTokens: 8000, pdf: file.buffer }));
  if (markdown.length < 50) throw badRequest('Could not read a resume from that PDF');
  res.json(saveResume(req.user.id, { filename: file.originalname, pdf: file.buffer, raw_text: rawText, markdown }));
});

// Save manual edits to the base resume (the original PDF is kept).
router.put('/', (req, res) => {
  const markdown = req.body?.markdown?.trim();
  if (!markdown) return res.status(400).json({ error: 'Resume cannot be empty' });
  res.json(saveResume(req.user.id, { markdown }));
});

// Live page count for the editor: the same renderer as the PDF download.
router.post('/page-count', async (req, res) => {
  const markdown = String(req.body?.markdown || '');
  res.json({ pages: markdown.trim() ? await countPdfPages(markdown) : 0 });
});

router.get('/original.pdf', (req, res) => {
  const row = getResumePdf(req.user.id);
  if (!row) return res.status(404).json({ error: 'No uploaded PDF' });
  res.setHeader('Content-Disposition', `attachment; filename="${(row.filename || 'resume.pdf').replace(/["\\\r\n]/g, '')}"`);
  res.type('application/pdf').send(row.pdf);
});

router.get('/download.:format', async (req, res) => {
  if (!FORMATS.includes(req.params.format)) return res.status(400).json({ error: 'Unsupported format' });
  const resume = getResume(req.user.id);
  if (!resume) return res.status(404).json({ error: 'No base resume uploaded' });
  await sendResume(res, resume.markdown, req.params.format, `${resume.structured.name || 'Resume'} Resume`);
});

export default router;
