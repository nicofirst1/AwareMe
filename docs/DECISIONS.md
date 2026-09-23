# Decisions

> Moved from the repo root to `docs/` on 2026-09-23 (owner call, same-day commit). Historical archives (skill versions, ADRs, design logs, hub trails) keep citing the old root path; live pointers were updated in the same commit.

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
- **2026-09-22, zero-ending sessions never count as complete (owner decision, packet 3 t10):** a session finished with zero non-empty endings is still saved (nothing discarded, §6.3.8; early-Done stays legal, §6.3.9) but never counts as complete: excluded at read time (single shared predicate in `src/db/repository.ts`) from completed-session reads, "sessions this week", and the §6.2 week derivation; the reflection-completion effect in `write.tsx` keys `program_week_override` clearing on the same content rule. Read-time filter only — no schema change, §13.7 invariant holds; rows remain in DB + export. Full record: `.coordination/issues/packet3-codefix.md` row t10 + reviewer verdict; merged 69d9756.
- **2026-09-18, audit sequencing (amendment 11):** the methodology auditor runs AFTER the review loop settles (reviewer verdict in + requested changes verified), analyzing the complete trail including the review exchange; it never runs in parallel with the reviewer. Owner directive; codified in the app skill Round protocol (r11, v1.3.0).

- **Dependencies beyond spec §3** are non-discretionary or sanctioned, never casual: `expo-linking` (hard peer of expo-router), `expo-crypto` (UUIDv7 randomness), `@expo/vector-icons` (2026-09-11 redesign, sanctioned).
- **Stems are editable in place** — sanctioned by spec §4.4; `sessions.stem_text_snapshot` is what preserves "what was on screen". Not an append-only breach.
- **Meta-stems are real `stems` rows** (`origin='meta'`, `active=0`); every session needs a real stem FK, so sentinel ids are never invented.
- **The JSON export bundle is raw rows per table** (lossless, keeps per-row `updated_at`), not the decoded object sketched in spec §8.2; only the corpus tables export.
- **Soft-deleted rows stay in the FTS index and are filtered at query time** — one visibility convention for every read.
- **New settings are KV rows, not schema changes** — §13.8 migrations govern tables/columns only; absent keys fall through to `DEFAULT_SETTINGS`.
- **Streak anchor (ratified 2026-09-11):** alive if the last completed-session day is today or yesterday; a second consecutive missed day zeroes it.
- **License is GPLv3 (owner choice, 2026-09-16):** canonical text machine-verified against gnu.org, reflowed; forks must stay open. `NOTICE` carries the programme-text carve-out — not included in the repo, not sublicensed.
- **Brand is AwareMe (2026-09-16):** rename swept app.json, src, docs; "six endings" survives only as method copy (CONCEPT). Scheme `sixendings`, bundle ids, DB filename, notification ids are frozen pending owner decisions (issue 14).
- **Evening meta-stems carry `time_of_day = 'evening'` (2026-09-17):** deviates from spec §5.4's "meta-stems carry `time_of_day = NULL" and makes §4.2's `time_of_day` comment stale for these two rows — the owner's v13 feedback ("there are no evening stems") requires the library's Evening filter to match them, so seed tagging + `listAllStems` inclusion + migration 0006 (idempotent data backfill by exact text, fixture `schema-v6.db`) landed in c06. Weekly meta-stem stays NULL and unlisted. Full record: `.scratch/v13-feedback/issues/06-evening-stems-in-library.md` (Comments + reviewer verdict); ADR-0002 otherwise stands.
- **First-run flow is five tabs, evening question folded in (2026-09-17):** supersedes spec §6.1's "at most 4 screens" and moves the §7/ADR-0005 evening-practice ask from a standalone pre-onboarding card into onboarding step 4 of 5, per the owner's v13 feedback ("include the evening practice should came towards the end not before the actual intro"); the once-only ask for upgraders is preserved via the `intro_completed` marker. Spec §6.1/§7 text to be refreshed at the next spec pass (owner call). Full record: `.scratch/v13-feedback/issues/03-fresh-screen-rebuild.md` (Comments + reviewer verdict).
- **Seed content ships via a static overlay (2026-09-17):** `stems.content.ts` is owner-local and gitignored; `content-overlay.js` (metro + jest resolvers) serves the committed example file on fresh clones — no runtime require, no fallback guard to fail (issue 23).
- **SECURITY.md dropped (2026-09-16):** thin threat model removed; GitHub "Private vulnerability reporting" replaces it.
- **`store/` is untracked (2026-09-16):** Play submission assets stay owner-local; screenshots carry the programme text visually.
- **Never nest `ThemedView` inside a `Card`/tinted surface** — it paints `theme.background` over the card; use plain `View`.
- **Identity ids unfrozen and renamed (2026-09-17, owner decision in issue 02, v13-feedback round):** deep-link scheme `awareme`, Android package / iOS bundle `com.nicolobrandizzi.awareme`, DB filename `awareme.db` (a first-open file move preserves existing data), notification ids `awareme/...`; old `sixendings://` deep links break (accepted, nothing published uses them); the earned-badge display name "Six Endings" stays CONCEPT copy. Resolves the parked "Identity FLAGs (issue 14)" arbitration. Full record: `.scratch/v13-feedback/issues/02-splash-and-identity-rename.md` (untracked).
- **Trademark clearance dropped (2026-09-22, owner):** the AwareMe name stands as chosen, without formal USPTO/WIPO/EUIPO register searches; the known conflict (Abelssoft "AwareMe ADHS", live in Medical on the US/GB stores, OFFIS research project of the same name) is acknowledged and accepted as-is. The 2026-09-16 app-store sweep (`.coordination/legacy/name-clearance-2026-09-16.md`) remains the only clearance artifact; an attorney search was never run. PLAN packet 7 dropped.
- **OSS readiness owner decisions closed (2026-09-22, owner, PLAN packet 5):** GPLv3 confirmed as the standing license; `.scratch/` stays untracked with the verbatim snapshot owner-local, so the tracked tree publishes only the example corpus; the Branden question closed by owner confirmation that app builds embedding the programme text are within the Leigh Branden permission, no new ask needed and the attribution sentence stays as recorded in spec §5.1 and `NOTICE`; git history kept as-is without a rewrite (single author; the commit email is the public contact point); public repo is `github.com/nicofirst1/AwareMe` (created private 2026-09-22, remote `origin` added, nothing pushed). Publish mechanics remain PLAN packet 6, gated on an owner go.

## Environment quirks

- `node_modules/expo-asset` repeatedly vanishes across `npm install` cycles; Jest then fails with `Cannot find module 'expo-asset'`. Remedy: `npm install expo-asset@57.0.16 --no-save --legacy-peer-deps`; never add it to `package.json`.
- Plain `npm ci` fails in fresh worktrees (committed lock predates expo@57's peer set) — use `npm install --legacy-peer-deps` plus the expo-asset remedy.

## Design and execution rounds

- **UI color redesign (2026-09-11)** — audit `docs/design/ui-audit-2026-09-11.md`; four cycles shipped.
- **Gamification pivot (2026-09-11)** — spec §13.4/§13.6 partially reversed (gamification sanctioned, evaluation still banned); boundary is `docs/design/gamification-proposal-2026-09-11.md`.
- **Layout round (2026-09-15)** — brief `docs/design/layout-audit-brief-2026-09-15.md`; audit + constitution (LC1–LC9) `docs/design/layout-audit-2026-09-15.md`; cycles under `.scratch/layout-audit-2026-09-15/`.
- **Expo-feedback round (2026-09-15)** — countdown button removed (§6.3.4/§6.3.7 amended; submission is the return key, pressure color moved to the top-strip numerals), midpoint sitting highlight on Home — record in `.scratch/expo-feedback-2026-09-15/`.
- **Official programme (2026-09-15/16)** — ADR-0005 is the decision record; round records under `.scratch/official-program/` (verbatim list snapshot included).
- **Lint baseline (2026-09-17)** — `react-hooks/set-state-in-effect` at `warn` in the committed `eslint.config.js`; 4 known sites remain, dispositioned: 2 are ADR-0001's cold-start mount sites by design, 2 documented in issue 17. Baseline: 0 errors / 13 warnings.
- **v1.2 feedback round** — completed 2026-09-17; all 23 issues in `.scratch/v12-feedback/` done or dispositioned (untracked).
- **DESIGN.md adoption (2026-09-22)** — `docs/design/DESIGN.md` (Google design.md format) is a published view extracted from `src/constants/theme.ts` + `src/components/themed-text.tsx`; `theme.ts` stays normative, dark variants are `-dark`-suffixed tokens, lint via `npm run design:lint` (npx-pinned CLI + CI gate, wired 2026-09-23 per owner; bare `npx @google/design.md lint docs/design/DESIGN.md` still works). ADR-0006.

## Superseded

Weighted stem selection, the random-window scheduler, and the 2026-09-11 "fixed mode" addition (tickets 06, 09, 10) were deleted outright by ADR-0004; their entries here are historical.

- **Evening-practice skip persists the morning default (2026-09-18, v14-feedback c02):** "Skip for now" on the evening question persists `evening_practice_enabled = false` explicitly on every exit - the §7 factory default (enabled) must not survive a no-answer. Supersedes the 2026-09-16 reporter feedback that made the morning button primary; the card now asks exactly two options ("Include evening practice" / "Skip for now"). Full record: `.scratch/v14-feedback/issues/05-evening-question-two-options.md` (Comments + hub ARBITRATION 13:55).

## Parked owner arbitrations

- Small-viewport intro layout (2026-09-18, c02 device finding): whether the /intro welcome beat clips at 320x640 (SafeAreaView centering content taller than the screen); the eyes pass could not reproduce the clip on the capture. Owner decides scrollable-vs-fixed.
- Whether the About screen should also carry a one-line book credit (c04 reviewer finding, 2026-09-16).
- Identity FLAGs (issue 14): deep-link scheme, Android package / iOS bundle ids, DB filename.
- Spec §5.1/§5.4 and ADR-0005 quote remainders: amend spec to match the overlay architecture (owner call).
- jest content-consistency gating (2026-09-18, v14 GATE-BASELINE): the migrate/programmeSeed consistency tests fail on machines where the verbatim snapshot is present but the private `stems.content.ts` is absent (seed falls back to example text); restore the private file or sanction test-gating (owner call).
- **2026-09-19, terminology: 'sitting' renamed to 'practice'** across user-facing copy and code (owner decision; resolves C19 session/sitting inconsistency). Updates spec.md, DECISIONS.md, all UI copy, and repository method names.
- **Docs layout (2026-09-23, owner call in session):** `DECISIONS.md` and `PLAN.md` moved from the repo root into `docs/` (pairing decisions with `docs/adr/` rationale). Live pointers updated in the same commit (AGENTS.md, spec.md, live skills, CI, eslint config, 18 src comment receipts); historical archives keep the old root paths as written.
