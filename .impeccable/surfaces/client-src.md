---
version: 1
slug: "client-src"
primary_target: "client/src"
related_targets: []
---

## Scope
Whole app shell: auth, resume onboarding, kanban board, job sheet (analysis / tailored resume / details), new-application sheet, resume sheet. Mode: Operate. Redesign with layout changes allowed; every feature and flow preserved.

## Audience and task
Job seekers mid-search (public product), on laptops and desktops, day and evening. Main tasks: see where every application stands, add a job, review the recruiter analysis, accept the tailoring, and fix placeholders before downloading.

## Direction contract
THESIS: Refined glass. The board reads like a professional tool (Linear-level density, Apple-level material polish). Glass is the material of the chrome, and colour is spent only on what needs the user. Supersedes the first pass ("status is light", rainbow-tinted lanes), which the user rejected as looking vibecoded.
OWN-WORLD: A single-tone cool backdrop (#dde3eb light / #0e131c dark) with one soft light from above. Neutral frosted panes. One accent, system blue (#0b63ce / #4d9bff), for primary actions, "needs you" states, focus and selection; red only for errors. Status is a 7px dot. Type is SF on Apple devices and Mona Sans elsewhere. Radius rule: panels 14, cards 10, controls 8, tags 6. Hairline dividers instead of nested cards. White resume paper.
STORY: The user scans the board and sees only what needs action, in blue. They open a card into a side sheet that keeps the board visible, then review, accept, fill placeholders and download.
FIRST VIEWPORT: A floating glass top bar with: brand and count; search; My resume; the blue "New application" button; the theme switch; the inline account cluster. Below it, six full-height neutral glass lanes, each headed by a dot, a name and a plain count. Cards show title, company, and one foot line (score number, one state, optional PDF icon).
FORM: Brief-pinned, waiver of the roll. The user's words: "redesign the UI. glassmorphism theme", then "application still looks its vibecoded", choosing "Refined glass" with Apple and Linear as references. A user-pinned direction beats the roll, so concept-seed was not run and there is no seed key. Signature interaction: a dragged card becomes a blurred glass pane lifted over the board. Motion: the sheet slides in at 320 ms on the drawer curve, presses scale to 0.97, nothing runs longer than 320 ms, and reduced motion removes movement.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
