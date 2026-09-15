# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: v1 feature-complete; v1.1 feedback batch + two owner pivots landed; ship-prep remains

All 20 tickets in `.scratch/six-endings-v1/` are implemented and post-reviewed; the 2026-09-11 v1.1 feedback batch (`.scratch/v1.1-feedback/`) is done, including the gamification pivot (spec §13.4/§13.6 reversed, bounded by `docs/design/gamification-proposal-2026-09-11.md`; cycles 1–3 shipped) and a 4-cycle UI redesign. The 2026-09-14 owner pivot (ADR-0004, migration 0003, schema v3) replaced random weighted stem draws with morning/evening sittings and two fixed daily notifications. Remaining: store assets + privacy declarations (ticket 20's `store/` groundwork is in, native manifests/submission are not) and M7 polish/ship. `spec.md` remains the contract.

**`spec.md` is the contract.** Read it before doing anything. It uses RFC-2119 language: `MUST` is a hard constraint, `SHOULD` needs a justification in `DECISIONS.md` (create it) if you deviate. Do not add features it lists as out of scope (section 2) — no backend, accounts, sync, social, AI, analytics, or monetisation, and no stubs/toggles for them.

## Stack (from spec §3 — installed)

Expo managed workflow, SDK 57 · TypeScript `strict: true`, no `any` in committed code · `expo-router` (file-based, rooted at `src/app`) · `expo-sqlite` · local-only `expo-notifications` · Zustand (present per spec §3, currently unused — session state is a plain hook per DECISIONS.md) · `expo-file-system` · `expo-sharing` for export · `expo-local-authentication` for the optional lock · Jest (`jest-expo` preset) + `@testing-library/react-native`.

Two deps are installed beyond spec §3's list, both non-discretionary — see `DECISIONS.md`: `expo-linking` (hard runtime peer of `expo-router`) and `expo-crypto` (UUIDv7 needs real random bytes; Hermes doesn't polyfill `crypto.getRandomValues`).

The app **MUST function fully in airplane mode.** No network calls. No dependency here pulls in network capability.

### Real commands (package.json)

- `npm start` — `expo start` (Metro; the Expo Go day-to-day loop)
- `npm run ios` / `npm run android` — native dev builds (`expo run:ios` / `expo run:android`; the `android/` native project is committed)
- `./scripts/rebuild-android.sh` — local release APK for sideloading (`android/app/build/outputs/apk/release/app-release.apk`; a debug APK has no JS bundle and only runs tethered to Metro)
- `npm test` — `jest` (preset `jest-expo`); `npx jest path/to/file.test.ts` for a single file
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — `expo lint`

Known environment quirk: `node_modules/expo-asset` (a transitive dependency of `expo`) repeatedly goes missing across `npm install` cycles, failing some Jest suites with `Cannot find module 'expo-asset'`. Remedy (see DECISIONS.md): `npm install expo-asset@57.0.16 --no-save --legacy-peer-deps` — never add it to `package.json`.

## Data layer (`src/db/`, ticket 02)

- `migrations/000N_*.ts` — one file per schema version, immutable once shipped; `migrations/index.ts` lists them in order.
- `migrate.ts` — the runner: reads `schema_meta`, applies pending migrations in order, each in its own transaction.
- `executor.ts` — the `SqlExecutor` interface migrations and repositories are written against; `expo-sqlite`'s `SQLiteDatabase` satisfies it directly (compile-time checked in `executorCompat.check.ts`).
- `database.ts` — `getDatabase()`: opens the real on-device DB and runs `migrate()`. The one place production code calls `expo-sqlite`'s `openDatabaseSync`.
- `uuidv7.ts` / `id.ts` — pure UUIDv7 generator + the one call site binding it to `expo-crypto`.
- `fixtures/schema-vN.db` — a committed, real SQLite file per shipped version; `__tests__/migrate.test.ts` regenerates any missing one and asserts every fixture upgrades cleanly to current. Add a new fixture when you add a migration (see `fixtures/README.md`).
- `testSupport/nodeSqliteExecutor.ts` — adapts Node's builtin `node:sqlite` to `SqlExecutor` so migration tests run against real SQLite without a device/simulator.
- `repository.ts` — `Repository`: the full read-write data surface (seed; session/ending lifecycle; stem CRUD, bulk import, archive/soft-delete, time-of-day; settings; history, FTS search, review and stats reads; notification bookkeeping). Add new methods here as tickets need them.
- `seed/stems.ts`, `seed/settings.ts` — the 26 seed stems + 3 meta-stems (verbatim from spec §5.3–5.4, checked byte-for-byte against spec.md — don't retype from memory if you ever touch this file) and the spec §7 default settings.
- `time.ts` — `nowEventTime()`: the UTC ISO-8601-ms + IANA tz + offset-minutes triple every user-event row needs (spec §4.1.3), via `Intl.DateTimeFormat` (no dependency).
- `index.ts` — the module's public surface; import from `@/db`, not individual files, outside the `db/` directory itself.
- `src/app/debug.tsx` — dev-only (`__DEV__`), dumps every row of every table via `Repository.dumpAllTables()`. Not part of the product surface; spec §10's restraint doesn't apply to it.

## Architecture: the data model is the load-bearing decision

Spec §4 is the part that is expensive to change later. The user is a data scientist who intends to analyse this corpus years later in R/pandas, so the schema is designed for that reader, not for the app. Internalise these before writing any storage code:

- **Append-only; soft-delete only.** Never overwrite a row to represent a state change — add a row or set `deleted_at`. Export includes soft-deleted rows with the flag intact ("written and retracted" is itself a signal).
- **No stored derived values.** Word counts, streaks, averages are computed at read time. Persisting them is a spec violation (§13.7).
- **Time stored three ways.** Every timestamp is UTC ISO-8601 with ms; every user-event row also stores the IANA timezone and UTC offset in minutes at the moment of the event.
- **UUIDv7 primary keys** everywhere (chronologically sortable). Never reuse or renumber.
- **`schema_meta` single-row version table.** Every schema change needs a migration and a version bump — even in development (§13.8) — plus a committed fixture DB per version for the migration tests.
- **`sessions.stem_text_snapshot`** is denormalised on purpose: stems are editable, so each session stores the exact stem text shown at start _and_ keeps the FK. Do not "fix" this into a plain join.

Six tables: `stems`, `sessions`, `endings`, `reviews`, `settings`, `notification_schedule`, plus `schema_meta` and the `endings_fts` FTS5 virtual table (migration 0002). Current schema version: 3 (0003 added `stems.time_of_day`). `notification_schedule` and `stems.weight` are vestigial since the 2026-09-14 pivot — kept, not dropped; see DECISIONS.md. See §4.2 for the DDL.

## Domain rules that aren't obvious from the schema

- **Sessions are sittings (§6.2, ADR-0004 — 2026-09-14 pivot).** Starting a session loads every active stem tagged for the chosen period (`stems.time_of_day`: 'morning' | 'evening') and presents them one at a time; `write.tsx` owns the queue in component state (never persisted) while each stem still gets its own `sessions` row. No weighting, no randomness, no seed — the old weighted draw (`stemSelection.ts`) was deleted. Library starts on a single stem (`origin = 'manual'`) still bypass the queue.
- **Uncensored writing mode (§6.3)** is the point of the app: backspace limited to the current word, no going back to earlier endings, no cut/select. On timeout, save whatever is on screen including a half-typed ending — nothing is ever discarded. Count backspaces even when the restriction is off.
- **Notifications (§6.4, post-2026-09-14 pivot)** are exactly two repeating daily local notifications — one per period, at user-set "HH:MM" times, via `expo-notifications`' native DAILY trigger. No in-app fire-time math, no randomness. Notification copy MUST NOT contain stem or user text (lock-screen privacy). (The old random-window scheduler — 90-minute gap, 64-pending cap, 10-day horizon — was deleted with the pivot; `notification_schedule` is vestigial.)
- **No evaluation; gamification is sanctioned but bounded.** The app never scores, praises, or interprets the user's writing. Gamification (milestone badges, streak display, post-session celebration) is permitted per the 2026-09-11 pivot, scoped to `docs/design/gamification-proposal-2026-09-11.md`: computed at read time (§13.7 still binds — no stored derived values), shown only after a session completes, never during writing, and never shaming absence — no guilt copy, no broken-streak dramatics (§13.4, §13.6).
- **Export is first-class (§8):** SQLite copy + JSON bundle + zipped CSV set, all lossless, reachable in two taps. A round-trip test (export→wipe→import→export, byte-identical modulo `exported_at`) MUST exist. Never normalise the user's text.

## Seed content constraint (§5.1)

Seed stems must be **original text in the spirit of Branden's method**. Do NOT copy stem lists verbatim from _The Six Pillars of Self-Esteem_ or any Branden source, from training data or the web. Use the 26 stems and 3 meta-stems already written in §5.3–5.4. Six categories: `awareness`, `self_acceptance`, `responsibility`, `assertiveness`, `purpose`, `integrity`.

## Build order (§12)

M1 data foundation → M2 the writing session (the whole product in embryo; over-invest here) → M3 stem library → M4 notifications → M5 history + review → M6 export/import → M7 polish + ship. Each milestone ends with a working installable build.

## Where decisions live

Spec §14's four open questions are resolved (`DECISIONS.md`; ADRs `docs/adr/0001`–`0003`), and both later pivots are recorded there too: the 2026-09-11 gamification reversal (§13.4/§13.6) and the 2026-09-14 morning/evening pivot (ADR-0004). Append every new deviation or pivot decision to `DECISIONS.md`; architecture decisions to `docs/adr/`.

## Agent skills

### Issue tracker

Local markdown — issues live as files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Mobile UI design skill

`.claude/skills/mobile-app-ui-design/` is installed (third-party, MIT, security-audited 2026-09-11) for mobile UI design work.
