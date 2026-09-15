# Layout audit — 2026-09-15

> **Close-out (2026-09-15, same day):** all six cycles of the implementation plan below were executed, independently reviewed, and merged — see `layout-round-2026-09-15.md` for the round report and `layout-round-2026-09-15-captures/` for the committed evidence.

Executed per the confirmed mandate (`layout-audit-brief-2026-09-15.md`). Owner verdict being solved: "too minimal / gray / empty", "messy and unstructured", "does not look professional" — **a layout complaint, not a color one.** The color-audit cycles 1–4 (`392d51b`, `6443c18`, `dad6eb4`, `309e074`) stay untouched; this pass restructures layout underneath them and reverts nothing.

## Method (and how to reproduce)

iOS simulator, iPhone 17 Pro (iOS 26.5), release build installed via `npx expo run:ios --configuration Release` (no Metro tether — chosen to avoid the idb/Metro flakiness that lost four screens in the 2026-09-11 color audit). Android emulator spot-check, Pixel-7-class AVD (1080×2400, 420dpi), the committed release APK via `./scripts/rebuild-android.sh`. Both themes per screen (`xcrun simctl ui <udid> appearance dark` / `adb shell cmd uimode night yes`).

Every screenshot was captured with a matching **accessibility-tree dump** (`idb ui describe-all` on iOS), so findings below cite *measured element frames* (points, y-sorted), not eyeballed impressions. Screenshots + `.axtree.json` dumps live in `/tmp/six-endings-layout-audit/` (session scratch, house precedent from the color audit); the measurements quoted here are the durable record. Screens were seeded with a realistic three-week corpus (14 sittings, 46 endings, 1 review, 2 user stems, a current 3-day streak) via the committed tooling `scripts/audit-seed-db.sh` (`--open` variant stages a mid-sitting state: four submitted endings + one half-typed field, alive inside its 90s window — this reproduces the owner's write-screen posture without hand-driving input). File naming per house style: `01-write-active-light.png`, `06-stems-dark.png`, `android-write-active-light.png`, …

A note on honesty: the writing agent on this round could not visually render PNGs, so every "what the screen shows" claim below is grounded in (a) a11y frame dumps, (b) OCR of the actual capture (macOS Vision), or (c) pixel-color sampling (ImageMagick) — all three against the same PNG a human sees. No finding rests on imagination.

**Verified priors from the brief, before findings:** header anatomy does vary per screen (4+ patterns — confirmed); spacing rhythm is composed per-screen (16 vs 24 — confirmed); Home's status block is loose centered lines (confirmed); history/session-detail meta joins with `' · '` (confirmed); write has no scan anchor between endings and unpinned timer signals (confirmed, owner-verified); Progress stats are small `StatLine`s (confirmed). One prior was wrong in an interesting way: the horizontal edge margin (24pt) is already consistent app-wide — the chaos is vertical rhythm and structure, not margins.

## 1. Write (`01-write-*.png`, `src/app/write.tsx`) — owner-decided fix lives here

**W1 — Timer signals are not pinned (owner-confirmed).** Measured in `01-write-active-light.axtree.json`: stem at y124, per-stem `ProgressBar` (write.tsx:336) at y208, four stacked endings at y227–547, input at y563–643, countdown Save button (:367–381) at y659–721, "Done" at y737–781, "N of M" counter (:451) at y797–819 — every timer signal is in the scroll flow below content that grows with every ending. Geometry of the failure: six two-line endings ≈ 612pt of stack push Save/Done/counter below the 874pt fold *even without a keyboard*; with the software keyboard (~336pt, top edge ≈ y538) even the input is partly covered. `android-write-active-light.png` is the owner's real posture (Android keyboard auto-opens on resume): keyboard top at ~y614 of a 915pt screen, input at 545–600, Save/Done/counter fully hidden. Only the stem and the first ~3 endings stay visible. The brief records the owner's decision: **the timer must be pinned at the top** — sanctioned as "the timer, not navigation chrome" under §10.

**W2 — The timer bar is illegible as a timer.** `progress-bar.tsx:31-33`: track `backgroundElement` `#F0F0F3` vs fill `backgroundSelected` `#E0E1E6` (light), `#212225` vs `#2E3135` (dark) — measured on-capture at the bar's y-position: ~6.5% luminance delta in light, ~5% in dark. It reads as one faint grey hairline, not a depletion signal. Color tokens are out of scope (color rounds), but the *layout* fix in cycle 2 gives the bar a reserved strip where it can be longer/wider — the pinning makes the signal viable.

**W3 — No scan anchor between endings (prior audit flagged; still unaddressed).** Endings render as plain serif lines, 16pt apart (write.tsx:342–346), same x=24, same face, same size as the stem — separated only by the grey of `textSecondary`. Four endings plus a stem read as an undifferentiated text block (the direct source of "messy and unstructured" on this screen). Telegram-style row discipline: each ending a dim, separated line — order, not decoration.

**W4 — Stale stack across the queue transition.** After a stem finishes, the *next* stem's Start gate renders with the previous stem's endings still stacked underneath (captured in `01-write-done-light.axtree.json`: "Stem 4 of 14", Start button at y688, the previous session's five endings at y268–672). Root: `submittedEndings` reads `session.state.endings` (write.tsx:334), which `useWritingSession` doesn't reset until the next `start()`. Mid-sitting the Start gate grows with stale content.

**W5 — The completion block's reachability depends on the stack.** "Saved." + duration + badge reveal + Close (write.tsx:396–448) render *after* the stack in scroll flow. Measured with five endings: "Saved." lands at y628 (visible). Six two-line endings put the settle animation and the badge reveal — the app's one sanctioned celebration moment — off-screen where the animation plays invisibly.

**W6 (keep-fact, for cycle 2's constraint)** — the countdown numeral is `subtitle` 20 next to `stem` 22 (§6.3.7: no numeral larger than text). The pinned strip must keep MM:SS at ≤ text size; `PressureColors` gradient stays.

## 2. Export (`02-export-*.png`, `src/app/export.tsx`) and Import (`src/app/import.tsx`)

**E1 — Header pattern A (the odd one out).** Export/Import are the only screens whose header sits in `SafeAreaView` with `padding: Spacing.four` + `gap: Spacing.three` (export.tsx:97–102): Back at y86, Title at y146. Every pattern-B screen (session-detail, review, history, settings, progress, about) puts Back at y62 with the title at y130. Two different back-row positions and two different title offsets for the same role.

**E2 — Icon color role differs from every other list surface.** Export/Import card icons render `textSecondary` grey (export.tsx:88, import.tsx:81) while Home tiles use accent/category hues and stems rows use category hues. Same component family (`Card`), three unexplained icon-color roles app-wide.

**E3 — Section rhythm variance.** Export's inter-block gap is 16 (`Spacing.three`) vs the 24 (`Spacing.four`) section rhythm used by settings/progress — the same rhythm-vs-rhythm inconsistency measured app-wide (see C3).

Card anatomy itself (icon+`subtitle` header row, `small` description, measured 110/110/88pt, stripe-free) is the best-behaved list surface in the app and is the model for the constitution's card spec.

## 3. Session detail (`03-session-detail-*.png`, `src/app/session-detail.tsx`)

**S1 — Meta joins everything into one `' · '` line with minute-resolution noise.** Each ending card's second line renders `formatTime(started_at) – formatTime(submitted_at) · N backspaces` (session-detail.tsx:82–86) with times formatted to minutes — measured: every ending on the captured session shows the identical string "08:15 – 08:15 · 2 backspaces". Fast writing makes the timing pair read as duplicated noise; backspace count is a metadata star. Telegram-grade row anatomy: dim preview/meta in a defined slot, meaningful units.

**S2 — Two content edges on one screen.** The stem snapshot floats at x=24 (y130, serif 22) while ending cards inset their text to x=40 (card padding) — the screen's two content blocks align to different left edges. (Same-card alignment: see list-row spec, LC5.)

**S3 — The destructive control is styled as inert metadata.** "Delete this session" is a grey `small` text link at y856 — indistinguishable from the ending meta lines above it; no separation, no grouping (its 44pt target is right).

## 4. Review (`04-review-*.png`, `src/app/review.tsx`)

**R1 — The primary CTA is at the bottom of a ~2,200pt stream.** Measured: "Continue" (review.tsx:155) at content-y 2218 — after every session block, roughly 2.5 screens down with a five-session period. The screen's one forward action is effectively hidden. Revolut/YouTube pattern: primary action at a fixed, visible position.

**R2 — Session blocks have no group header and no stem/ending hierarchy.** Each card opens with a dim date line, then the stem in serif 22, then its endings in serif 22 at `opacity: 0.85` (review.tsx:141–150, styles.ending:237) — inside a card the stem and its endings differ by 15% opacity and nothing else. No week grouping, no "N sessions / M endings" count per the period, no anchor. The screen is an undifferentiated stream — "stacked text" per the register's failure mode.

**R3 (good)** — period chips (7/14/30 days at y228) are 44pt `FilterChip` targets, consistent with the chip family app-wide. The meta-stem phase reuses write primitives (spec §6.5.2) — correct, and it inherits the write findings (W1–W5) while active; cycle 2's fix carries it.

## 5. Home (`05-home-*.png`, `00-home-fresh-light.png`, `src/app/index.tsx`)

**H1 — The sitting is not the hero; the screen has no visual anchor.** Measured (corpus home): centered title block y149–241, two full-width start buttons y245/310 (57pt each), a status block of three loose centered grey lines y391–439, then the 8-tile grid y507–685, footer y708. Twelve-plus equal-weight visual units, no dominant element. Per the register (Revolut): one sectioned card per screen section — the sitting is the product's daily action and should be the single dominant card ("Morning sitting · N stems", big count, both starts inside), with the status block as a quiet aligned stat row, not floating centered lines.

**H2 — Three alignment systems on one screen.** The header/status/footer text is center-aligned (measured: status lines start at x134/x152/x148 — centered), buttons/tiles align to x24, tiles' inner content is centered within each tile. The register: one alignment grid per screen. Also the status block mixes three behaviors in identical clothes — a count line, a streak line, and a tappable "Review available" link, all the same grey `small` centered text (index.tsx:156–174); the link must read as a row/anchor, not as a third loose line.

**H3 — The tile grid is ragged: 3-3-2.** Rows 1–2 hold three tiles each (measured 112.7pt wide), row 3 holds two widened tiles (173pt — Import/About) because `minWidth: '30%'` + `flexGrow` (index.tsx:266–276) lets wide labels take the row. An ordered grid (strict 3×3 with equal widths, labels wrapping) reads deliberate; the measured ragged grid reads improvised. (Progress tile's `accentMuted` fill verified on-pixel in both themes — the color rounds' work, untouched.)

**H4 (verified prior)** — Home is the only screen where the app's status/streak content appears as loose text lines rather than a structured panel; the sitting-card restructure absorbs it (cycle 1). §13.4/§13.6 bind the copy: descriptive only, never praise, absence never called out — the card's copy stays quiet.

## 6. Stems (`06-stems-*.png`, `src/app/stems.tsx`)

**T1 — The library's own content is the only stem text in the app not set in the serif face.** Rows render `type="default"` (stems.tsx:323) — sans 16. Write, history, session-detail, and review all render stem text as serif 22. The identity face is missing from the one screen whose content *is* stems. (stem-edit's input is sans 18, stem-import's preview `small` 14 — the whole authoring path previews stems smaller and differently than anywhere they're consumed.)

**T2 — Row anatomy: three sub-elements, no columns.** Meta renders as a wrapped line under the stem text — category chip then a `' · '`-joined string ("morning · seed · archived") (stems.tsx:325–336) — and "Edit" floats at x321 as a 41pt text link while the whole-row press target is a 270pt button. Telegram-grade: one dim meta line, a reserved right column for the row's action. Measured row heights vary 48–98pt with vertical centering, so one-line and two-line stems start at different y — the list's left edge rhythm wobbles.

**T3 (good)** — the list is reachable (rows from y310, below the search/chips chrome), and the collapsible "More filters" pattern (stems.tsx:168–172) works — this is the in-repo model History lacks (Hy1). Stripe verified on-pixel (#8FBF93 active, x24–27).

**T4 — Header pattern C: hand-rolled title+actions row.** "Stems" title at y116 beside 56pt Import/Add buttons at y110 — measured 6pt baseline mismatch, and a third title offset (86/106/116/130/146 across the app).

## 7. Stem edit / Stem import (`07-stem-edit-*.png`, `08-stem-import-*.png`)

**M1 — No back affordance at all.** Neither screen renders `BackHeader` (only iOS edge-swipe / Android system back). Every other secondary screen shows Back — these two are the exception, and the gap is exactly the a11y/discoverability gap `BackHeader` was built to close (its own header comment). The constitution's ScreenHeader absorbs them with a "Close"-labelled back row.

**M2 — Form labels are styled as hint text.** "Category (optional)", "Time of day", "How often" render `small` grey — the same style as the `Hint` text used for explanations — while the app has an `eyebrow` role built for exactly this (SectionHeader uses it). Typographic roles exist but aren't applied to the form path.

**M3 — Settings' stepper and Onboarding's stepper are two different components.** settings.tsx `NumberStepper` (label row above, stepper row below — measured 132pt per setting incl. hint) vs onboarding.tsx `PrefRow` (label left, stepper right — one line). Same control, two anatomies, both committed today. One shared row control is a cycle-5 item.

## 8. History (`09-history-*.png`, `android-history-*.png`, `src/app/history.tsx`)

**Hy1 — The filter wall: with a real corpus, the session list is not visible and not reachable.** Measured on `09-history-light.axtree.json` (14-stem corpus): Back+title+search to y235, Date-range row y263, Category rows y323–447, Stem-filter chips y507–867+ (one chip per wrapped 30-char stem) — the `FlatList` gets the remaining vertical space, which is **zero**: no session row renders at any y, and the list has no touch area to scroll. Confirmed physically: an iOS drag and an Android `input swipe` both produce identical captures (`09-history-light-scrolled.png`, `android-history-scrolled.png` — byte-stable chrome). History's primary content is not on the History screen whenever the corpus has ~14 stems; the owner's real corpus will be larger. Root: all filters render unconditionally (history.tsx:114–142); the fix pattern already exists in-repo (stems' collapsible "More filters", T3).

**Hy2 — SessionRow buries its anchor.** Primary line = stem snapshot serif 22 full-width, secondary = "date · category" dim below, left-aligned (history.tsx:193–218). The date — the list's ordering key — sits at the end of a joined string at the bottom of the card. Telegram-grade: bold primary / dim preview / right-aligned date meta. (Category stripe present and visible — color rounds' D1 fix, untouched.)

**Hy3 — Two different search inputs across sibling screens.** History's search pads `Spacing.three` (measured 49pt tall, history.tsx:191–198) vs Stems' search `Spacing.two` (33pt, stems.tsx:437–442) — same role, two sizes, no shared `SearchField`.

**Hy4 — Title offset variant D.** "History" at y106 (`title` paddingTop one) vs y130 on its five pattern-B siblings — a fourth title position app-wide.

## 9. Settings (`10-settings-*.png`, `src/app/settings.tsx`)

**Se1 — Each stepper setting consumes ~132pt while feeling dense.** Measured: "Endings per session" occupies y243–375 — label+range row, stepper row, then a two-line 44pt-tall hint box between controls. The one-line `PrefRow` anatomy (M3) halves it; hints become one dim line.

**Se2 — Group rhythm is the screen's strength; keep it.** Eyebrow + hairline section rules (settings.tsx:95, `styles.group`) measured at SESSION/NOTIFICATIONS/WRITING — this is the sectioned-card pattern the register wants; the constitution generalizes it (24pt section gap).

**Se3 (side-observation, flagged for triage — not a layout cycle)** — the "Theme" chip toggle (settings.tsx:~400) persists `settings.theme` but `use-theme.ts` reads only the system scheme: the setting is dead. Layout-adjacent (it lives in the App group and does nothing), but the fix is behavioral/product, recorded as a side issue.

## 10. Progress (`11-progress-*.png`, `src/app/progress.tsx`)

**P1 — The peak screen's numbers are body-sized.** Stats render `StatLine` — `small` label left, `default` 16 value right (progress.tsx:92–100), measured rows at 28pt pitch y198–310. The register (Revolut) asks confident large numbers for a "peak" screen; values should sit at `subtitle`/`title` scale with the label as the dim element. (Values already carry `accent` — color rounds' work, untouched.)

**P2 — Two sections, no headers.** Stats block and badge grid sit as neighbors with nothing naming them (SectionHeader exists, unused here). Eyebrow labels ("This week" / "Badges" — descriptive, §13.4-safe) give each section an anchor.

**P3 (verified good)** — badge grid measured uniform 2-col (319pt cards); earned/unearned fills verified on-pixel both themes (glowSoft `#FBF3E2`/`#251D0C` vs `backgroundElement`; gold stripe present). The grid is the app's best-ordered layout — the register's standard to generalize.

## 11. Onboarding (`12-onboarding-step*.png`, `src/app/onboarding.tsx`)

**O1 — Step counter and stepper-row inconsistency.** The "1 of 4" counter is a lone `small` line top-left (y78) — fine and quiet; step 4's `PrefRow` stepper is the M3 cross-reference (two stepper anatomies). Pages center vertically with left-aligned text — good. Step 3's action pair ("Allow reminders" secondary + "Not now" text, left-stacked full-width at y510/574) is calm and correct for a permission ask. Minor only: adopt the shared stepper row (cycle 6) and the label eyebrow (M2).

## 12. About (`13-about-*.png`, `src/app/about.tsx`)

**A1 — Bare text links, no row anatomy.** "About the method" and "Created by Nicolò Brandizzi" render as 44pt-full-width plain text (y316/y376) — tappable, but with no affordance and no reserved action column (chevron), they read as body text. Telegram list-row: label left, chevron in the right slot. Minor, folded into cycle 6.

## Cross-cutting findings (measured app-wide)

- **C1 — Four header anatomies.** Back rows at y62 (pattern-B: session-detail/review/history/settings/progress/about) vs y86 (pattern-A: export/import) vs hand-rolled (pattern-C: stems y116) vs none (write/stem-edit/stem-import); title offsets at 86/106/116/130/146. → `ScreenHeader` (constitution LC2).
- **C2 — The edge margin is already consistent: 24pt.** Measured on every screen: first-level content at x24, card-children at x40/43. This is the one grid rule the app already obeys — codify, don't change.
- **C3 — Two competing vertical rhythms.** Inter-block gaps measured: 24pt on home/settings/progress scrollContent vs 16pt on export/import/session-detail/review/stems/stem-edit/stem-import/onboarding. Per-screen improvisation, exactly as the prior hypothesized. → one rhythm (24 section / 8 row / 4 label-control).
- **C4 — `' · '`-joined metadata is an app-wide idiom.** history Hy2, stems T2, session-detail S1, write's done block ("5 endings · 1:31"). The list-row spec replaces positional meta where the fields have distinct roles; joins remain legal only inside one same-role line.
- **C5 — Icon color roles are unruled.** Grey (export/import cards) vs accent/category (home tiles, stems rows). Constitution: a list-row icon inherits its container's accent role (category stripe hue where a category exists, else `textSecondary`); destination tiles may keep accent.
- **C6 (side-observation)** — locale-mixed date formatting: the simulator (de-DE) renders "13. Sep 2026 at 08:15" — `toLocaleString` patterns with English "at"/"–" separators over German months. A shared date-format helper stabilizes both language and row-meta width. Flagged for triage.
- **C7 (side-observation)** — dead Theme setting (Se3 above).

## Android platform findings (spot-check: home, history, settings, stems, write-active — both themes)

- **D1 — Font fallback holds.** `system-ui`/`serif` resolve to Roboto/Noto Serif (write's stacked endings OCR-verified in Noto Serif); no layout breakage, the serif/sans role distinction survives.
- **D2 — The keyboard confirms W1 on the owner's platform.** `android-write-active-light.png`: keyboard top ~y614 of 915pt; input at 545–600 (auto-scrolled visible); Save/Done/counter below the keyboard, unreachable while writing. The pinned-strip + pinned-action-bar restructure (cycle 2) is verified against this capture — its acceptance criteria require an Android keyboard-up screenshot.
- **D3 — Hy1 reproduces identically on Android** (filter chips to y900/915, list invisible) — platform-independent.
- **D4 — Otherwise parity.** Home 3-3-2 grid + accentMuted Progress tile, stems rows, settings groups all render as on iOS; no Android-specific layout defect beyond D2/D3 (the shared defects C1–C5 are identical on both).

## 2. Layout constitution (what the cycles enforce)

- **LC1 — Grid.** Content column inset 24pt (`Spacing.four`) on every screen (already true — C2); `MaxContentWidth 800` centered on tablets (existing). Card outer edges align to the column; card text sits at 40; the 4px category stripe occupies 24–28. Right mirror: 378. Nothing floats between.
- **LC2 — `ScreenHeader`, one header for every secondary screen.** Back row (chevron + label, 44pt, x24, at the safe-area top), title row (`type="title"`, 44pt), optional trailing action vertically centered in the title row's right slot; 16pt between rows. Adopted by every secondary screen incl. stem-edit/stem-import ("Close"); Home (no back) and Write keep their own anchors. §10 stays binding on Write: the header strip there is the exit/timer, not chrome.
- **LC3 — Vertical rhythm.** Section gap 24 (`Spacing.four`); row gap inside a section 8 (`Spacing.two`); label-to-control 4 (`Spacing.one`). One rhythm, no per-screen gaps (retires C3's 16-vs-24 split).
- **LC4 — Card spec (existing `Card`, now normative).** `backgroundElement` fill, `Radius.medium`, padding 16, internal gap 8; `bordered` only against `backgroundElement` fills; `accentColor` stripe = category hue only.
- **LC5 — List-row spec (Telegram discipline).** Fixed row padding, first line top-anchored (same y for 1-line and 2-line content); primary line = serif 22 for user writing/stems, sans 16 600-weight for chrome; one dim secondary line (`small`, `textSecondary`, joins legal within the line); reserved right meta column (~72pt, right-aligned, `small`) for dates/counts — reserved even when empty; 4px left stripe = category only; row action (Edit) lives in the right slot at 44pt.
- **LC6 — Typographic roles, used decisively.** `title` 32 = ScreenHeader titles only; `stem` serif 22 = stems/endings/user text everywhere (incl. the stems library rows, fixing T1); `subtitle` 20/600 = card headers and stat values; `default` 16 = body/primary chrome lines; `small` 14 = meta/secondary; `eyebrow` = section and form labels. Big numbers (stats, sitting counts) render at `subtitle`+ scale — descriptive only (§13.4/§13.6).
- **LC7 — One visual anchor per screen section.** Home: the sitting card. History: the date-filter row. Review: the period selector + pinned Continue. Progress: the stat panel. Stems: the search+chips control band. Every anchor spans the full content column.
- **LC8 — Write-screen exception (§10 + owner decision).** Pinned top strip: sitting position ("Stem N of M"), timer depletion, MM:SS at ≤ text size. Below it: the scrolling stack (stem, dim separated endings — W3's scan anchors are opacity/divider-based, never color/decoration). Pinned bottom: input + Save (pressure gradient) + Done, above the keyboard. Completion replaces the bottom bar (never rendered after the stack — W5). No cards, no color blocking, no navigation chrome beyond the header's single exit.
- **LC9 — Non-negotiables carried over:** both themes, text AA 4.5:1, no new dependencies, airplane-mode-complete, no stored derived values (§13.7), no evaluation/shame copy (§13.4/§13.6), color rounds' tokens untouched.

## 3. Cycle plan (traffic-ordered: Home → Write → Stems → History/Review → Settings/Export/Import → remainder)

Each cycle: small, independently committable, one commit, `npm run typecheck` + `npm test` green, screenshot-checkable acceptance in both themes (Android frame required where keyboard behavior is touched). Issue files live at `.scratch/layout-audit-2026-09-15/issues/`.

- **Cycle 1 — Home: the sitting becomes the hero.** (`index.tsx`, reuses `Card`/`SectionHeader`.) One sectioned card: eyebrow ("Morning sitting"/"Evening sitting"), big count line ("N stems ready" — read-time derived, §13.7), both start buttons inside the card (current-period primary). Status block → quiet left-aligned stat row inside the card's footer (descriptive copy only). Tile grid → strict 3-col equal widths (labels wrap; two-line tiles allowed). Footer unchanged. *Accept:* light+dark captures show one dominant card, both starts inside it, status as aligned stats not centered loose lines (measured: no centered x-offsets in the a11y dump); all 8 tiles equal width; no centered-vs-left mix on the screen.
- **Cycle 2 — Write: pinned timer strip + pinned action bar.** (`write.tsx`, RN builtins only.) Top strip below safe area: "Stem N of M" + full-width depletion bar + MM:SS (≤ text size, §6.3.7) — replaces the mid-screen bars; scrolling stack: stem + dim separated endings (W3 fix — separator = opacity step/divider, order not decoration); pinned bottom: input + Save + Done above the keyboard (KeyboardAvoidingView; Android adjustResize native); queue-advance resets the stack display (W4); completion renders into the pinned bottom bar's place (W5). *Accept:* with the seeded open sitting (4+ endings), light+dark: strip + input + Save visible without scrolling; Android capture with keyboard up shows strip + input (ref: `android-write-active-light.png` as before); queue advance shows a clean Start gate; done state visible without scrolling; §10 holds (no cards/chrome; numerals ≤ text).
- **Cycle 3 — Stems: serif content + row anatomy + `ScreenHeader`.** (New `src/components/screen-header.tsx`; `stems.tsx`, `stem-edit.tsx`, `stem-import.tsx`.) Library rows per LC5: stem serif 22, one dim meta line + chip, Edit in the right slot (44pt), first-line y constant across row heights; ScreenHeader adopted on all three screens (stems keeps Add/Import as trailing actions; edit/import get "Close" back rows — M1). Form labels → `eyebrow` (M2). *Accept:* a11y-measured header rows identical (back y, title y) across stems/stem-edit/stem-import and matching the export pattern; rows measured for constant first-line y; stem text renders serif in the library; both themes.
- **Cycle 4 — History + Review: reachability + row anatomy.** (`history.tsx`, `review.tsx`; reuses the stems screens' collapsible-filters pattern.) History: date/category/stem filters collapse behind a "Filters" toggle (default: date-range row only); `SessionRow` → LC5 (stem serif primary, dim preview line, right-aligned date column). Review: session cards get an eyebrow header (date + "N endings"); endings dim per LC5; "Continue" pinned to the bottom action position (visible without scrolling — R1). *Accept:* history shows ≥3 session rows above the fold in both themes with a 14-stem corpus (the audit's seeded DB is the regression fixture — Hy1 reproduced-then-fixed); review's Continue visible on first paint in both themes; measured right meta column alignment.
- **Cycle 5 — Settings/Export/Import: rhythm + parity.** (`settings.tsx`, `export.tsx`, `import.tsx`; new shared stepper row component replacing `NumberStepper`+`PrefRow` — M3/Se1.) Settings: one-line stepper rows (label left + stepper right), hints one dim line; Export/Import: ScreenHeader adoption (E1), card icon roles per C5, rhythm per LC3. *Accept:* measured gaps (24 section / 8 row); settings' four groups fit materially shorter (per-setting block ≤ ~72pt measured); export/import headers match the app-wide pattern; both themes.
- **Cycle 6 — Progress/About/Onboarding: anchors + big numbers + link rows.** (`progress.tsx`, `about.tsx`, `onboarding.tsx`.) Progress: stat panel with `subtitle`-scale values + `SectionHeader` eyebrows; About: link rows with chevrons in the reserved right slot (A1); Onboarding: shared stepper row + label eyebrows (O1). *Accept:* stat values ≥20pt measured; section headers present; both themes; typecheck/tests.
- **Side-observations (triage, not layout cycles):** dead Theme setting (Se3/C7), shared date-format helper (C6), shared `SearchField` component (Hy3) — filed as issue 07 for the owner/labels, none blocks the cycles.

Cycle-2's keyboard work and cycle-4's collapse are the two changes that touch interaction rather than pure layout; both are pre-authorized by the brief (owner-decided timer pinning; component-consistency levers). Everything else is component/style work within existing tokens — no new dependencies anywhere.
