# Guidance for coding agents

This file is a map. The targets are the sources of truth; when a pointer and its target disagree, fix the pointer.

## Read first

- `docs/spec.md` — the contract; read before any work. RFC-2119 language: `MUST` binds, a `SHOULD` deviation needs a `docs/DECISIONS.md` entry. §2 lists out-of-scope features (stay out — no stubs or toggles); §13 lists the hard constraints (airplane mode, no stored derived values, permission-scoped seed text).
- `docs/DECISIONS.md` — the decision index: §14 resolutions, standing decisions, environment quirks, parked arbitrations. Append new deviations there, one bullet with a pointer to the full record; architecture rationale lives in `docs/adr/`.
- `.scratch/` — the issue tracker, one folder per feature; see `docs/agents/issue-tracker.md`. Untracked (local-only) — never `git add` it. During delegation rounds, live status is the `.coordination/` round hub.

## Where things live

- **Data model** — spec §4. Invariants designed for a future R/pandas reader; internalise before writing any storage code.
- **Schema changes** — spec §13.8 + `src/db/fixtures/README.md`. Every change ships a migration, a `schema_meta` version bump, and a fixture DB; the migration tests assert upgrades.
- **Behaviour rules** — spec §6: the writing session (morning/evening practice), uncensored writing mode, notifications, settings.
- **Data access** — `src/db/repository.ts` is the full data surface; new methods go there. Import from `@/db` outside `src/db/`.
- **Seed content** — the content-overlay seam (`src/db/seed/stems.ts` header; ADR-0005). The official programme text lives ONLY in gitignored `stems.content.ts`; the committed `stems.content.example.ts` keeps fresh clones and CI green with labeled skips. Example content is original text — never retype programme or Branden text from memory, books, or the web (spec §5.1).
- **License & publish surface** — GPLv3; `NOTICE` carries the programme-text carve-out (not included, not sublicensed). Never commit the licensed programme text, the verbatim snapshot, `stems.content.ts`, or store/clearance materials; `.scratch/`, `.coordination/`, `store/`, `.worktrees/` are untracked by design (see `.gitignore`).
- **Product identity** — brand is AwareMe; "six endings" is method copy (CONCEPT). Identity ids were unfrozen and renamed 2026-09-17 (scheme `awareme`, package/bundle `com.nicolobrandizzi.awareme`, DB `awareme.db` — DECISIONS.md); old `sixendings://` links are dead by decision. Don't touch identity ids without an owner call.
- **Design tokens** — `docs/design/DESIGN.md` publishes the theme as a Google design.md file (ADR-0006): tokens in YAML front matter, rationale in prose. It is a published view — `src/constants/theme.ts` stays normative; change it first, then re-publish. Lint with `npm run design:lint`.
- **Gamification** — `docs/design/gamification-proposal-2026-09-11.md` is its only sanctioned scope.
- **Export** — spec §8: lossless formats; the export→wipe→import→export round-trip test must stay green.
- **Extra deps** — `expo-linking`, `expo-crypto` are non-discretionary; rationale in `docs/DECISIONS.md`.
- **Commands** — `package.json`. Gates: `npm run typecheck`, `npx jest` (exclude `/.worktrees/` on main), `npm run lint`, `npm run design:lint`. Pre-push hook: `.githooks/pre-push` runs all gates plus `secrets:scan` before anything reaches origin — enable once per clone with `npm run setup:hooks`, bypass with `--no-verify`. Emulator: `./scripts/emulator.sh` (bounded boot wait). Release APK: `./scripts/rebuild-android.sh` (a debug APK has no JS bundle and runs only tethered to Metro).
- **Jest failing with `Cannot find module 'expo-asset'`** — resolved 2026-09-23: it was a lockfile hoisting defect, fixed in the lock itself (see `docs/DECISIONS.md`, environment quirks).

## Agent skills

- **Triage labels** — five-role vocabulary; see `docs/agents/triage-labels.md`.
- **Domain docs** — one `CONTEXT.md` + `docs/adr/` at the repo root; see `docs/agents/domain.md`.
- **App work methodology** — pi-droid verification, emulator pool, round protocol; see `.agents/skills/awareme-app-work/`.
- **Methodology audits** — per-cycle process audits (judge how, not what); see `.agents/skills/methodology-auditor/`.
- **Mobile UI design** — `.agents/skills/mobile-app-ui-design/` for mobile UI design work.
