---
name: Job Tracker
description: A dense kanban of neutral frosted lanes on one cool backdrop, where only what needs the user turns blue.
colors:
  primary: "#0b63ce"
  primary-hover: "#0a56b3"
  on-primary: "#ffffff"
  backdrop: "#dde3eb"
  backdrop-light: "rgba(255, 255, 255, 0.75)"
  ink: "#0f1726"
  ink-2: "#444e60"
  ink-3: "#5c6577"
  glass: "rgba(255, 255, 255, 0.52)"
  glass-strong: "rgba(247, 249, 252, 0.9)"
  glass-border: "rgba(255, 255, 255, 0.65)"
  edge: "rgba(255, 255, 255, 0.9)"
  surface: "rgba(255, 255, 255, 0.82)"
  surface-hover: "#ffffff"
  line: "rgba(15, 23, 38, 0.09)"
  line-strong: "rgba(15, 23, 38, 0.16)"
  input-bg: "rgba(255, 255, 255, 0.8)"
  btn-bg: "rgba(255, 255, 255, 0.72)"
  seg-bg: "rgba(15, 23, 38, 0.06)"
  seg-active: "#ffffff"
  chip-bg: "rgba(15, 23, 38, 0.06)"
  error: "#be123c"
  tone-good: "#047857"
  tone-ok: "#a16207"
  primary-dark: "#4d9bff"
  primary-hover-dark: "#6aabff"
  on-primary-dark: "#06101f"
  backdrop-dark: "#0e131c"
  backdrop-light-dark: "rgba(110, 140, 220, 0.14)"
  ink-dark: "#e9edf4"
  ink-2-dark: "#b4bccb"
  ink-3-dark: "#8d97a9"
  glass-dark: "rgba(28, 34, 46, 0.55)"
  glass-strong-dark: "rgba(20, 25, 35, 0.92)"
  glass-border-dark: "rgba(255, 255, 255, 0.07)"
  surface-dark: "rgba(255, 255, 255, 0.045)"
  surface-hover-dark: "rgba(255, 255, 255, 0.075)"
  line-dark: "rgba(255, 255, 255, 0.08)"
  line-strong-dark: "rgba(255, 255, 255, 0.15)"
  error-dark: "#fb7185"
  tone-good-dark: "#34d399"
  tone-ok-dark: "#fbbf24"
  status-saved: "#64748b"
  status-applied: "#0ea5e9"
  status-mail-received: "#8b5cf6"
  status-accepted: "#14b8a6"
  status-interview: "#f59e0b"
  status-offer: "#84cc16"
  status-hired: "#10b981"
  status-rejected: "#f43f5e"
  paper: "#ffffff"
  paper-ink: "#111111"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.03em"
  figure:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "48px"
    fontWeight: 650
    lineHeight: 1
    letterSpacing: "-0.04em"
    fontFeature: "tnum"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 650
    letterSpacing: "-0.015em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "13.5px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Mona Sans Variable', system-ui, sans-serif"
    fontSize: "12.5px"
    fontWeight: 600
  mono:
    fontFamily: "ui-monospace, 'SFMono-Regular', Menlo, Consolas, monospace"
    fontSize: "12.5px"
  paper:
    fontFamily: "Helvetica, Arial, sans-serif"
    fontSize: "13px"
    lineHeight: 1.4
rounded:
  tag: "6px"
  control: "8px"
  card: "10px"
  panel: "14px"
  dot: "999px"
  paper: "4px"
spacing:
  gutter: "10px"
  card-gap: "6px"
  card-pad: "10px 12px"
  sheet-pad: "20px"
  section: "18px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-default:
    backgroundColor: "{colors.btn-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-icon:
    textColor: "{colors.ink-3}"
    rounded: "{rounded.control}"
    size: "30px"
  input:
    backgroundColor: "{colors.input-bg}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "7px 10px"
    height: "34px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "10px 12px"
  card-hover:
    backgroundColor: "{colors.surface-hover}"
  lane:
    backgroundColor: "{colors.glass}"
    rounded: "{rounded.panel}"
  sheet:
    backgroundColor: "{colors.glass-strong}"
    rounded: "{rounded.panel}"
    width: "560px"
  segmented:
    backgroundColor: "{colors.seg-bg}"
    rounded: "{rounded.control}"
    padding: "2px"
  segmented-active:
    backgroundColor: "{colors.seg-active}"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
  keyword-tag:
    backgroundColor: "{colors.chip-bg}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tag}"
    padding: "2px 7px"
  status-dot:
    size: "7px"
    rounded: "{rounded.dot}"
  resume-paper:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.paper-ink}"
    typography: "{typography.paper}"
    rounded: "{rounded.paper}"
    padding: "40px 48px"
---

# Design System: Job Tracker

## Overview

**Creative North Star: "Refined Glass"**

A professional tool, not a showpiece. The board has Linear's density and the material polish of macOS and visionOS. Glass is what the chrome is made of: a floating top bar, eight full-height lanes and a side sheet. Each is a neutral frosted pane over one cool, single-tone backdrop lit softly from above. Colour is reserved for the things that need the user. Everything else stays in three greys of ink.

The system replaces an earlier "status is light" world (lanes tinted in rainbow hues, light pools behind each lane, an ink-coloured primary pill), which the user rejected as looking vibecoded. Nothing from that world survives except the brand mark. Neither theme is secondary: light and dark are both full token sets, chosen by a System/Light/Dark switch. An inline script in `index.html` applies the choice before first paint.

**Key Characteristics:**
- One cool backdrop (light #dde3eb, dark #0e131c) with a single radial light from above the viewport.
- Neutral frosted panes (blur 24px, saturate 140%), each with a 1px top edge highlight.
- One accent, system blue. Red marks failures. Hue appears nowhere else.
- Status is shown by a 7px dot. Lanes are never tinted.
- Hairline dividers, not nested cards.
- Radius scale of 14 / 10 / 8 / 6.
- The resume renders as white Helvetica paper in both themes.

## Colors

Cool neutrals with a single blue voice. Every hue on screen has to justify why it is there.

### Primary
- **System Blue** (light `primary`, dark `primary-dark`): fill for primary buttons. Text colour for "needs you" card states ("Review analysis", "N to fill") and for in-progress AI states. Also used for the focus outline (2px, offset 2px), the 3px focus halo on fields (blue at 20%), text selection (blue at 26%), text links, the "AI-filled" field tag, matched-keyword checks, the active stage and onboarding step, the first-run lane prompt icon, and the accent lane in the logo. Hover deepens it in light mode and lightens it in dark mode.

### Neutral
- **Cool Mist** (`backdrop` / `backdrop-dark`): the single page backdrop. `backdrop-light` is the radial glow at 50% −25% that supplies the one light source.
- **Deep Ink, Slate Ink, Quiet Ink** (`ink`, `ink-2`, `ink-3`, plus dark variants): primary text, secondary text (company names, labels), and tertiary text (counts, help, placeholders, idle states).
- **Frost** (`glass`, `glass-border`, `edge`): lane and top-bar panes. `glass-strong` is the denser pane used for sheets, notices, the lane drop target, and every fallback.
- **Card Surface** (`surface`, `surface-hover`): cards sitting on the glass. In light mode they are near-white. In dark mode they are a 4.5% white lift.
- **Hairlines** (`line`, `line-strong`): every divider and border. Ink at 9% or 16% in light mode, white at 8% or 15% in dark mode.

### Semantic
- **Error Red** (`error` / `error-dark`, CSS `--low`): failed AI steps, form errors, error notices, the danger button's text, and the analysis's red-flag icons.
- **Score Tones** (`tone-good`, `tone-ok`, `error`): used only on the 48px score figure in the analysis sheet. Thresholds are ≥75, ≥50, and below 50. The card's score number stays `ink-2`.
- **Status Hues** (`status-*`): eight hues defined in `api.js`, painted only on the 7px lane dot.

### Named Rules
**The One Voice Rule.** Blue means "act here" or "this is live". Never use it for decoration, headings or idle state.

**The Spent-Only-Where-Needed Rule.** Tone colours belong to the score figure, status hues belong to the dot, and red belongs to failures. If a hue appears anywhere else, it is a defect.

## Typography

**Display / Body Font:** -apple-system, BlinkMacSystemFont, then Mona Sans Variable (self-hosted), then system-ui.
**Mono:** ui-monospace, SFMono-Regular, Menlo, Consolas (markdown editor, placeholder codes).
**Paper:** Helvetica, Arial (resume preview only).

**Character:** SF on Apple devices and Mona Sans everywhere else. One neutral grotesque, so hierarchy comes from size and weight steps such as 550, 600 and 650 rather than from a typeface pairing. Text is antialiased, and every number uses tabular figures.

### Hierarchy
- **Display** (700, 38px, 1.1, −0.03em; 30px under 860px): the single headline on the auth intro. Balanced, max 17ch.
- **Figure** (650, 48px, 1, −0.04em, tabular): the analysis score. It is the only toned type in the system.
- **Headline** (650, 20px, −0.015em): auth card heading. The onboarding heading is 24px at 680.
- **Title** (650, 17px, 1.3, −0.01em): sheet titles.
- **Card title** (600, 13.5px, 1.3): job titles on cards. Lane names are 600 at 13px.
- **Body** (400, 14px, 1.45): base text. Analysis prose is 14.5px at 1.55, max 68ch. The lede is 15.5px, max 52ch.
- **Label** (600, 12.5px): form labels and counts. Secondary meta (company, help, tally) is 12.5px at 400–500.

### Named Rules
**The Tabular Rule.** Counts, scores and tallies always use `font-variant-numeric: tabular-nums`.

## Layout

The app shell fills the full viewport (100dvh). It has a 10px outer padding and a 10px gap: a 52px floating top bar, an optional notice strip, then the board. The board is a column grid with one full-height lane per status, each lane at least 220px wide, gaps of 10px, and horizontal scroll when the lanes overflow. A lane has a head (12/14/8 padding) and a scrolling body (2/8/10 padding). Cards stack with a 6px gap.

Details open in a side sheet pinned 10px from the right, top and bottom edges. It is 560px wide, or 1100px in the wide variant, so the board stays visible behind it. Sheet body padding is 20px. Sections inside the sheet are spaced 18–20px apart and separated by hairlines. Analysis uses two columns 32px apart. The resume tab is editor or paper plus a 280px insights aside.

Breakpoints:
- **1100px:** the insights aside drops below the content.
- **860px:** auth stacks and analysis becomes one column.
- **720px:** the shell padding drops to 8px. The top bar wraps, with search on its own row and secondary buttons collapsing to icons. Lanes become 84vw scroll-snap columns. The sheet fills the viewport inset by 8px.
- **420px:** the primary button also collapses to an icon.

## Elevation & Depth

Depth comes from material, not stacking. The backdrop is lit from above. Glass panes blur and saturate it (`blur(24px) saturate(140%)`) and carry a 1px inset top highlight (`edge`) plus a soft, wide drop shadow. Cards rest almost flat. Only a dragged card lifts. Sheets use heavier glass (`blur(44px)`) over a 40% backdrop-tinted scrim. The scrim itself has no backdrop-filter, because that would make it the backdrop root and kill the sheet's blur.

### Shadow Vocabulary
- **Pane** (`inset 0 1px 0 var(--edge), var(--shadow)`; light shadow is `0 1px 1px rgba(15,23,38,.04), 0 10px 30px -14px rgba(15,23,38,.22)`): the top bar, lanes and auth card.
- **Rest** (`0 1px 1px rgba(15,23,38,.05)`): cards at rest.
- **Lift** (`0 2px 4px rgba(15,23,38,.08), 0 22px 44px -16px rgba(15,23,38,.35)`): the dragged card only.
- **Segment** (`--shadow-seg`: `0 1px 2px rgba(15,23,38,.14)`, `rgba(0,0,0,.4)` in dark mode): the active segment of a segmented control.
- **Paper** (`0 1px 2px rgba(0,0,0,.08), 0 16px 36px -20px rgba(15,23,38,.45)`): resume paper.

### Named Rules
**The Lifted Pane Rule.** This is the signature interaction. A card being dragged turns into its own glass pane (`glass`, `blur(18px) saturate(160%)`, Lift shadow, scale 1.02) and floats over the board.

**The Unstacked Lane Rule.** The lane's glass lives on a `::before` layer at `z-index: -1`. The lane itself must never create a stacking context: no `z-index`, `transform`, `filter`, `opacity < 1` or `backdrop-filter` on it. Otherwise the fixed-position dragged card gets trapped in the lane or painted under later lanes.

**The Fallback Rule.** When reduced transparency is requested, `--glass` falls back to `--glass-strong` and backdrop blur is removed from panes, lanes and the dragged card. When `backdrop-filter` is unsupported, `--glass` also becomes `--glass-strong`. The glass must still read as solid surfaces in both cases.

## Shapes

Corners nest. Panels are 14px (top bar, lanes, sheet, auth card), cards and dashed empty and drop zones are 10px, controls are 8px (buttons, fields, search, segmented tracks, form errors), and tags and inner segments are 6px. Dots and avatars are fully round. Resume paper is 4px, because it imitates a sheet of paper. Borders are always 1px hairlines. Empty states and dropzones use a dashed `line-strong` border.

## Components

### Buttons
Quiet glass buttons, with blue reserved for the one primary action.
- **Shape:** gently rounded (8px), 32px tall, 12px horizontal padding, 13px at 550. Auth's block variant is 38px tall.
- **Primary:** System Blue fill and `on-primary` text, with no border. Hover moves to `primary-hover`. Use at most one per view.
- **Default:** translucent `btn-bg` with a hairline border. Hover goes to `btn-bg-hover` with `line-strong`.
- **Danger:** a default button with Error Red text.
- **Icon:** 30px (or 24px in the small variant, with a 6px radius), transparent, `ink-3`. Hover adds a `chip-bg` wash and `ink` colour.
- **Press:** scale 0.97 (icons 0.94, cards 0.985) on `cubic-bezier(0.23, 1, 0.32, 1)`, 160ms.
- **Focus:** a 2px System Blue outline, offset 2px, everywhere.

### Segmented Control
The theme switch (System/Light/Dark) and the sheet tabs share one track: `seg-bg`, 2px padding, 8px radius. The active segment is `seg-active` with the Segment shadow and a 6px radius. Inactive segments are `ink-3` and change to `ink` on hover.

### Cards
- **Anatomy:** title (card title), company (12.5px, `ink-2`), then one foot line: the score number (12.5px/600, `ink-2`, tabular), a single AI state, and an optional 24px PDF icon button pushed to the right.
- **AI state:** exactly one line. "Needs you" and working states use blue (working adds a 6px pulsing dot). Failure uses red with an alert icon. Ready and idle states use `ink-3`.
- **Surface:** `surface` on hairline `line`, Rest shadow, 10px radius, 10/12 padding. Hover moves to `surface-hover` with `line-strong`.
- **Focus:** the drag handle's focus ring is drawn on the card.

### Lanes
A neutral glass pane on `::before`. The head has a 7px status dot, the lane name (13px/600) and a plain `ink-3` count. While a card is dragged over a lane, its glass swaps to `glass-strong` over 200ms. Empty lanes show a dashed 10px box. On first run, the Saved lane shows a clickable prompt with a blue plus icon.

### Inputs / Fields
- **Style:** `input-bg`, 1px `line-strong` border, 8px radius, 34px tall (inputs and selects), padding 7/10, 13.5px. The caret is System Blue.
- **Focus:** the border becomes System Blue and a 3px blue halo at 20% appears. The search field does the same through `:focus-within`.
- **Error:** form errors are 8px boxes with red text on red at 8% with a 22% border.
- **Dropzone:** dashed 10px box on `input-bg`. The border turns blue on hover or focus.

### Navigation (Top Bar)
A floating glass pane (14px, 52px minimum height). Left to right: logo, brand and count, centered search (max 420px), My resume, the blue New application button, the theme switch, and an account cluster set off by a left hairline.

### Side Sheet
A `glass-strong` pane with `blur(44px)`. It slides in from 28px to the right over 320ms on `cubic-bezier(0.32, 0.72, 0, 1)` and fades in via `@starting-style`. The footer sits behind a top hairline. Content is never nested in cards: analysis sections are separated by `border-top` hairlines, and the insights aside is separated by `border-left`.

### Resume Paper
The resume is the artifact being sent, so it renders the same as the pdfkit PDF in both themes. It uses white paper, #111 Helvetica at 13px/1.4, a centered 24px name, and uppercase 13px section heads with 0.06em tracking over a #888 rule.

### Notices
A single quiet strip: `glass-strong`, a hairline border, 10px radius, `ink-2` text. Only the error variant takes colour (red text).

## Do's and Don'ts

### Do:
- **Do** spend System Blue only on primary actions, "needs you" or live states, focus and selection.
- **Do** keep lanes neutral and show status only with the 7px dot.
- **Do** separate sections inside sheets with 1px hairlines (`line`).
- **Do** follow the 14 / 10 / 8 / 6 radius nesting.
- **Do** keep the lane glass on `::before` and leave `.lane` without a stacking context.
- **Do** swap the drop-target lane to `glass-strong`, and fall back to `glass-strong` under reduced transparency or without backdrop-filter support.
- **Do** write only the unprefixed `backdrop-filter`. The build's lightningcss pass adds `-webkit-backdrop-filter` itself.
- **Do** keep motion at 320ms or less. Presses scale and reduced motion removes movement.
- **Do** render the resume as white Helvetica paper that matches the PDF, in both themes.

### Don't:
- **Don't** tint lanes or cards by status, and don't place light pools behind lanes. That was the rejected "status is light" world.
- **Don't** put tone colours anywhere but the analysis score figure.
- **Don't** use red for anything but failures, destructive actions and the analysis's red flags.
- **Don't** nest cards or boxed panels inside a sheet.
- **Don't** hand-write `-webkit-backdrop-filter`. When both were written by hand, the lightningcss minifier dropped the unprefixed declaration.
- **Don't** put `backdrop-filter` on the scrim, because it kills the sheet's blur.
- **Don't** give a card more than one state line.
