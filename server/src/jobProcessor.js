import { db, getJobRow, getResume, updateJob } from './db.js';
import { completeJSON, stripFences } from './llm.js';
import {
  ANALYZE_SYSTEM, CHECK_SYSTEM, EXTRACT_SYSTEM, REWRITE_SYSTEM, SKIM_SYSTEM,
  analyzePrompt, checkPrompt, extractPrompt, rewritePrompt, skimPrompt,
} from './prompts.js';
import { hasKeyword } from './resumeFormat.js';
import { AnalysisSchema, CheckSchema, ExtractSchema, RewriteSchema, SkimSchema } from './schemas.js';

// Pipeline per job:
//   analyze (on create)  -> ai_status 'analyzed'  (user reviews score / missing keywords / red flags)
//   tailor  (on accept)  -> rewrite experience (XYZ) -> ATS skim + human-voice pass -> keyword-by-keyword check -> 'done'

// Compare quoted lines loosely: Markdown emphasis, bullets and spacing don't count.
const plain = (t) => String(t).replace(/[*_`]/g, '').replace(/^\s*[-•]\s*/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();

// Replies are already schema-validated; this trims to the counts the UI promises and checks in code what we can:
// whether each keyword is really in the resume, and that "weak lines" are real quotes (invented ones are dropped).
function normalizeAnalysis(out, resume) {
  const text = plain(resume);
  return {
    score: Math.round(out.score),
    verdict: out.verdict,
    missing_keywords: out.missing_keywords.slice(0, 5),
    red_flags: out.red_flags.slice(0, 3),
    keywords: out.keywords.slice(0, 10).map((k) => ({ ...k, in_resume: hasKeyword(resume, k.keyword) })),
    outcomes: out.outcomes.slice(0, 3),
    weak_lines: out.weak_lines.filter((w) => text.includes(plain(w.line))).slice(0, 8),
    missing_sections: out.missing_sections,
    top_change: out.top_change,
    generated_at: new Date().toISOString(),
  };
}

/** The model's covered/weak/missing, corrected where code can tell: a keyword absent from the text is missing, a present one isn't. */
export function correctCheck(check, markdown) {
  if (!check) return check;
  return {
    ...check,
    keywords: check.keywords.map((k) => {
      const present = hasKeyword(markdown, k.keyword);
      const status = !present ? 'missing' : k.status === 'missing' ? 'weak' : k.status;
      return { ...k, status };
    }),
  };
}

/** Facts we verify in code rather than trusting the model: which missing keywords made it in, and unfilled placeholders. */
export function checkResume(markdown, analysis) {
  return {
    keyword_check: (analysis?.missing_keywords || []).map((k) => ({ keyword: k.keyword, included: hasKeyword(markdown, k.keyword) })),
    placeholders: [...new Set(markdown.match(/\[[^\]\n]+\]/g) || [])],
  };
}

/** Save a user-approved edit of the tailored resume (manual or via the coach) and re-run the code checks. */
export function saveTailoredResume(row, markdown) {
  const old = JSON.parse(row.tailoring || '{}');
  // The check's score stays from the last tailoring; its keyword statuses follow the edit where code can tell.
  const tailoring = { ...old, ...checkResume(markdown, JSON.parse(row.analysis || 'null')), check: correctCheck(old.check, markdown) };
  return updateJob(row.id, { tailored_markdown: markdown, tailored_edited: 1, tailoring });
}

function resumeMarkdown(out) {
  const md = stripFences(out.resume_markdown);
  if (md.length < 50) throw new Error('Model returned an empty resume');
  return md;
}

async function analyze(job, resume) {
  const out = await completeJSON(ANALYZE_SYSTEM, analyzePrompt({ job, resume: resume.markdown }), AnalysisSchema, { maxTokens: 8000 });
  return { extracted: out.extracted, updates: { analysis: normalizeAnalysis(out, resume.markdown), ai_status: 'analyzed' } };
}

async function tailor(job, resume, instructions) {
  const analysis = JSON.parse(job.analysis || 'null');
  if (!analysis) throw new Error('Run the analysis first');

  updateJob(job.id, { ai_stage: 'rewrite' });
  const rewrite = await completeJSON(REWRITE_SYSTEM, rewritePrompt({ job, resume: resume.markdown, analysis, instructions }), RewriteSchema, { maxTokens: 12000 });
  const rewritten = resumeMarkdown(rewrite);

  updateJob(job.id, { ai_stage: 'skim' });
  const skim = await completeJSON(SKIM_SYSTEM, skimPrompt({ job, resume: rewritten }), SkimSchema, { maxTokens: 12000 });
  const final = resumeMarkdown(skim);

  updateJob(job.id, { ai_stage: 'check' });
  const keywords = (analysis.keywords?.length ? analysis.keywords : analysis.missing_keywords).map((k) => k.keyword);
  const check = await completeJSON(CHECK_SYSTEM, checkPrompt({ job, resume: final, keywords }), CheckSchema, { maxTokens: 4000 });

  return {
    extracted: {},
    updates: {
      tailored_markdown: final,
      tailored_edited: 0,
      tailoring: {
        rewrite_changes: rewrite.changes,
        keywords_not_added: rewrite.keywords_not_added.slice(0, 5),
        skipped_sections: skim.skipped_sections.slice(0, 10),
        skim_changes: skim.changes,
        before_after: rewrite.before_after.slice(0, 5),
        check: correctCheck({ score: Math.round(check.score), keywords: check.keywords }, final),
        ...checkResume(final, analysis),
        generated_at: new Date().toISOString(),
      },
      ai_status: 'done',
    },
  };
}

export async function processJob(id, { stage, instructions } = {}) {
  const job = getJobRow(id);
  if (!job) return;
  const resume = getResume(job.user_id);

  try {
    let result;
    if (!resume) {
      const extracted = !job.experience || !job.location
        ? await completeJSON(EXTRACT_SYSTEM, extractPrompt(job), ExtractSchema, { maxTokens: 2000 })
        : {};
      result = { extracted, updates: { ai_status: 'no_resume' } };
    } else if (stage === 'tailor') {
      result = await tailor(job, resume, instructions);
    } else {
      result = await analyze(job, resume);
    }

    // Re-read so we never overwrite something the user typed while the model was running.
    const current = getJobRow(id);
    if (!current) return;
    const { updates, extracted } = result;
    const aiFilled = new Set(JSON.parse(current.ai_filled || '[]'));
    for (const field of ['experience', 'location']) {
      const value = extracted?.[field];
      if (!current[field] && value && String(value).trim().toLowerCase() !== 'null') {
        updates[field] = String(value).trim();
        aiFilled.add(field);
      }
    }
    updateJob(id, { ...updates, ai_filled: [...aiFilled], ai_stage: null, ai_error: null });
    // Portfolio projects finished before this job had a tailored resume are added now (dynamic import: projects.js imports this module).
    if (stage === 'tailor') import('./projects.js').then((m) => m.applyPendingProjects(id)).catch((e) => console.error(e));
  } catch (err) {
    console.error(`Job ${id} ${stage || 'analyze'} failed:`, err);
    updateJob(id, { ai_status: 'error', ai_stage: null, ai_error: err.message || String(err) });
  }
}

/** stage: 'analyze' (default) or 'tailor'. */
export function startProcessing(id, { stage = 'analyze', instructions } = {}) {
  updateJob(id, { ai_status: 'processing', ai_stage: stage === 'tailor' ? 'rewrite' : 'analyze', ai_error: null });
  processJob(id, { stage, instructions }); // runs in background; errors are recorded on the job
}

export function recoverStuckJobs() {
  db.prepare(`
    UPDATE jobs SET ai_status = 'error', ai_stage = NULL, ai_error = 'Interrupted by server restart — please retry'
    WHERE ai_status = 'processing'
  `).run();
}
