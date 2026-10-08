# Job Tracker

Kanban board for job applications with LLM-tailored resumes.

- **Accounts** — register / log in with a username and password. Passwords are hashed with bcrypt, and sessions use an httpOnly cookie that lasts 30 days. Each user only ever sees their own jobs and resume. After registering, you're asked to upload your resume.
- **Kanban** — Saved → Applied → Mail received → Accepted → Interview → Offer → Hired → Rejected, with drag-and-drop.
- **New application** — job title, company and description are required. Experience and "based in" are optional; when you leave them blank, the LLM fills them in from the description (marked "AI-filled").
- **Resume pipeline per job** (three LLM stages):
  1. **Recruiter analysis** runs automatically when you create a job. You get a match score out of 100, the top 5 missing keywords, and 3 red flags a hiring manager would spot in under 10 seconds.
  2. **Accept**, which rewrites your Experience section to work in the missing keywords and remove the red flags, using Google's XYZ formula ("accomplished X as measured by Y by doing Z").
  3. **ATS and skim pass**: reads the new resume the way an ATS filter and a hiring manager going through 200 resumes would, reports which sections would get skipped, and rewrites them.

  Guardrails: the LLM never invents numbers; it writes placeholders like `[metric: % latency reduction]` for you to fill in, and the card flags them. Keywords only go in where your experience supports them; the rest are listed as "not added" with a reason. Whether each missing keyword actually made it into the resume is checked in code, not by the LLM. You upload your resume once as a PDF. The PDF goes straight to the LLM, which reads the layout itself. The database stores the original PDF, its extracted text, an editable Markdown version, and a structured JSON version (contact, sections, roles, skills).
- **Download** a tailored resume as PDF, DOCX or Markdown, straight from the card or from the detail view.
- **Update a resume** — edit the tailored or base resume directly on the page (click any line and type; Enter adds a bullet). A live meter beside the page shows which missing keywords are now included and the real page count of the PDF you will download, or re-run the analysis and the rewrite with extra notes ("my Kafka work was at Example Corp"). You can also edit or replace your base resume under "My resume".

## Setup

```bash
npm run install:all
cp server/.env.example server/.env   # optional: with no keys it uses the Claude Code CLI
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
| `LLM_PROVIDER` | auto | `claude-code`, `anthropic` or `gemini`. Auto picks whichever key is set, else `claude-code` |
| `ANTHROPIC_API_KEY` | — | For `anthropic` (`claude-sonnet-5-5`) |
| `GEMINI_API_KEY` | — | For `gemini` (`gemini-2.5-flash`) |
| `LLM_MODEL` | per provider | Override the model |
| `PORT` | `5050` | |
| `DATA_DIR` | `server/data` | SQLite database location |

## How it works

- AI providers are agents (`server/src/llm.js`): an abstract `Agent` handles schema-validated JSON (zod), one corrective retry and quota errors. `ClaudeCodeAgent` runs `claude -p` headless (no tools except Read for PDFs, no settings, hooks, MCP servers or saved sessions). `AnthropicAgent` and `GeminiAgent` call their APIs.

- `server/` — Express + SQLite (better-sqlite3).
  - Creating a job returns right away. The LLM step runs in the background, and the UI polls until it finishes.
  - Resumes are stored in a small Markdown format: `# Name`, `## Section`, `### Role — Company`, `_dates_`, `- bullets`. `src/resumeFormat.js` renders that format to PDF (pdfkit) and DOCX (docx).
- `client/` — React + Vite, with `@hello-pangea/dnd` for the board.
