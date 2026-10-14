# Job Tracker

Kanban board for job applications with LLM-tailored resumes.

- **Accounts** — register / log in with a username and password. Passwords are hashed with bcrypt, and sessions use an httpOnly cookie that lasts 30 days. Each user only ever sees their own jobs and resume. After registering, you're asked to upload your resume.
- **Kanban** — starts with Saved → Applied → Accepted → Interview → Offer → Hired → Rejected, with drag-and-drop. Statuses are yours to change: add one (name, colour, position) with the + at the end of the board, and remove any empty one with the ✕ on its header. A status that still holds cards can't be removed.
- **New application** — job title, company and description are required. Experience and "based in" are optional; when you leave them blank, the LLM fills them in from the description (marked "AI-filled").
- **Resume pipeline per job** (three LLM stages):
  1. **Recruiter analysis** runs automatically when you create a job. You get a match score out of 100, the top 5 missing keywords, and 3 red flags a hiring manager would spot in under 10 seconds. It also reads the resume like an ATS and a technical recruiter: the 10 keywords the posting scans for (must-have / nice-to-have, in the posting's exact words, whether each is in your resume and where it belongs), the 3 outcomes the role is hired for, up to 8 weak lines quoted word for word with a reason code (no metric, passive, vague, no proof, duplicate, dated), missing sections, and the one change that would help most.
  2. **Accept**, which rewrites your Experience section to work in the missing keywords and remove the red flags, using Google's XYZ formula ("accomplished X as measured by Y by doing Z").
  3. **ATS, skim and human-voice pass**: reads the new resume the way an ATS filter and a hiring manager going through 200 resumes would, reports which sections would get skipped, rewrites them, and cuts corporate filler so it reads like a person wrote it.
  4. **Keyword check**: scores the finished resume against the posting, keyword by keyword (covered, weak or missing, with the exact line to fix), plus a new match score. The rewrite also puts your strongest true keywords in the top third, starts bullets with strong verbs, and shows the 5 biggest before → after changes.

  Keyword presence is checked in code (ignoring bold markers and singular/plural), and the model's claims are corrected where the text decides. Guardrails: the LLM never invents numbers; it writes placeholders like `[metric: % latency reduction]` for you to fill in, and the card flags them. Keywords only go in where your experience supports them; the rest are listed as "not added" with a reason. Whether each missing keyword actually made it into the resume is checked in code, not by the LLM. You upload your resume once as a PDF. The PDF goes straight to the LLM, which reads the layout itself. The database stores the original PDF, its extracted text, an editable Markdown version, and a structured JSON version (contact, sections, roles, skills).
- **Email sync (Gmail)**: connect Gmail with an app password (top bar → mail icon). Every few minutes the server reads new inbox mail over IMAP. It works on localhost, with no public webhook URL needed. Emails that look job-related are classified by the AI: application received → Applied, next steps → Accepted, interview invite → Interview, offer → Offer, rejection → Rejected. The card moves automatically and the email is attached to it. Cards only move forward in your lane order (rejection excepted), never into a status you've removed, low-confidence matches don't move anything, and every move can be undone. App passwords are stored AES-256-GCM encrypted.
- **Resume coach** (Tailored resume tab → Coach): chat about the resume in plain words. The coach remembers the conversation for each job (stored in the database and replayed into every turn, so it survives reloads and works with any provider). It answers, asks for missing facts, and proposes concrete edits that only change the resume when you click Apply. Facts you tell it count as true; nothing else is invented. A suggestion made before you edited the resume can't be applied over your edit.
- **Interview practice** (job → Interview practice): a skeptical hiring manager interviews you on the job's resume, 8 questions one at a time. It goes after every number (and every unfilled placeholder), every claim you can't obviously back up, and the weakest item in your history. Each answer gets a score out of 10, what landed, and what a strong candidate would have said; the end is hire or no hire with the deciding reason. The conversation is stored per job, so you can leave and come back.
- **Hiring panel** (job → Hiring panel): runs the [/hiring-panel](https://github.com/alexyc9381/hiring-panel-skill) Claude Code skill by Alex Chen (MIT, vendored unchanged in `server/vendor/hiring-panel-skill`) through the Claude Agent SDK. Seven sub-agents try to reject the job's tailored resume (or your base resume if it isn't tailored yet): an automated screen, the hiring manager, and five readers who each judge it alone (hiring manager, another applicant, CEO, recruiter, teammate). It merges their notes into one list of mistakes, worst first, rebuilds the resume with the same facts (`[ADD: …]` where only you know the answer), and screens it again. "Use as tailored resume" applies the rebuilt version (refused if the resume changed since the panel read it); Undo puts the old one back. About 2 minutes and ~8 sub-agent calls per run, on your Claude plan. Needs `LLM_PROVIDER=claude-agent-sdk`. Each run works in its own folder under `data/panel-runs/` and may only touch files there.
- **Portfolio projects** (job → Projects, or the "skills missing: build project" prompt on the card): for skills the job asks for that your resume doesn't cover, a developer agent (Claude Agent SDK) builds a small, working project that really uses them, installs the real libraries, runs its tests, and writes a full README. If the tests pass and a secret scan of the files is clean, it pushes the project to your GitHub (**private by default**, via the local `gh` login) and adds it to the job's tailored resume: a Projects entry with the link, XYZ bullets, the skills, and a summary clause when it fits. "Remove from resume" undoes that exactly. The agent runs in an OS sandbox (bubblewrap) that can only write to the project folder (plus a shared `data/toolchains/` for the .NET SDK and NuGet cache) and only reach PyPI, npm, NuGet and Microsoft's .NET download hosts. It uses a bundled npm 10 (older npm can't authenticate to the sandbox's proxy), and installs the .NET 8 SDK on first use (~200 MB, once). At most 2 builds run at once, builds time out after 25 minutes, and a server restart stops running agents and marks their builds as interrupted (Retry resumes from the failed stage). Needs `LLM_PROVIDER=claude-agent-sdk`, `gh auth login`, and bubblewrap on Linux. Personal use only, since it uses this machine's Claude and GitHub logins.
- **Download** a tailored resume as PDF, DOCX or Markdown, straight from the card or from the detail view.
- **Update a resume** — edit the tailored or base resume directly on the page (click any line and type; Enter adds a bullet). A live meter beside the page shows which missing keywords are now included and the real page count of the PDF you will download, or re-run the analysis and the rewrite with extra notes ("my Kafka work was at Example Corp"). You can also edit or replace your base resume under "My resume".

## Setup

```bash
npm run install:all
cp server/.env.example server/.env   # optional: with no keys it uses the Claude Agent SDK on this machine's Claude login
```

Development (two terminals):

```bash
npm run server   # API on http://localhost:5050
npm run client   # UI on http://localhost:5173
```

Single-process production run:

```bash
npm run build && npm start           # http://localhost:5050
```

## Configuration (`server/.env`)

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | auto | `claude-agent-sdk` (alias `claude-code`), `anthropic` or `gemini`. Auto picks whichever key is set, else `claude-agent-sdk` |
| `ANTHROPIC_API_KEY` | — | For `anthropic` (`claude-sonnet-5-5`) |
| `GEMINI_API_KEY` | — | For `gemini` (`gemini-2.5-flash`) |
| `LLM_MODEL` | per provider | Override the model |
| `PORT` | `5050` | |
| `DATA_DIR` | `server/data` | SQLite database location |
| `MAIL_POLL_MINUTES` | `5` | How often connected Gmail inboxes are checked |
| `MAIL_SECRET` | random key in `data/mail.key` | Encrypts stored Gmail app passwords |
| `PROJECT_BUILD_MINUTES` | `25` | Time limit for one portfolio project build |

## How it works

- AI providers are agents (`server/src/llm.js`): an abstract `Agent` handles schema-validated JSON (zod), one corrective retry and quota errors. `ClaudeAgentSdkAgent` uses the Claude Agent SDK on this machine's Claude login (isolated: no tools except Read for PDFs, no settings, hooks, MCP servers or saved sessions; structured output via the SDK's json_schema format). Fine for personal local use; Anthropic's terms don't allow offering a claude.ai login to other users of a product, so use `anthropic` with an API key if others use the app. `AnthropicAgent` and `GeminiAgent` call their APIs.

- `server/` — Express + SQLite (better-sqlite3).
  - Creating a job returns right away. The LLM step runs in the background, and the UI polls until it finishes.
  - Resumes are stored in a small Markdown format: `# Name`, `## Section`, `### Role — Company`, `_dates_`, `- bullets`. `src/resumeFormat.js` renders that format to PDF (pdfkit) and DOCX (docx).
- `client/` — React + Vite, with `@hello-pangea/dnd` for the board.
