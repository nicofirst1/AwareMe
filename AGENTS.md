# Guidance for coding agents

This file is a map. The targets are the sources of truth; when a pointer and its target disagree, fix the pointer.

## Read first

- `spec.md` — the contract; read before any work. RFC-2119 language: `MUST` binds, a `SHOULD` deviation needs a `DECISIONS.md` entry. §2 lists out-of-scope features (stay out — no stubs or toggles); §13 lists the hard constraints (airplane mode, no stored derived values, permission-scoped seed text).
- `DECISIONS.md` — the decision index: §14 resolutions, standing decisions, environment quirks, parked arbitrations. Append new deviations there, one bullet with a pointer to the full record; architecture rationale lives in `docs/adr/`.
- `.scratch/` — the issue tracker and current status, one folder per feature; see `docs/agents/issue-tracker.md`.

## Where things live

- **Data model** — spec §4. Invariants designed for a future R/pandas reader; internalise before writing any storage code.
- **Schema changes** — spec §13.8 + `src/db/fixtures/README.md`. Every change ships a migration, a `schema_meta` version bump, and a fixture DB; the migration tests assert upgrades.
- **Behaviour rules** — spec §6: sittings, uncensored writing mode, notifications, settings.
- **Data access** — `src/db/repository.ts` is the full data surface; new methods go there. Import from `@/db` outside `src/db/`.
- **Seed content** — `src/db/seed/stems.ts`, verbatim from spec §5.3–5.4. Never retype from memory; never copy from Branden sources (spec §5.1).
- **Gamification** — `docs/design/gamification-proposal-2026-09-11.md` is its only sanctioned scope.
- **Export** — spec §8: lossless formats; the export→wipe→import→export round-trip test must stay green.
- **Extra deps** — `expo-linking`, `expo-crypto` are non-discretionary; rationale in `DECISIONS.md`.
- **Commands** — `package.json`. Release APK: `./scripts/rebuild-android.sh` (a debug APK has no JS bundle and runs only tethered to Metro).
- **Jest failing with `Cannot find module 'expo-asset'`** — known recurring `node_modules` gap; remedy in `DECISIONS.md`.

## Agent skills

- **Triage labels** — five-role vocabulary; see `docs/agents/triage-labels.md`.
- **Domain docs** — one `CONTEXT.md` + `docs/adr/` at the repo root; see `docs/agents/domain.md`.
- **Mobile UI design** — `.claude/skills/mobile-app-ui-design/` for mobile UI design work.
