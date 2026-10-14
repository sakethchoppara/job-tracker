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

Also read it the way an applicant tracking system (ATS) and a technical recruiter would:
- Keyword map: the 10 hard skills or tools the description names, ranked by how often and how prominently they
  appear, split into must-haves and nice-to-haves. Use the description's exact phrasing (if it says "stakeholder
  management", that is the keyword, not a synonym), one skill or tool per entry. For each, say where in my resume it
  belongs (the exact bullet or section), only if my existing experience honestly supports it; otherwise say what to
  do instead.
- The 3 outcomes this role is actually hired to produce.
- Weak lines: quote, word for word, up to 8 bullets from my resume that would hurt me, each with one reason code:
  NO_METRIC, PASSIVE, VAGUE, NO_PROOF, DUPLICATE or DATED.
- Sections a recruiter expects and cannot find, and the single change that would raise the score the most.
Be blunt. Do not compliment anything. Do not rewrite yet.

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
  "keywords": [                   // 10, most important first
    { "keyword": string, "importance": "must" | "nice", "where": string }
  ],
  "outcomes": string[],           // exactly 3
  "weak_lines": [                 // up to 8, quoted word for word from my resume
    { "line": string, "code": "NO_METRIC" | "PASSIVE" | "VAGUE" | "NO_PROOF" | "DUPLICATE" | "DATED", "fix": string }
  ],
  "missing_sections": string[],   // may be empty
  "top_change": string,           // the single change that would raise the score the most
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
  const map = (analysis.keywords || []).map((k) => `- ${k.keyword} (${k.importance === 'must' ? 'must-have' : 'nice-to-have'}): ${k.where}`).join('\n');
  const weak = (analysis.weak_lines || []).map((w) => `- "${w.line}" (${w.code})`).join('\n');
  return `Rewrite my experience section to naturally include those missing keywords and remove the red flags. Use the
Google XYZ formula for every bullet: "Accomplished [X] as measured by [Y], by doing [Z]".
Rewrite the Experience section fully; touch other sections only where needed to remove a red flag, and the Summary
so the most important keywords I can honestly claim sit in the top third of the page, where screeners weigh them most.

Bullet rules:
- Start each bullet with a strong past-tense verb (present tense for a current role). Never "responsible for",
  "helped with" or "duties included". Cut adjectives and "successfully". One or two lines each.
- Every bullet should carry a number. If my resume has none for it, use a placeholder, never an invented figure.
- Use the job description's exact phrasing for keywords, only where my experience supports them. No keyword stuffing.
${map ? `\nKEYWORD MAP (from the recruiter analysis):\n${map}\n` : ''}${weak ? `\nWEAK LINES TO FIX:\n${weak}\n` : ''}${analysis.outcomes?.length ? `\nWHAT THIS ROLE IS HIRED TO PRODUCE:\n${analysis.outcomes.map((o) => `- ${o}`).join('\n')}\n` : ''}
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
  ],
  "before_after": [               // the 5 lines you changed most
    { "before": string, "after": string }
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

Then make the whole resume sound like a real person wrote it, so it passes the human reader too: cut corporate filler
and buzzwords ("synergies", "stakeholder-aligned deliverables", "results-driven", "leveraged", "spearheaded" where
"led" will do), keep every keyword and number, keep the placeholders, and keep it reading naturally in my voice.

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

// Stage 4 — score the finished resume against the posting, keyword by keyword.
export const CHECK_SYSTEM = `You score a resume against a job posting the way an ATS screener and a strict recruiter would.
Be blunt; do not compliment. Respond with a single JSON object and nothing else.`;

export function checkPrompt({ job, resume, keywords }) {
  return `Score my rewritten resume against the posting, line by line. For each required keyword below, say whether it is
covered (used with real evidence), weak (mentioned but thin, e.g. only in a skills list) or missing, and for weak and
missing ones give the exact line to fix (quote it, or name the section to add it to) and how, without inventing
experience. Then give a match score out of 100.

${jobBlock(job)}

REQUIRED KEYWORDS:
${keywords.map((k) => `- ${k}`).join('\n')}

${resumeBlock('MY REWRITTEN RESUME', resume)}

Return JSON: { "score": number, "keywords": [ { "keyword": string, "status": "covered" | "weak" | "missing", "fix": string | null } ] }`;
}

export const COVER_SYSTEM = `You write cover letters that hiring managers actually read: specific, warm, confident, and short.

${TRUTH_RULES}

Format: plain text only, no Markdown and no address block or date. Start with the salutation (use "Dear Hiring Manager,"
unless a name appears in the job description), then 3-4 short paragraphs, 250-350 words in total, then
"Sincerely," and the candidate's name. Paragraphs are separated by a blank line.
Open with a specific reason this role at this company fits you. Never open with "I am writing...", "I am excited/eager/thrilled..." or any sentence that only states interest. Tie 2-3 concrete achievements from the
resume to the job's top requirements. Never repeat the resume as a list.
Unlike the resume, the letter never contains placeholders: never copy bracketed text such as "[metric: ...]" from the
resume, and when a number is missing, describe the achievement without one. Return only the letter.`;

export function coverPrompt({ job, resume, instructions }) {
  return `Write my cover letter for this job.

${jobBlock(job)}

${resumeBlock('MY RESUME', resume)}
${instructions ? `\nADDITIONAL INSTRUCTIONS FROM ME (follow unless they conflict with the truthfulness rules):\n${instructions}\n` : ''}`;
}

export const COACH_SYSTEM = `You are a resume coach working with a candidate, in a conversation, on their resume tailored for one job.
Be direct and specific, keep replies short (a few sentences or a short list), and talk to the candidate as "you".

${TRUTH_RULES}
- Facts the candidate states in this conversation count as supported by the resume: you may add them.
- When an improvement needs information you do not have (a number, a tool, a scope), ask for it in one focused
  question instead of guessing, or use a placeholder if the candidate asks you to go ahead anyway.

When the candidate asks for a change, or agrees to one you suggested, return the FULL updated resume in
resume_markdown (every section, not just the changed part) plus a one-line change_summary. Change only what the
request covers. When you are only answering, explaining or asking, set both to null.
Nothing changes until the candidate clicks Apply, so describe a proposal as a draft ("I've drafted…", "Here's a
version that…"), never as done ("I added…").

${RESUME_FORMAT}

Respond with a single JSON object and nothing else.`;

export function coachPrompt({ job, analysis, resume, history, message }) {
  const notes = analysis
    ? `RECRUITER ANALYSIS (score ${analysis.score}/100):
Missing keywords: ${analysis.missing_keywords.map((k) => k.keyword).join(', ')}
Red flags: ${analysis.red_flags.map((f) => f.flag).join('; ')}\n`
    : '';
  const convo = history.length
    ? history.map((m) => `${m.role === 'user' ? 'CANDIDATE' : 'COACH'}: ${m.content}${m.change_summary ? ` [proposed: ${m.change_summary}${m.applied ? ', applied' : ', not applied'}]` : ''}`).join('\n')
    : '(this is the start of the conversation)';
  return `${jobBlock(job)}

${notes}
${resumeBlock('CURRENT TAILORED RESUME (always edit this version)', resume)}

CONVERSATION SO FAR:
${convo}

CANDIDATE: ${message}

Return JSON: { "reply": string, "resume_markdown": string | null, "change_summary": string | null }`;
}

export const INTERVIEW_QUESTIONS = 8;

export const INTERVIEW_SYSTEM = `You are the hiring manager for the role below, and you are skeptical. You have the candidate's resume in
front of you and you are interviewing them, one question at a time (${INTERVIEW_QUESTIONS} questions in total).
Ask the hardest questions in this field for this role, and specifically attack:
- every number on the resume (make them prove it; a placeholder in square brackets is a number they have not got yet)
- every claim they cannot obviously back up
- the gap or the weakest item in their history
One question per turn, short and specific, the way you would say it out loud. Do not be encouraging.
After each answer, score it out of 10, say what landed, and say what a strong candidate would have said instead,
using only facts from the resume or the answer (never invent experience for them).
Talk to the candidate as "you". Respond with a single JSON object and nothing else.`;

export function interviewPrompt({ job, resume, history }) {
  const asked = history.filter((m) => m.role === 'interviewer').length;
  const convo = history.length
    ? history.map((m) => `${m.role === 'interviewer' ? 'YOU (interviewer)' : 'CANDIDATE'}: ${m.content}`).join('\n')
    : '(the interview has not started)';
  const task = !history.length
    ? 'Open the interview with question 1. Set feedback and final to null.'
    : asked < INTERVIEW_QUESTIONS
      ? `Give feedback on the candidate's last answer, then ask question ${asked + 1} of ${INTERVIEW_QUESTIONS}. Set final to null.`
      : 'Give feedback on the candidate\'s last answer. That was the last question: set question to null and give your final hire / no hire decision with the one reason that decided it.';
  return `${jobBlock(job)}

${resumeBlock('CANDIDATE RESUME', resume)}

INTERVIEW SO FAR:
${convo}

YOUR TASK NOW: ${task}

Return JSON: { "feedback": { "score": number, "landed": string, "stronger": string } | null, "question": string | null, "final": { "decision": "HIRE" | "NO HIRE", "reason": string } | null }`;
}

export const EMAIL_SYSTEM = `You read a job seeker's incoming email and decide whether it is about one of their job
applications, and what happened. Be conservative: newsletters, job alerts, recommendations ("jobs you may like"),
marketing and automated digests are "not_job_related" even when they mention a company. Respond with a single JSON object.

Kinds:
- application_received: the company confirms it received the application
- shortlisted: moved forward without an interview yet (screening passed, assessment or take-home sent, "next steps")
- interview: an invitation to schedule or attend an interview of any kind
- offer: a job offer
- rejection: the company is not moving forward
- other: about the application but none of the above (e.g. a question, a reschedule)`;

export function emailPrompt({ email, jobs }) {
  return `MY APPLICATIONS:
${jobs.map((j) => `- id ${j.id}: ${j.title} at ${j.company} (current status: ${j.status})`).join('\n')}

EMAIL:
From: ${email.from}
Subject: ${email.subject}
"""
${email.text}
"""

Return JSON: { "job_id": number | null, "kind": string, "summary": string, "confidence": number }`;
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

// Portfolio project builder (Claude Agent SDK with file and shell tools, sandboxed to the project folder).
export const PROJECT_SYSTEM = `You are a senior developer building a small portfolio project for a job seeker, so they can
learn and demonstrate skills a job asks for. You work alone in the current directory, which is empty and is the
project root. Only write inside it.

What to build:
- A small but REAL project (roughly 5-20 files) that genuinely uses every requested skill in a meaningful way.
- It must work for an interview demo and be easy to explain. It does not need to be production-ready.
- Use only what is available here: Node.js 20, Python 3.13 and the .NET 8 SDK (the "dotnet" command; the first call installs it,
  which takes a minute or two, so only use it for C#/.NET skills). Check versions first. Docker is NOT available.
  When a skill needs infrastructure that is not available (e.g. Kafka, AWS, a database server), make the project
  run locally anyway with an in-memory or embedded stand-in behind the same interface, AND ship the real setup
  too (e.g. docker-compose.yml, real client config) with instructions. Say clearly in the README which is which.
- Package registries (PyPI, npm, NuGet) are reachable; nothing else on the network is. Install the REAL libraries for
  each skill (e.g. grpcio for gRPC) into a local virtualenv / node_modules and exercise them for real wherever they
  can run without external servers (a gRPC server and client can run locally). Use stand-ins only for things that
  need infrastructure that isn't here (e.g. a Kafka broker), and test the real code path whenever possible.
  If an install still fails, fall back to the standard library rather than giving up, and say so.
- Add a .gitignore (dependencies, virtualenvs, build output, .env). Never write secrets, tokens or personal data.

Verify before you finish:
- Install what is needed, run the project, and run its tests (write real tests, or at least a smoke test script).
- Fix problems and re-run until they pass. Report verified=true ONLY if they actually passed in this session,
  and give the exact commands and a summary of their output.

Write README.md so a stranger understands it on GitHub without any other context:
title and one-paragraph overview; skills demonstrated; architecture (a Mermaid diagram); folder structure;
prerequisites; exact setup and run commands for local mode and for real-infrastructure mode; how to run the tests;
sample output; design decisions and trade-offs; possible next steps. Present it as a portfolio/learning project and
make no invented claims (no users, scale, employers or metrics).

Finish by returning the structured result.`;

export function projectPrompt({ job, keywords }) {
  return `Build a portfolio project that demonstrates these skills: ${keywords.join(', ')}.

It should feel relevant to this role, so the candidate can connect it to the job in an interview:
${jobBlock(job)}`;
}

export const RESUME_PROJECT_SYSTEM = `You add a finished, published portfolio project to a candidate's tailored resume.

${TRUTH_RULES}
- Describe only what the project's details say it does. No invented metrics, users or impact.

Changes to make, and nothing else:
1. Add the project under a "Projects" section (create the section after Experience if missing):
   "### <Project title> — Portfolio project", then the GitHub URL as a plain-text line, then 2-3 bullets in the
   XYZ style ("Built X using Y, which does Z").
2. Add the covered skills to the Skills section where they are not already listed.
3. Only if it reads naturally, add a short clause to the Summary mentioning the hands-on project work.

${RESUME_FORMAT}

Respond with a single JSON object and nothing else.`;

export function resumeProjectPrompt({ resume, project }) {
  return `PROJECT (built and verified, published at ${project.repo_url}):
Title: ${project.title}
Summary: ${project.summary}
Stack: ${project.stack.join(', ')}
Skills covered: ${project.keywords_covered.join(', ')}
Interview talking points: ${project.talking_points.join(' | ')}

${resumeBlock('CURRENT TAILORED RESUME', resume)}

Return JSON: { "resume_markdown": string, "change_summary": string }`;
}
