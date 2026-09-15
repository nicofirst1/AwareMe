# Layout round — 2026-09-15 (close-out report)

**Status: COMPLETE.** All six cycles from `layout-audit-2026-09-15.md` (constitution LC1–LC9 + cycle plan) were implemented, independently reviewed, merged `--no-ff` into `main`, and retired. Main ends the round at **typecheck clean, 309/309 tests** (round started at 277). This report is the round's durable summary; the per-cycle evidence (implementer measurements + full reviewer verdicts) lives committed in `.scratch/layout-audit-2026-09-15/issues/01–06`, and the capture images in `docs/design/layout-round-2026-09-15-captures/`.

## How the round ran

Six cycles, each executed by a dedicated agent in an isolated git worktree (`six_endings-cNN`, branch `layout/cycle-NN`), fanned out in three dependency-gated waves:

- **Wave 1 (parallel):** c01 Home, c02 Write, c03 Stems — disjoint file-ownership maps.
- **Wave 2 (after c03's `ScreenHeader` merged):** c04 History/Review, c05 Settings/Export/Import.
- **Wave 3 (after c05's `StepperRow` merged):** c06 Progress/About/Onboarding — the final cycle.

Every cycle closed through the same loop: implementer posts READY (gates green, both-theme capture evidence measured with `scripts/audit-frame-table.py` + `scripts/audit-ocr.swift` and quoted into the issue's Comments, self-audit clean, single squashed commit) → a **fresh, independent reviewer agent** re-runs the gates, re-measures the evidence, and appends a verdict to the issue file → coordinator merges on APPROVED only. The round ran as a multi-agent delegation (herdr workspaces + agent-comms mesh); the pattern is captured as a reusable skill at `~/.agents/skills/herdr-delegation/`. Two harness swaps happened mid-round (claude quota exhaustion) — blocked reviewers were retired and reviews re-run end-to-end on pi/`GLM-5.3-Flash` (self-hosted vLLM), with no loss of verdict independence.

## Outcome per cycle

| Cycle | Screen(s) | Impl commit | Merge | Verdict |
|---|---|---|---|---|
| 01 | Home | `1953f3c` | `3aed9ac` | APPROVED (after one LC9 fix) |
| 02 | Write | `9f11f4e` | `a362103` | APPROVED |
| 03 | Stems + `ScreenHeader` | `77bc8a3` | `645ad4b` | APPROVED |
| 04 | History + Review | `a62a2ed` | `7c8a876` | APPROVED |
| 05 | Settings/Export/Import + `StepperRow` | `0e01e4f` | `da48a4e` | APPROVED |
| 06 | Progress/About/Onboarding | `bb959c8` | `2a5933b` | APPROVED |

### 01 — Home: the sitting becomes the hero
One `Card` holds the sitting eyebrow ("Morning/Evening sitting"), a read-time "N stems ready" count (`getActiveStemsForTimeOfDay` — computed, never stored), and both session-start buttons (current period primary). The status footer moved inside the card as a left-aligned stat row; "Review available" became a tappable row with trailing chevron instead of a third loose centered line. The ragged 3-3-2 tile grid's root cause was fixed (`minWidth: '30%'` + grow → fixed width, no grow): all 8 tiles measure 106.3–106.7pt in both themes. **Review found one blocking regression** — the relocated "Review available" used `accent` on `backgroundElement`, 4.35:1 in light theme (LC9 floor is 4.5:1); fixed by reverting to `textSecondary` (5.22:1 light / 7.64:1 dark), re-measured independently.

### 02 — Write: pinned timer strip + action bar (LC8, owner-decided)
The screen is now `topStrip` (fixed: sitting position + timer) + scrolling stack (stem + dim endings) + `bottomBar` (fixed: Start / action bar / completion block), in one `KeyboardAvoidingView`. Extracted `WriteTimerStrip` + `WriteActionBar` as JSDoc-documented shared components (reused by c04). **W4** (stale endings under the next Start gate) root-caused: `useWritingSession` holds `state.endings` until the next `start()` — fixed by gating the endings-stack render (and the badge + settle effects) on `!awaitingStart`, with a regression test driving a real 2-stem queue. **W5**: completion block renders in the bottom bar, never after the stack. **W3**: hairline top dividers (`StyleSheet.hairlineWidth`) as scan anchors. **Android finding**: `adjustResize` does not hold under edge-to-edge IME insets (measured via `dumpsys window`) — `behavior="height"` now applies on Android too; keyboard-up captures show the whole bar stack above the IME. §10 integrity verified untouched (numerals ≤ text size, single exit, no cards/color blocking).

### 03 — Stems: serif rows + the shared `ScreenHeader` (LC2, LC5)
New `src/components/screen-header.tsx` composes the existing `BackHeader` (kept public for not-yet-migrated screens): back row (44pt, x24, safe-area top) + title row (`title` 32, 44pt), optional trailing action, 16pt between. All three stems screens adopted it; header rows measure identical y70/y130 across stems/stem-edit/stem-import in both themes (a 6pt drift from `Button`'s default padding was found and fixed caller-side). Stem rows render `stem` serif 22 (T1 fixed); rows are top-anchored so first-line y is constant across 1-line and 2-line meta (T2 fixed: rows of 94/58/94pt start cleanly); the Edit affordance lives in a reserved 44×44 right slot (transparent background — a mid-capture fix); form labels are uppercase eyebrows (M2 fixed). Reviewer's seam assessment: "a deep module at a real seam — fit for wave 2."

### 04 — History + Review: filter collapse + LC5 row anatomy
The filter wall no longer buries the list (H1/H2): with the seeded corpus, five session rows sit above the fold (y250–846) in both themes with filters collapsed. Rows follow LC5: dates right-aligned in a reserved 72pt meta column (right edge ≈x362.7), constant first-line offset, dim secondary lines. Review adopts the c02 primitives in `MetaStemSession` (Continue y768–824 at first paint, both themes) and `ScreenHeader`. Reviewer verified ADR-0001/uncensored-mode inheritance (backspace restriction flows through `useWritingSession`) and §13.4/§13.6 copy discipline untouched.

### 05 — Settings/Export/Import: one rhythm + the shared `StepperRow`
New `src/components/stepper-row.tsx` unifies the number-stepper pattern (settings' old `NumberStepper` and onboarding's inline +/- anatomy) with a documented API for wave 3. Settings settles to one vertical rhythm (24 section gap / 8 row gap / 4 label-to-control; 70pt blocks, one-line hints). **Export/Import behavior untouched** — `src/export` diff = 0 lines, round-trip tests green, §8's two-tap reachability intact. One pre-approved out-of-map exception landed here: a single JSDoc line on `ScreenHeader`'s `trailingAction` (c03 reviewer advisory — "keep children ≤44pt tall"), documented in the hub log.

### 06 — Progress/About/Onboarding: big numbers + stepper adoption (final cycle)
Progress stat values render at `subtitle` scale (h30, right edge x378) under `TOTALS`/`BADGES` eyebrows — descriptive only (§13.4/§13.6). About link rows are 44pt (y340/y392) with accent chevrons pixel-verified in both themes. Onboarding adopts the shared `StepperRow` (44×44 buttons) with `MORNING`/`EVENING` eyebrow labels; the inline `PrefRow` pattern is **gone** (M3 closed — one stepper anatomy app-wide, zero dead code). Reviewer confirmed gamification logic files diff = 0 and §13.7 (no stored derived values) holds.

## Cross-cutting fixes landed during the round

- **`5f183b9` — time-bomb test fix.** `repository.session.test.ts`'s `getRecentStemUsage` "last 14 days" tests hardcoded 2026-09-01/05 fixtures against a rolling wall-clock window; the 09-01 row crossed the cutoff mid-round (2026-09-15 08:23 UTC) and failed every gate. Root-caused by the c03 implementer (proven identical on base `52e6ba7`); fixtures now derive from `Date.now()` and can never age out.
- **`9929b9e` — settings label parity.** c06 flagged that settings' Morning/Evening window-row labels still rendered body-size `default` text after onboarding moved the same concepts to eyebrows; fixed post-merge (coordinator one-liner), gates green.

## Constitution adoption (LC1–LC9) — all landed

- **LC1 grid** — 24pt column held everywhere; verified per cycle. **LC2 `ScreenHeader`** — now on *every* secondary screen (stems ×3, history, review, settings, export, import, progress, about, onboarding); Home and Write keep their own anchors per the constitution. **LC3 rhythm** — one 24/8/4 cadence (c05 closed the last split). **LC4 card spec** — normative, reused (c01/c04). **LC5 row spec** — stems, history, review (top-anchored, serif-for-content, reserved meta columns). **LC6 typographic roles** — decisive use incl. eyebrows for labels and the big-number treatment. **LC7 one anchor per section** — sitting card, filter band, period selector + pinned Continue, stat panel. **LC8 write exception** — pinned strip/bar structural, order-not-decoration. **LC9 non-negotiables** — verified each cycle: AA contrast (one regression caught and fixed), no new dependencies, tokens untouched, §13.4/§13.6/§13.7 clean.

## Verification record

- **Gates:** every cycle and every merge re-ran `tsc --noEmit` + `jest`. Final main: 309/309 (277 at round start; +32 tests across cycles, incl. regression tests for W4 and per-screen suites).
- **Evidence:** 66 capture files (PNG + `.axtree.json`, both themes) from c02–c06 are committed under `docs/design/layout-round-2026-09-15-captures/` (c01's worktree captures were disposed before the backup convention existed — its measurements live quoted in issue 01's Comments). Every number in this report traces to a committed issue-file verdict or the log snapshot.
- **Independence:** each verdict was produced by a reviewer agent that did not write the code, re-ran the gates, and re-measured the captures with the committed helpers.
- **Coordination log:** full round log (lock claims, READYs, verdicts, harness swaps, merges, retirements) snapshotted at `docs/design/layout-round-2026-09-15-log.md`.

## Residues (owner items)

1. **Issue 07 side-observations** (`needs-triage`, `.scratch/layout-audit-2026-09-15/issues/07-side-observations.md`): dead Theme setting (`settings.theme` persisted but `use-theme.ts` reads only the system scheme), locale-mixed date formats, dual search inputs.
2. **M7 store prep** inherits the compliant UI.
3. **Optional follow-up:** `BackHeader` can now be privatized behind `ScreenHeader` (migration is complete; flagged by the c03 reviewer as the right direction).
4. **Non-blocking advisories** (contrast notes, JSDoc tensions, methodology noise) are catalogued inside each cycle's `## Reviewer verdict` in its issue file — nothing open, all judgement-call severity.
