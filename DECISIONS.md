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
