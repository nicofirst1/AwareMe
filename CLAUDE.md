# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Status: spec-only, not yet scaffolded

This repo currently contains exactly one file: `spec.md`. There is no code, no `package.json`, no build system, and no git history yet. `spec.md` is a complete v1 implementation specification for a **sentence-completion journaling app** (an Expo/React Native mobile app) that has not been built.

**`spec.md` is the contract.** Read it before doing anything. It uses RFC-2119 language: `MUST` is a hard constraint, `SHOULD` needs a justification in `DECISIONS.md` (create it) if you deviate. Do not add features it lists as out of scope (section 2) — no backend, accounts, sync, social, AI, analytics, or monetisation, and no stubs/toggles for them.

## Intended stack (from spec §3 — nothing is installed yet)

Expo managed workflow (latest stable SDK) · TypeScript `strict: true`, no `any` in committed code · `expo-router` (file-based) · `expo-sqlite` · local-only `expo-notifications` · Zustand (or Context — **not** Redux) · `expo-file-system`

- `expo-sharing` for export · `expo-local-authentication` for the optional lock · Jest + `@testing-library/react-native`.

The app **MUST function fully in airplane mode.** No network calls. If any dependency pulls in network capability, record it in `DECISIONS.md`.

### When you scaffold (M1)

No commands work until the project is initialised. Bootstrap with `create-expo-app` (TypeScript template), then the usual Expo/Jest commands apply: `npx expo start`, `npx jest`, `npx jest path/to/file.test.ts`, `npx tsc --noEmit`. Keep this section updated with the real scripts once `package.json` exists.

## Architecture: the data model is the load-bearing decision

Spec §4 is the part that is expensive to change later. The user is a data scientist who intends to analyse this corpus years later in R/pandas, so the schema is designed for that reader, not for the app. Internalise these before writing any storage code:

- **Append-only; soft-delete only.** Never overwrite a row to represent a state change — add a row or set `deleted_at`. Export includes soft-deleted rows with the flag intact ("written and retracted" is itself a signal).
- **No stored derived values.** Word counts, streaks, averages are computed at read time. Persisting them is a spec violation (§13.7).
- **Time stored three ways.** Every timestamp is UTC ISO-8601 with ms; every user-event row also stores the IANA timezone and UTC offset in minutes at the moment of the event.
- **UUIDv7 primary keys** everywhere (chronologically sortable). Never reuse or renumber.
- **`schema_meta` single-row version table.** Every schema change needs a migration and a version bump — even in development (§13.8) — plus a committed fixture DB per version for the migration tests.
- **`sessions.stem_text_snapshot`** is denormalised on purpose: stems are editable, so each session stores the exact stem text shown at start _and_ keeps the FK. Do not "fix" this into a plain join.

Six tables: `stems`, `sessions`, `endings`, `reviews`, `settings`, `notification_schedule`, plus `schema_meta`. See §4.2 for the DDL.

## Domain rules that aren't obvious from the schema

- **Stem selection (§6.2)** must be a pure function of (candidates, history, time, seed) so it's deterministically testable. Weighted draw with a recency penalty; never hard-exclude (a user with 3 stems must still get one).
- **Uncensored writing mode (§6.3)** is the point of the app: backspace limited to the current word, no going back to earlier endings, no cut/select. On timeout, save whatever is on screen including a half-typed ending — nothing is ever discarded. Count backspaces even when the restriction is off.
- **Notifications (§6.4)** fire at _uniformly random_ times within the user's window (min 90-min gap); randomness is a functional requirement, not a detail. Notification copy MUST NOT contain stem or user text (lock-screen privacy). iOS caps 64 pending — schedule ~10 days ahead and top up on foreground.
- **No evaluation, no gamification.** The app never scores, praises, interprets, or shames absence. Streaks, if any, are descriptive and unemphasised (§13.4, §13.6).
- **Export is first-class (§8):** SQLite copy + JSON bundle + zipped CSV set, all lossless, reachable in two taps. A round-trip test (export→wipe→import→export, byte-identical modulo `exported_at`) MUST exist. Never normalise the user's text.

## Seed content constraint (§5.1)

Seed stems must be **original text in the spirit of Branden's method**. Do NOT copy stem lists verbatim from _The Six Pillars of Self-Esteem_ or any Branden source, from training data or the web. Use the 26 stems and 3 meta-stems already written in §5.3–5.4. Six categories: `awareness`, `self_acceptance`, `responsibility`, `assertiveness`, `purpose`, `integrity`.

## Build order (§12)

M1 data foundation → M2 the writing session (the whole product in embryo; over-invest here) → M3 stem library → M4 notifications → M5 history + review → M6 export/import → M7 polish + ship. Each milestone ends with a working installable build.

## Before starting M2

Spec §14 has four open questions (resumable sessions, on-demand stem repeat, per-stem notes, review-period length) the spec says to resolve with the user rather than guess. Surface them.

## Agent skills

### Issue tracker

Local markdown — issues live as files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
