# Decisions

Deviations from `spec.md` and resolutions of its open questions (§14). The spec (§0) requires deviations be justified here.

## Resolved open questions (§14)

1. **Session resumability** — Sessions are never manually resumable; momentum is sacred. Auto-resume only within a 5-minute wall-clock absence grace, uniform across backgrounding and cold start. See ADR-0001.
2. **On-demand stem repeat** — Yes. The library can start a session on a chosen stem, bypassing weighted selection (`origin = 'manual'`).
3. **Per-stem note/tag** — No. Stems carry text + one optional `category` only. See ADR-0002.
4. **Review period** — Default 7 days, selectable at review time from presets (7 / 14 / 30). The weekly prompt stays weekly; the `reviews` table already stores explicit `period_start`/`period_end`.

## Deviations from the spec schema (§4.2)

These follow from resolving §14 Q1 and are M1 schema changes; each still gets a migration and a `schema_version` bump per §13.8. See ADR-0003.

- **`endings.submitted_at` is nullable** (spec DDL says `NOT NULL`). A row with `submitted_at IS NULL` is an ending begun but not yet submitted.
- **`endings` rows are created on first keypress**, not on submit (spec §6.3.4). Captures true `started_at` and survives a hard kill via debounced autosave of the in-progress text.
- **New column `sessions.last_activity_at TEXT`**, bumped on the autosave debounce, so `absence = now − last_activity` is computable across a cold start.

## Scaffolding (ticket 01)

- **No web target.** Spec §2/§3 scope this app as iOS + Android only. `create-expo-app`'s default template ships React Native Web support (`react-native-web`, `react-dom`, a `web` block in `app.json`); removed both, since spec never asks for a browser target and carrying it is unused weight, not a hedge.
- **`expo-linking` added**, though not named in spec §3's dependency table. It is a hard runtime peer of `expo-router` (app fails to bundle without it) rather than a discretionary addition — recorded here for completeness, not as a deviation from intent.
- **Stripped the default template's demo app** (tabs, animated icon, hint rows, web badge, `react-native-reanimated`, `react-native-gesture-handler`, `react-native-worklets`, `@expo/ui`, `expo-glass-effect`, `expo-symbols`, `expo-image`, `expo-device`, `expo-web-browser`) down to a single `expo-router` home route, matching spec §10's "restrained, text-first, quiet" direction and the ticket's "shows a home screen" scope. None of the removed packages are requested anywhere in spec.md.

## Schema and migrations (ticket 02)

- **`expo-crypto` added**, not in spec §3's dependency table. UUIDv7 (§4.1.4, hard requirement) needs a real random-bytes source; neither `react-native` nor Expo SDK 57 polyfills `crypto.getRandomValues` on Hermes without it. It is a local, offline, no-network Expo native module — same category as `expo-linking`, not a discretionary addition. `src/db/uuidv7.ts` itself stays a pure function of injected time and randomness (unit tested deterministically); `src/db/id.ts` is the one call site that binds it to `expo-crypto`.
- **Migration tests run against `node:sqlite`** (Node 22.5+ builtin), not against `expo-sqlite` directly — `expo-sqlite` is a native module with no JS-only implementation, so it cannot execute inside plain Jest without a device/simulator. Production code (`src/db/migrate.ts`, future repositories) is written against a small `SqlExecutor` interface that `expo-sqlite`'s `SQLiteDatabase` satisfies structurally (checked at compile time by `src/db/executorCompat.check.ts`); tests adapt `node:sqlite` to the same interface. Both are real SQLite, so migration SQL is exercised against real engine semantics either way, not a mock.

## Seed content (ticket 03)

- **The two stems under spec §5.3's "general" heading are seeded with `category = null`.** Spec §5.2 defines exactly six categories (`awareness`, `self_acceptance`, `responsibility`, `assertiveness`, `purpose`, `integrity`) and "general" is not one of them, yet §5.3 groups stems #25–26 under a "general" heading. Rather than invent a seventh category or force these into one of the six, they're seeded with no category — the schema comment for `stems.category` already says "nullable for user stems," and this reads as the same escape hatch. If a later ticket wants `general` promoted to a real category, that's a schema/spec decision to make deliberately, not one to guess into a seed script.
- **All 26 stem texts and 3 meta-stem texts were checked programmatically, byte-for-byte, against spec.md §5.3–5.4** (not retyped by eye) before being committed, since fidelity to that exact original text — not Branden's — is the hard constraint in §5.1.

## Writing session (ticket 04)

- **`sessions.device_locale` is read via `Intl.DateTimeFormat().resolvedOptions().locale`**, not a new dependency (e.g. `expo-localization`). This is the same stdlib API already used for `created_tz`/`tz` in `src/db/time.ts`, works under Hermes without a native module, and spec §4.2 only asks for a locale string, not a full i18n API surface.
- **Session state lives in a plain hook (`src/session/useWritingSession.ts`), not a Zustand store.** A session is scoped to one screen's lifetime — nothing else in the app reads it mid-session — so global shared state would be unused flexibility. `sessionMachine.ts` (the reducer) and the repository calls it drives are unit tested directly; the hook is thin glue.
- **The stem-selection screen (`src/app/pick-stem.tsx`) is the "temporary picker" ticket 04 explicitly allows** ("a minimal way to reach the session on a chosen stem"). It lists all active stems with no weighting, filtering, or search — that's ticket 06/07's weighted selection and stem library, not this ticket's concern.

## Uncensored mode and interruption lifecycle (ticket 05)

- **Uncensored mode's backspace-within-word rule is enforced twice, deliberately redundantly.** `TextInput`'s `contextMenuHidden` prop disables cut/copy/paste/select at the OS level, which is what keeps the caret pinned to the end of the text in practice. `src/session/uncensoredEdit.ts#applyEdit` re-derives the same rule from the two text values (before/after) without trusting the caret, rejecting any shrink that isn't a single trailing character — so the restriction holds even if a future RN version, platform, or accessibility tool routes an edit around the disabled context menu. `backspace_count` increments in both modes; only _what's allowed_ differs by mode, per spec §6.3.6.
- **"Cannot navigate back to an earlier ending" is enforced structurally, not with a guard.** Submitted endings render as plain `ThemedText`, never as an editable/focusable control, so there is no affordance to select and no code path that could re-open one — narrower than an if-check that could later be relaxed by mistake.
