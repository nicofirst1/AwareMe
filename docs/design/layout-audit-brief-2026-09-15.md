# Layout audit brief — 2026-09-15

Status: **mandate confirmed by the owner 2026-09-15; the audit has not been run yet.** The executing agent runs the audit per this brief and lands its findings + cycle plan in `layout-audit-2026-09-15.md`. This file stays as the mandate record — do not edit it to add findings.

## Owner verdict (the problem being solved)

- From real use of the installed build: the app reads **"too minimal / gray / empty"**, **"messy and unstructured"**, **"does not look professional."**
- **This is not a color complaint.** The owner explicitly retired the color framing from the two 2026-09-11 audits. The color/hierarchy work from cycles 1–4 (commits `392d51b`, `6443c18`, `dad6eb4`, `309e074`) **stays untouched** — this pass restructures layout underneath it, it does not revert or redo it (owner confirmed).
- One confirmed functional finding, decided by the owner: **the write screen's timer must be pinned at the top.** "When you write and the sentences stack, the timer disappears." Today both timer signals sit below the input — per-stem `ProgressBar` and the countdown button (`src/app/write.tsx` ~:368–380), after the growing stack of submitted endings — and nothing on the screen is pinned, so both scroll/fold away as endings accumulate.
- Levers in scope: **layout, spacing, alignment, typographic hierarchy, component consistency.** Not in scope: color rework, new features, new dependencies.
- Horizon: **open-ended** until the app feels right to the owner; M7 (store prep) inherits the result.

## Register anchor (owner's reference apps)

The owner named **YouTube, Telegram, Revolut** as "professional." The shared denominator, translated into audit criteria:

- **Strict alignment grid** — every element aligns to something else; consistent edge margins across screens (today each screen composes its own).
- **Disciplined row/card anatomy** — Telegram chat-row discipline (bold primary line / secondary preview / right-aligned meta) for history, session-detail, and stems rows; Revolut-style sectioned cards with confident large numbers for Home and Progress; YouTube-crisp grids and filter rows for the stem library.
- **Strong typographic weight contrast** — few sizes, used decisively; big numbers; clear primary-vs-secondary text roles.
- **Tight, consistent spacing rhythm** — one section/vertical rhythm, not per-screen improvisation.
- **Visual anchors** — one dominant element per screen section (a number, a card, a row) so screens read as ordered, not stacked text.
- Order without decoration. Calm is not the enemy; **formlessness is.**

## Hard constraints (still binding — do not relitigate)

- `spec.md` §10 (as amended 2026-09-11): calm, text-first, nothing bounces; typography carries the design.
- **Write screen: order only, never decoration.** No cards/chrome/color blocking there. §10's "no navigation chrome beyond a single exit affordance" still binds — a pinned timer strip is the timer, not navigation chrome, and is allowed. ADR-0001's momentum rules and uncensored-mode integrity (`contextMenuHidden`, no select/cut, endings never re-openable) are untouched.
- §13.4/§13.6/§13.7: no evaluation, no shaming, no stored derived values; gamification stays bounded by `gamification-proposal-2026-09-11.md`.
- **No new dependencies.** Both themes; text AA 4.5:1 in both. The full app **must function in airplane mode.**
- Typography: tune **within system faces** (`Fonts` in `src/constants/theme.ts`: `ui-serif`/New York + `system-ui` on iOS; Android defaults Roboto/Noto-Serif). Bundling font files is a separate later decision only if the audit proves system faces are the ceiling.
- Every schema/data rule (§4) is irrelevant here — this is a pure UI pass; nothing in `src/db/` changes except read-side queries if a screen needs data it doesn't already read.

## Method for the audit

1. **Drive the iOS simulator** (owner directive). The 2026-09-11 color audit lost four screens to idb flakiness — capture the **never-audited screens first: write, export, session-detail, review** — then home, stems, stem-edit, stem-import, history, settings, progress, onboarding, about.
2. **Both themes per screen.** Name captures in the house style (`01-home-light.png`, …) and reference them from findings.
3. **Android emulator spot-check** (3–4 representative screens): the owner lives on the Android APK and `system-ui`/`serif` resolve to Roboto/Noto-Serif there — platform deltas get their own findings rather than being averaged away.
4. Findings are **screenshot-grounded** (file:line cross-references like the prior two audits), judged against the register criteria above — not against the auditor's taste.
5. Deliverable: `layout-audit-2026-09-15.md` containing (a) per-screen numbered findings, (b) a **layout constitution** the cycles will enforce — edge margins, header block pattern (one header anatomy for all secondary screens; today `BackHeader` exists but screens still hand-roll rows around it), section vertical rhythm, card/row anatomy, list-row spec — and (c) a **cycle plan** ordered by screen traffic (Home → Write → Stems → History/Review → Settings/Export/Import → remainder), each cycle small, independently committable, screenshot-checkable acceptance criteria, no new deps.
6. Process per house rules: one issue file per cycle under `.scratch/<feature-slug>/issues/`, a DECISIONS.md entry for the round, `npm run typecheck` + `npm test` green per cycle, one commit per cycle.

## Unverified priors (hypotheses to check against screenshots — NOT findings)

- Every screen hand-rolls its own header row inside `SafeAreaView`; `BackHeader` (gamification cycle 3) exists but header anatomy still varies per screen — height, title weight, back affordance placement.
- Spacing is composed freely per screen from the `Spacing` scale; no shared section rhythm or edge-margin constant.
- Home's status block is loose text lines, not a structured panel; the 7-tile grid is uniform-weight boxes, not a hierarchy (Revolut would make the sitting the hero).
- History/session-detail rows join metadata with `' · '` on one secondary line — no Telegram-grade meta hierarchy (bold name / dim preview / right meta).
- `write.tsx` has no scan anchor between stacked endings (ui-audit 2026-09-11 flagged this; never addressed); timer signals below the fold (owner-confirmed).
- `progress.tsx` stats are plain `StatLine`s — small label + small number — vs. the Revolut-style big-number treatment the register suggests for a "peak" screen.
- Badges are text-only (no icons) — color-audit idea C's icon half never landed; relevant if the audit touches Progress.

## Context pointers

- Prior rounds: `ui-audit-2026-09-11.md` (code-level), `color-audit-2026-09-11.md` (simulator, cycles 1–4 landed, cycle 5 explicitly optional/unstarted), `gamification-proposal-2026-09-11.md` (shipped).
- `DECISIONS.md` — append the round's entry when the audit lands; the 2026-09-15 entries above it are the current tail.
- Tokens in `src/constants/theme.ts`: `Colors` (incl. per-theme `accent`, `accentMuted`, `border`, `success`), `CategoryColors`, `PressureColors`, `CelebrationColors`, `Radius`, `Spacing`, `Fonts`, `MinTouchTarget`.
- Shared components available for the constitution to standardize on: `Card`, `Button`, `FilterChip`, `SectionHeader`, `ProgressBar`, `BadgeCard`, `EmptyState`, `BackHeader` (`src/components/`).
- Session model context: mornings/evenings are sittings over `stems.time_of_day` (ADR-0004) — Home's hero content, if the audit proposes one, is sitting progress.
