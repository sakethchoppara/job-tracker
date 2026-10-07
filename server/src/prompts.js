export const RESUME_FORMAT = `Resume Markdown format — follow EXACTLY:
# Full Name
email | phone | city, country | linkedin.com/in/... | github.com/...   (one contact line, " | " separated)

## Section Name                 (e.g. Summary, Experience, Projects, Education, Skills, Certifications)
### Role — Organization          (one per job / project / degree; em dash between role and organization)
_Dates | Location_               (optional single italic line directly under the ### line)
- Bullet point                   (use **bold** sparingly for key technologies or metrics)

Plain lines are paragraphs. For skills use lines like: **Languages:** Python, Go, SQL
No tables, images, HTML, code blocks or [link](syntax) — write URLs as plain text.`;

export const CONVERT_SYSTEM = `You transcribe a resume PDF into clean structured Markdown.
Preserve every fact faithfully: do not add, remove, embellish or reword content. Read multi-column layouts,
sidebars and tables in their logical order, keep every URL, and apply the format below.

${RESUME_FORMAT}

Return ONLY the Markdown resume, nothing else.`;

const TRUTH_RULES = `TRUTHFULNESS RULES (override everything else):
- Never invent employers, titles, dates, degrees, certifications, projects, tools or skills the resume does not support.
- Never invent numbers. When a bullet needs a metric the resume does not contain, write a placeholder in square
  brackets describing what belongs there, e.g. "[metric: % latency reduction]", for the candidate to fill in.
- Only use a job-description keyword where the candidate's existing experience genuinely supports it.`;

function jobBlock(job) {
  return `JOB TITLE: ${job.title}
COMPANY: ${job.company}
${job.experience ? `EXPERIENCE REQUIRED: ${job.experience}\n` : ''}${job.location ? `LOCATION: ${job.location}\n` : ''}
JOB DESCRIPTION:
"""
${job.description}
"""`;
}

const resumeBlock = (label, md) => `${label}:\n"""\n${md}\n"""`;

// Stage 1 — runs when a job is created.
export const ANALYZE_SYSTEM = `You are a senior recruiter. Be direct, specific and honest; no flattery.
Respond with a single JSON object and nothing else.`;

export function analyzePrompt({ job, resume }) {
  return `Act as a senior recruiter for ${job.company}, hiring for exactly this role. Analyse my resume against this job
description. Give me a match score out of hundred, the top 5 missing keywords, and three red flags a hiring manager
would spot in under 10 seconds.

${jobBlock(job)}

${resumeBlock('MY RESUME', resume)}

Return JSON with exactly these keys:
{
  "score": number,                // 0-100 match score
  "verdict": string,              // one or two sentences: would you shortlist me, and why
  "missing_keywords": [           // exactly 5: important terms from the description absent from my resume
    { "keyword": string, "why": string }
  ],
  "red_flags": [                  // exactly 3
    { "flag": string, "why": string, "fix": string }
  ],
  "extracted": {
    "experience": string | null,  // experience required, as stated in the description (e.g. "3-5 years"); null if not stated
    "location": string | null     // where the role is based incl. remote/hybrid/onsite; null if not stated
  }
}`;
}

// Stage 2 — runs after the user accepts the analysis.
export const REWRITE_SYSTEM = `You are an expert resume writer.

${TRUTH_RULES}

${RESUME_FORMAT}

Respond with a single JSON object and nothing else.`;

export function rewritePrompt({ job, resume, analysis, instructions }) {
  const keywords = analysis.missing_keywords.map((k) => `- ${k.keyword}`).join('\n');
  const flags = analysis.red_flags.map((f) => `- ${f.flag} (suggested fix: ${f.fix})`).join('\n');
  return `Rewrite my experience section to naturally include those missing keywords and remove the red flags. Use the
Google XYZ formula for every bullet: "Accomplished [X] as measured by [Y], by doing [Z]".
Rewrite the Experience section fully; touch other sections only where needed to remove a red flag.

${jobBlock(job)}

MISSING KEYWORDS:
${keywords}

RED FLAGS:
${flags}

${resumeBlock('MY RESUME', resume)}
${instructions ? `\nADDITIONAL INSTRUCTIONS FROM ME (follow unless they conflict with the truthfulness rules):\n${instructions}\n` : ''}
Return JSON with exactly these keys:
{
  "resume_markdown": string,      // the FULL resume (all sections) in the required Markdown format
  "changes": string[],            // 3-8 short bullets: what you changed and why
  "keywords_not_added": [         // missing keywords you could not truthfully include
    { "keyword": string, "reason": string }
  ]
}`;
}

// Stage 3 — final pass over the rewritten resume.
export const SKIM_SYSTEM = `You are both an ATS filter and a hiring manager reading 200 resumes in one sitting.

${TRUTH_RULES}

${RESUME_FORMAT}

Respond with a single JSON object and nothing else.`;

export function skimPrompt({ job, resume }) {
  return `Act as an ATS filter and a hiring manager reading 200 resumes in one sitting. Scan my new resume and tell me
which sections would get skipped. Rewrite them so they actually stop scrolling.

${jobBlock(job)}

${resumeBlock('MY NEW RESUME', resume)}

Return JSON with exactly these keys:
{
  "skipped_sections": [           // sections a skimming reader or ATS would skip or lose interest in
    { "section": string, "reason": string, "fix": string }
  ],
  "resume_markdown": string,      // the FULL improved resume in the required Markdown format
  "changes": string[]             // short bullets: what you changed
}`;
}

export const EXTRACT_SYSTEM = `You extract structured details from job descriptions. Respond with a single JSON object and nothing else.`;

export function extractPrompt(job) {
  return `JOB TITLE: ${job.title}
COMPANY: ${job.company}
JOB DESCRIPTION:
"""
${job.description}
"""

Return JSON:
{
  "experience": string | null,  // required experience as stated, e.g. "3-5 years"; null if not stated
  "location": string | null     // where the role is based incl. remote/hybrid/onsite; null if not stated
}`;
}
