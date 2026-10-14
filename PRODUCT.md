# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Job seekers running an active search, tracking many applications at once. Public product: anyone can sign up for their own private account. Used on laptops and desktops, both during the day and in the evening.

## Product Purpose
Tracks job applications on a kanban board and turns one base resume into a version tailored to each job. Success means the user knows where every application stands, and sends a stronger, honest resume for each role without rewriting it by hand.

## Positioning
Each job card runs a three-stage resume pipeline:
1. A recruiter analysis for that exact company: a score out of 100, the top 5 missing keywords, and 3 red flags spotted in 10 seconds.
2. After the user accepts, an XYZ-formula rewrite of the Experience section.
3. An ATS and 200-resume skim pass that rewrites the sections a reader would skip.

Truthfulness is enforced in two ways. Metrics the resume doesn't support become placeholders the user fills in, and keyword coverage is verified in code rather than trusted from the model.

## Operating Context
- The user pastes in a job description, then reviews the analysis.
- Before accepting, the user can add notes to steer the rewrite. Afterwards they edit or download the tailored resume (PDF, DOCX, MD).
- Applications move across the user's own statuses by drag and drop. Defaults: Saved, Applied, Accepted, Interview, Offer, Hired, Rejected. Users can add statuses and remove empty ones.
- The user returns repeatedly over weeks of a job search.

## Capabilities and Constraints
- Username/password accounts.
- PDF-only resume upload, read directly by the LLM (Claude or Gemini).
- Each LLM stage takes 20–60 s, so the UI must show progress per stage.
- Stack: React 19 + Vite, plain CSS, `@hello-pangea/dnd`, served by Express.
- Must follow the system light/dark preference.

## Brand Commitments
- Name: "Job Tracker" (working name).
- Visual direction pinned by the user: glassmorphism.

## Evidence on Hand
No logo, testimonials, user counts or other proof exists, and none may be invented.

## Product Principles
- Honest over impressive: never fabricate resume facts or product claims.
- The board is home: status at a glance, details one click away.
- Long AI steps stay visible and never block other work.
- The user stays in control: review before rewrite, edit before send.
