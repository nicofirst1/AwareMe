# Decisions

Deviations from `spec.md` and resolutions of its open questions (§14). Spec §0 requires deviations be justified here.

This file is an index, not the record: each entry points at the authoritative doc that holds the rationale. Append new decisions at the bottom, one bullet each — what was decided, by whom, and a pointer to the full record. The per-ticket prose this index replaced lives in git history (trimmed 2026-09-16).

## Architecture decisions → `docs/adr/`

- **ADR-0001** — sessions keep momentum sacred: never manually resumable; auto-resume only within a 5-minute absence grace (resolves §14 Q1).
- **ADR-0002** — stems carry text + one optional category; no note/tag field (resolves §14 Q3).
- **ADR-0003** — endings rows are created on first keypress, not on submit; `endings.submitted_at` is nullable; `sessions.last_activity_at` added (deviates from the spec DDL and §6.3.4).
- **ADR-0004** — morning/evening sittings replace weighted stem draws and random notifications; two fixed daily local notifications; `notification_schedule`/`stems.weight` kept, vestigial.
- **ADR-0005** — official Sentence Completion programme adopted (Leigh Branden permission): seeds verbatim from the official list, weekly reflection + third notification, evening toggle at first launch, Android release includes it.

## Resolved open questions (§14)

1. **Session resumability** — never manually resumable → ADR-0001.
2. **On-demand stem repeat** — yes; library starts bypass the sitting queue (`origin = 'manual'`).
3. **Per-stem note/tag** — no → ADR-0002.
4. **Review period** — default 7 days, selectable at review time from presets; `reviews` stores explicit `period_start`/`period_end`.

## Standing decisions

- **Dependencies beyond spec §3** are non-discretionary or sanctioned, never casual: `expo-linking` (hard peer of expo-router), `expo-crypto` (UUIDv7 randomness), `@expo/vector-icons` (2026-09-11 redesign, sanctioned).
- **Stems are editable in place** — sanctioned by spec §4.4; `sessions.stem_text_snapshot` is what preserves "what was on screen". Not an append-only breach.
- **Meta-stems are real `stems` rows** (`origin='meta'`, `active=0`); every session needs a real stem FK, so sentinel ids are never invented.
- **The JSON export bundle is raw rows per table** (lossless, keeps per-row `updated_at`), not the decoded object sketched in spec §8.2; only the corpus tables export.
- **Soft-deleted rows stay in the FTS index and are filtered at query time** — one visibility convention for every read.
- **New settings are KV rows, not schema changes** — §13.8 migrations govern tables/columns only; absent keys fall through to `DEFAULT_SETTINGS`.
- **Streak anchor (ratified 2026-09-11):** alive if the last completed-session day is today or yesterday; a second consecutive missed day zeroes it.
- **Never nest `ThemedView` inside a `Card`/tinted surface** — it paints `theme.background` over the card; use plain `View`.

## Environment quirks

- `node_modules/expo-asset` repeatedly vanishes across `npm install` cycles; Jest then fails with `Cannot find module 'expo-asset'`. Remedy: `npm install expo-asset@57.0.16 --no-save --legacy-peer-deps`; never add it to `package.json`.
- Plain `npm ci` fails in fresh worktrees (committed lock predates expo@57's peer set) — use `npm install --legacy-peer-deps` plus the expo-asset remedy.

## Design and execution rounds

- **UI color redesign (2026-09-11)** — audit `docs/design/ui-audit-2026-09-11.md`; four cycles shipped.
- **Gamification pivot (2026-09-11)** — spec §13.4/§13.6 partially reversed (gamification sanctioned, evaluation still banned); boundary is `docs/design/gamification-proposal-2026-09-11.md`.
- **Layout round (2026-09-15)** — brief `docs/design/layout-audit-brief-2026-09-15.md`; audit + constitution (LC1–LC9) `docs/design/layout-audit-2026-09-15.md`; cycles under `.scratch/layout-audit-2026-09-15/`.
- **Expo-feedback round (2026-09-15)** — countdown button removed (§6.3.4/§6.3.7 amended; submission is the return key, pressure color moved to the top-strip numerals), midpoint sitting highlight on Home — record in `.scratch/expo-feedback-2026-09-15/`.
- **Official programme (2026-09-15/16)** — ADR-0005 is the decision record; round records under `.scratch/official-program/` (verbatim list snapshot included).
- **Lint baseline (2026-09-16)** — `react-hooks/set-state-in-effect` downgraded to `warn` in the owner's `eslint.config.js` (still uncommitted); 5 known sites are contract debt for a dedicated session-state pass.
- **v1.2 feedback round** — `.scratch/v12-feedback/`.

## Superseded

Weighted stem selection, the random-window scheduler, and the 2026-09-11 "fixed mode" addition (tickets 06, 09, 10) were deleted outright by ADR-0004; their entries here are historical.

## Parked owner arbitrations

- Whether the About screen should also carry a one-line book credit (c04 reviewer finding, 2026-09-16).
