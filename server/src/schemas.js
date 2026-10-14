// Shapes the LLM must return for each pipeline stage. Validated on every reply; Gemini also gets them as its response schema.
import { z } from 'zod';

const text = z.string().trim().min(1);
const nullableText = z.string().nullable();

export const ExtractSchema = z.object({
  experience: nullableText.describe('Experience required as stated in the description, e.g. "3-5 years"; null if not stated'),
  location: nullableText.describe('Where the role is based incl. remote/hybrid/onsite; null if not stated'),
});

export const WEAK_CODES = ['NO_METRIC', 'PASSIVE', 'VAGUE', 'NO_PROOF', 'DUPLICATE', 'DATED'];

export const AnalysisSchema = z.object({
  score: z.number().min(0).max(100).describe('0-100 match score'),
  verdict: text,
  missing_keywords: z.array(z.object({ keyword: text, why: text })).min(1).describe('Exactly 5'),
  red_flags: z.array(z.object({ flag: text, why: text, fix: text })).min(1).describe('Exactly 3'),
  keywords: z.array(z.object({ keyword: text, importance: z.enum(['must', 'nice']), where: text })).min(1).describe('10, most important first, in the posting\'s exact phrasing'),
  outcomes: z.array(text).describe('Exactly 3'),
  weak_lines: z.array(z.object({ line: text, code: z.enum(WEAK_CODES), fix: text })).describe('Up to 8, quoted word for word'),
  missing_sections: z.array(text),
  top_change: text,
  extracted: ExtractSchema,
});

export const CheckSchema = z.object({
  score: z.number().min(0).max(100),
  keywords: z.array(z.object({ keyword: text, status: z.enum(['covered', 'weak', 'missing']), fix: nullableText })),
});

export const RewriteSchema = z.object({
  resume_markdown: z.string().min(50),
  changes: z.array(text),
  keywords_not_added: z.array(z.object({ keyword: text, reason: text })),
  before_after: z.array(z.object({ before: text, after: text })).describe('The 5 lines changed most'),
});

export const EMAIL_KINDS = ['not_job_related', 'application_received', 'shortlisted', 'interview', 'offer', 'rejection', 'other'];

export const EmailSchema = z.object({
  job_id: z.number().int().nullable().describe('id of the application this email is about, or null if none fits'),
  kind: z.enum(EMAIL_KINDS),
  summary: z.string().describe('One short sentence on what the email says, e.g. "Invites you to a 45-minute technical interview next week"'),
  confidence: z.number().min(0).max(1).describe('How sure you are about BOTH the application match and the kind'),
});

export const CoachSchema = z.object({
  reply: text.describe('Your message to the candidate: answer, explain, or ask one focused question'),
  resume_markdown: z.string().nullable().describe('The FULL updated resume when you are proposing changes; null when not changing it'),
  change_summary: z.string().nullable().describe('One short line naming what the proposal changes; null when resume_markdown is null'),
});

export const SkimSchema = z.object({
  skipped_sections: z.array(z.object({ section: text, reason: text, fix: text })),
  resume_markdown: z.string().min(50),
  changes: z.array(text),
});

export const ProjectSchema = z.object({
  title: text.describe('Project name for a resume, e.g. "Order Events Pipeline"'),
  repo_name: z.string().regex(/^[a-z0-9][a-z0-9-]{2,59}$/).describe('GitHub repository name: lowercase letters, digits and hyphens'),
  summary: text.describe('One or two sentences: what it does and how'),
  stack: z.array(text).describe('Languages, frameworks and tools actually used'),
  keywords_covered: z.array(text).describe('Which requested keywords the project genuinely uses'),
  how_to_run: text.describe('Exact commands to run it and its tests, local mode'),
  verified: z.boolean().describe('true only if the project and its tests ran successfully in this session'),
  verification: text.describe('The exact commands you ran and what they printed (summarised)'),
  talking_points: z.array(text).describe('3-6 things the candidate should be able to explain in an interview'),
});

export const ResumeProjectSchema = z.object({
  resume_markdown: z.string().min(50).describe('The FULL updated resume'),
  change_summary: text.describe('One line naming what was added'),
});

// Hiring panel skill's structured result (what it would show in chat).
const REVIEWERS = ['Automated screen', 'Hiring manager', 'Reader: hiring manager', 'Reader: another applicant', 'Reader: CEO', 'Reader: recruiter', 'Reader: teammate'];
export const PanelSchema = z.object({
  reviewers: z.array(z.object({
    reviewer: z.enum(REVIEWERS),
    verdict: z.string().describe('PASS/REJECT, INTERVIEW/NO, or HIRE/MAYBE/PASS'),
    reason: z.string().describe('One line: what decided it, quoting the resume line'),
  })).length(7),
  mistakes: z.array(z.object({
    line: z.string().describe('The quoted resume line, or what is missing'),
    why: z.string(),
    flagged_by: z.array(z.string()),
  })).min(1),
  screen_before: z.enum(['PASS', 'REJECT']),
  screen_after: z.enum(['PASS', 'REJECT']),
  closest_to_rejecting: z.string().describe('Which reviewer came closest to rejecting it, and why it held (or why it failed)'),
  questions: z.array(z.string()).describe('The [ADD: ...] questions the user must answer'),
});

// Mock interview turn: feedback on the last answer (none before the first question), then the next question or the verdict.
export const InterviewSchema = z.object({
  feedback: z.object({
    score: z.number().int().min(0).max(10),
    landed: z.string().describe('What landed in the answer; "Nothing" if nothing did'),
    stronger: z.string().describe('What a strong candidate would have said instead'),
  }).nullable(),
  question: z.string().nullable().describe('The next question; null after the last one'),
  final: z.object({
    decision: z.enum(['HIRE', 'NO HIRE']),
    reason: z.string().describe('The one reason that decided it'),
  }).nullable(),
});
