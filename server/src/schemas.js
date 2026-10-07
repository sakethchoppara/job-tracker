// Shapes the LLM must return for each pipeline stage. Validated on every reply; Gemini also gets them as its response schema.
import { z } from 'zod';

const text = z.string().trim().min(1);
const nullableText = z.string().nullable();

export const ExtractSchema = z.object({
  experience: nullableText.describe('Experience required as stated in the description, e.g. "3-5 years"; null if not stated'),
  location: nullableText.describe('Where the role is based incl. remote/hybrid/onsite; null if not stated'),
});

export const AnalysisSchema = z.object({
  score: z.number().min(0).max(100).describe('0-100 match score'),
  verdict: text,
  missing_keywords: z.array(z.object({ keyword: text, why: text })).min(1).describe('Exactly 5'),
  red_flags: z.array(z.object({ flag: text, why: text, fix: text })).min(1).describe('Exactly 3'),
  extracted: ExtractSchema,
});

export const RewriteSchema = z.object({
  resume_markdown: z.string().min(50),
  changes: z.array(text),
  keywords_not_added: z.array(z.object({ keyword: text, reason: text })),
});

export const SkimSchema = z.object({
  skipped_sections: z.array(z.object({ section: text, reason: text, fix: text })),
  resume_markdown: z.string().min(50),
  changes: z.array(text),
});
