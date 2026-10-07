import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireAuth } from './auth.js';
import { recoverStuckJobs } from './jobProcessor.js';
import { llmInfo } from './llm.js';
import authRouter from './routes/auth.js';
import jobsRouter from './routes/jobs.js';
import resumeRouter from './routes/resume.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, llm: llmInfo() }));
app.use('/api/auth', authRouter);
app.use('/api/jobs', requireAuth, jobsRouter);
app.use('/api/resume', requireAuth, resumeRouter);

// Serve the built client in production (npm run build in client/).
const dist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  res.status(status).json({ error: err.message || 'Server error' });
});

recoverStuckJobs();
const PORT = Number(process.env.PORT) || 5050;
app.listen(PORT, () => {
  const { provider, model } = llmInfo();
  console.log(`Job tracker API on http://localhost:${PORT} (LLM: ${provider ? `${provider} / ${model}` : 'NOT CONFIGURED'})`);
});
