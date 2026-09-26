# Sentence Completion App: Implementation Specification

> Moved from the repo root to `docs/` on 2026-09-23 (owner call, same-day commit); live pointers updated the same commit, older archives keep citing the root path.

**Version:** 1.0 **Audience:** an autonomous coding agent implementing the app end to end **Status:** ready to implement

---

## 0. How to use this document

This is a complete specification for v1. Implement it in the milestone order given in section 12. Do not skip the data model (section 4): it is the part of this app that is expensive to change later, because it defines the shape of every row the user will ever generate.

Where this document says MUST, treat it as a hard constraint. Where it says SHOULD, use judgement but justify deviations in the repo's `docs/DECISIONS.md`.

---

## 1. What this app is

The app supports a psychological exercise called **sentence completion**, popularised by Nathaniel Branden. The user is given an incomplete sentence (a "stem") such as _"If I brought five percent more awareness to my mornings..."_ and writes several different endings to it, quickly, without stopping to evaluate them.

The mechanism is speed. The exercise works because the user writes faster than their internal editor can intervene. Endings are allowed to be repetitive, contradictory, trivial, or false. The instruction to the user is: keep the pen moving.

Three design consequences follow, and they drive most of the decisions in this spec:

1. **A timer is not a gimmick.** It is the active ingredient. Time pressure is what suppresses self-censorship.
2. **Editing is the enemy.** The app SHOULD make it awkward to go back and revise, and MUST NOT require the user to produce polished text.
3. **The output is private and often uncomfortable.** The app MUST be trustworthy about where that text goes. See section 9.

The value to the user accrues over weeks, not in a single session, and it accrues partly through re-reading. Review (section 6.5) is not an optional extra.

---

## 2. Scope

### In scope for v1

- Local, offline-first mobile app for iOS and Android
- A seeded library of sentence stems
- User-authored stems, on equal footing with seeded ones
- Timed writing sessions with a configurable number of endings
- Repeating local notifications at user-set times: two daily, one weekly
- A review mode covering the last N days
- Browsable, searchable history
- Full data export in analysis-ready formats

### Explicitly out of scope for v1

- Any backend, server, or account system
- Cloud sync between devices
- Social features, sharing, leaderboards, public streaks
- AI-generated stems or AI commentary on the user's endings
- Analytics SDKs of any kind
- Monetisation, paywalls, in-app purchases

Do not build these. Do not add stubs, dead settings toggles, or "coming soon" screens for them.

---

## 3. Technical stack

| Concern       | Choice                                     | Notes                                   |
| ------------- | ------------------------------------------ | --------------------------------------- |
| Framework     | Expo (managed workflow), latest stable SDK | Single codebase, iOS + Android          |
| Language      | TypeScript, `strict: true`                 | No `any` in committed code              |
| Navigation    | `expo-router`                              | File-based routing                      |
| Storage       | `expo-sqlite`                              | See section 4                           |
| Notifications | `expo-notifications`, local only           | No push tokens, no remote notifications |
| State         | Plain React hooks / local component state  | Do not add Redux or Zustand             |
| Export/share  | `expo-file-system`, `expo-sharing`         | See section 8                           |
| Lock          | `expo-local-authentication`                | Optional, off by default                |
| Tests         | Jest + `@testing-library/react-native`     | See section 11                          |

The app MUST function fully in airplane mode. Requesting network permission at all is discouraged. If a dependency pulls in network capability, note it in `docs/DECISIONS.md`.

---

## 4. Data model

This is the most important section. The user is a data scientist and intends to analyse this corpus later, possibly years later, possibly in R or pandas rather than in this app. Design for that reader.

### 4.1 Governing principles

1. **Append-only where possible.** Never overwrite a row to represent a change of state. Add a new row, or set a soft-delete timestamp. History is data.
2. **No stored derived values.** Do not persist word counts, streak lengths, or averages. Compute them at read time. Derived columns rot and then lie.
3. **Time is stored three ways.** Every timestamp column stores UTC in ISO-8601 with milliseconds. Every table that records a user event also stores the IANA timezone (`Europe/Berlin`) and the UTC offset in minutes at the moment of the event. Without this you cannot later ask "does this person write differently at 6am than at 11pm" across a DST boundary or a holiday.
4. **Stable identifiers.** UUIDv7 for all primary keys. Never reuse, never renumber. UUIDv7 sorts chronologically, which is convenient and free.
5. **Soft delete only.** `deleted_at` nullable timestamp. The UI hides deleted rows. Export includes them with the flag intact, so an analysis can distinguish "never written" from "written and retracted", which is itself a signal.
6. **Explicit schema versioning.** A `schema_meta` table with a single row holding `schema_version`. Every migration bumps it. The export embeds it.

### 4.2 Tables

```sql
CREATE TABLE schema_meta (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version    INTEGER NOT NULL,
  app_version       TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE stems (
  id                TEXT PRIMARY KEY,          -- uuidv7
  text              TEXT NOT NULL,             -- the incomplete sentence, no trailing whitespace
  origin            TEXT NOT NULL,             -- 'seed' | 'user' | 'imported'
  category          TEXT,                      -- see 5.2, nullable for user stems
  language          TEXT NOT NULL DEFAULT 'en',
  weight            REAL NOT NULL DEFAULT 1.0, -- vestigial since the 2026-09-14 morning/evening pivot; no longer read by selection (6.2)
  active            INTEGER NOT NULL DEFAULT 1,-- 0 = archived, excluded from selection
  activation_provenance TEXT NOT NULL DEFAULT 'user', -- 'programme' | 'user' (2026-09-23 addition, ADR-0007): who last set `active`; automation activates only never-touched stems
  time_of_day       TEXT,                      -- 'morning' | 'evening' | NULL (2026-09-14 addition); pre-amendment practice tag; programme selection reads week_number instead (6.2); the two evening review meta-stems carry 'evening' (2026-09-17, 5.4); the weekly meta-stem stays NULL (unlisted, 5.4)
  week_number       INTEGER,                   -- 1..30, official programme block (2026-09-15 addition, ADR-0005); NULL for non-programme stems
  is_weekly_meta    INTEGER NOT NULL DEFAULT 0,-- 1 = the official weekly reflection stem (5.4, 6.5) (2026-09-15 addition)
  created_at        TEXT NOT NULL,
  created_tz        TEXT NOT NULL,
  created_offset_min INTEGER NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  stem_id           TEXT NOT NULL REFERENCES stems(id),
  stem_text_snapshot TEXT NOT NULL,            -- denormalised on purpose: stems can be edited
  origin            TEXT NOT NULL,             -- 'notification' | 'manual' | 'review'
  target_endings    INTEGER NOT NULL,          -- configured count at session start
  timer_seconds     INTEGER NOT NULL,          -- configured duration at session start
  uncensored_mode   INTEGER NOT NULL,          -- 0/1, backspace restriction active
  programme_on      INTEGER NOT NULL DEFAULT 1,-- 0/1 (2026-09-23 addition, ADR-0007): programme on when the session started; week derivation counts only programme_on = 1 reflections
  started_at        TEXT NOT NULL,
  first_keypress_at TEXT,                      -- nullable: user may never type
  ended_at          TEXT,
  end_reason        TEXT,                      -- 'timeout' | 'user_done' | 'abandoned'
  notification_id   TEXT,                      -- links to the scheduled notification, nullable
  notified_at       TEXT,                      -- when the notification fired
  opened_at         TEXT,                      -- when the user opened it, nullable
  last_activity_at  TEXT,                      -- bumped on the ending autosave debounce, so absence is computable across a cold start (ADR-0003)
  tz                TEXT NOT NULL,
  offset_min        INTEGER NOT NULL,
  device_locale     TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE endings (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  ordinal           INTEGER NOT NULL,          -- 1-based position within the session
  text              TEXT NOT NULL,
  started_at        TEXT NOT NULL,             -- first keypress in this field (row created then, ADR-0003)
  submitted_at      TEXT,                      -- nullable: begun but not yet submitted (ADR-0003); set on submit or session end
  backspace_count   INTEGER NOT NULL DEFAULT 0,
  was_revised       INTEGER NOT NULL DEFAULT 0,-- returned to after leaving the field
  deleted_at        TEXT,
  UNIQUE (session_id, ordinal)
);

CREATE TABLE reviews (
  id                TEXT PRIMARY KEY,
  period_start      TEXT NOT NULL,             -- inclusive, UTC
  period_end        TEXT NOT NULL,             -- exclusive, UTC
  session_ids       TEXT NOT NULL,             -- JSON array of session ids reviewed
  reflection_text   TEXT,                      -- the meta-stem response, nullable
  meta_stem_text    TEXT NOT NULL,             -- which meta-stem was used
  created_at        TEXT NOT NULL,
  tz                TEXT NOT NULL,
  offset_min        INTEGER NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE settings (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,             -- JSON-encoded
  updated_at        TEXT NOT NULL
);

CREATE TABLE notification_schedule (
  id                TEXT PRIMARY KEY,
  scheduled_for     TEXT NOT NULL,             -- UTC
  stem_id           TEXT REFERENCES stems(id), -- nullable: stem may be chosen at fire time
  os_identifier     TEXT,                      -- identifier returned by expo-notifications
  state             TEXT NOT NULL,             -- 'pending' | 'fired' | 'cancelled' | 'superseded'
  created_at        TEXT NOT NULL
);
```

Index `sessions(started_at)`, `sessions(stem_id)`, `endings(session_id)`, `stems(active, deleted_at)`.

### 4.3 On the timing columns

`first_keypress_at`, `endings.started_at`, `endings.submitted_at` and `backspace_count` are not instrumentation for its own sake. They let the user later ask questions the exercise itself cannot answer: which stems produce hesitation, whether latency drops over weeks of practice, whether the endings written in the last ten seconds differ in character from the first one. Capture them faithfully and do not round them.

Do not capture keystroke-level data beyond the backspace count. That crosses from useful into creepy, and it is the user's own diary.

### 4.4 On `stem_text_snapshot`

Users will edit their own stems. An analysis that joins `sessions` to the current `stems.text` would silently misattribute old sessions to reworded prompts. Store the exact stem text as shown, at session start, on the session row. Keep the foreign key as well, so both questions ("what was on screen" and "which stem lineage") remain answerable.

---

## 5. Seed content

### 5.1 Attribution and originality constraint

The method is Nathaniel Branden's. **2026-09-15 amendment (ADR-0005):** the app now seeds the official Sentence Completion I programme — the thirty week blocks plus the weekly reflection stem — **verbatim**, by permission granted by Leigh Branden to Nicolo' Brandizzi (2026-09-15). The canonical source is `https://nathanielbranden.com/sentence-completion-i/`; a byte-exact snapshot lives at `.scratch/official-program/official-program-verbatim.txt`, and seeds MUST be transcribed from it (or the live page) without paraphrase, including its typographical quirks. Sentence Completion II (the _Taking Responsibility_ programme) is covered by the same permission but is out of scope (schema must not preclude it).

The v1 original seed list (former §5.3) is **retired**: fresh installs seed it soft-deleted (§5.3); installs that predate this amendment keep their rows untouched (append-only). No new stems may be invented "in the spirit of the method" — the shipped corpus is the official programme plus whatever the user adds.

The onboarding screen MUST credit the method by name and point the user to Branden's books. The About screen MUST credit the method, link to the programme page, and state that the stems are used with permission from Leigh Branden.

### 5.2 Categories

Six categories, used for browsing and filtering. These are conceptual buckets, not quoted text:

`awareness`, `self_acceptance`, `responsibility`, `assertiveness`, `purpose`, `integrity`

### 5.3 Seed stems

**2026-09-15 amendment (ADR-0005):** first-launch seeding now inserts the official Sentence Completion I programme (§5.1): every stem of Weeks 1–30, transcribed byte-for-byte from the canonical snapshot, `origin = 'seed'`, `week_number` 1–30, `time_of_day = 'morning'`; plus the weekly reflection stem, seeded once with `is_weekly_meta = 1`, `week_number = NULL`. Programme stems are stored **without** the trailing terminator exactly as before: the snapshot writes stems with a trailing ellipsis; strip it at seed time and append the `stem_terminator` setting at render. `week_number = NULL`. Programme stems are stored **without** the trailing terminator: the snapshot writes stems with a trailing ellipsis; strip it at seed time and append the `stem_terminator` setting at render.

The v1 original list (26 stems) is **retired**: on fresh installs it is seeded soft-deleted (present in exports as retracted rows, never active, never shown in the library); on installs that predate this amendment those rows are left exactly as they are. Its canonical text lives in the seed module (`src/db/seed/stems.ts`); the official programme's in `.scratch/official-program/official-program-verbatim.txt`.

### 5.4 Meta-stems for review

Used in review mode (section 6.5), stored with the same terminator handling. Meta-stems carry `time_of_day = NULL`, except the two evening reflection meta-stems, which carry `time_of_day = 'evening'` (**2026-09-17 amendment:** they are listed in the stem library, and the Evening filter MUST match them, §6.6). The weekly reflection stem stays `time_of_day = NULL` and is not listed in the stem library. **2026-09-15 amendment (ADR-0005):** the first stem below is the official weekly reflection stem — migration 0004 tags it `is_weekly_meta = 1` — and it is the stem used by the *scheduled* weekly reflection (§6.5). The other two power the evening reflection practice (§6.2) on a deterministic alternating schedule. All three remain available to on-demand review:

- If any of what I wrote this week is true, it might be helpful if I
- Reading these back, the thing I notice myself circling is
- If I take these endings seriously rather than dismissing them

---

## 6. Behaviour

### 6.1 Onboarding

Five screens, skippable, shown once (**2026-09-17 amendment:** five tabs in this order; the evening-practice ask folded in as step 4 of 5, not a standalone pre-onboarding card):

1. Credit to Branden and the method: this app is built on his method, part of a larger approach aimed at increasing self-awareness.
2. What sentence completion is, in under 60 words. Emphasise: write fast, do not evaluate, repetition and nonsense are fine.
3. Notification permission request, with an honest explanation of the fixed daily times (§6.4). If the user declines, the app MUST remain fully usable in manual mode and MUST NOT nag.
4. The evening-practice ask ("Include an evening practice?", §7). Any answer or skip completes the ask.
5. Set the morning/evening notification times (§6.4), endings per session (default 7), and timer (default 90 seconds).

### 6.2 Stem selection

A session is a **practice**: the period's composed set of stems (below), written one after another in sequence.

- **The practice is the user's picks + the programme block, behind ONE binary `programme` setting (2026-09-23, ADR-0007; supersedes ADR-0005's programme-only mode).** The morning practice loads the user's active picks first (2026-09-26, packet-12 owner decision: the user's individually enabled programme stems count as picks — enabled means it shows — and are deduplicated against the week block while the programme setting is on), then — while the programme setting (§7) is on — every active programme stem of the **current programme week**: `stems` where `active = 1 AND deleted_at IS NULL AND week_number = <current week>`, in seed order. No weighting, no recency penalty, no randomness. There is no per-period picker and no three-way mode: programme-only, programme+mine, and mine-only all emerge from the gate plus the user's picks.
- The **current programme week is derived at read time** (§13.7 — never stored): `1 +` the number of distinct calendar weeks (Mon–Sun) containing at least one completed weekly reflection session (§6.5) recorded while the programme was on (sessions record `programme_on` at write time, §4.2 — off-period reflections never count, ADR-0007), counted from the week of the first official-programme practice ever written, capped at 30. Advancement is therefore self-paced: missing days never skips weeks, and two reflections inside one calendar week do not skip ahead.
- The user may **select any week** as their current week (§6.6). The selection is stored as the `program_week_override` setting (nullable, §7) — user input, not a derived value. Completing the reflection of the selected week clears the override so the derived week takes over; Home shows a calm nudge ("Week N complete — Week N+1 is ready"). Encouragement only — no guilt copy (§13.4).
- **The programme can be paused (2026-09-23, ADR-0007).** Off = zero state changes: no automation write runs, the derived week stops advancing (counting rule above), and reflections are still recorded. The week screen stays browsable; the user can still pick a week and manually activate stems. Turning it back on **pins week 1** (`program_week_override = 1`, with an in-app dialog linking to the week screen, §6.6); the derived week — counting only enabled-period reflections — remains the fallback once the override clears.
- The **evening practice** (only when `evening_practice_enabled`, §7) reflects the start of the day instead of repeating it: today's morning endings shown read-only (§6.5's review mechanics), then one reflection meta-stem (§5.4) as a normal timed session. The stem **alternates deterministically** between the two non-weekly review meta-stems, keyed to the count of completed evening reflection sessions. Custom/user-added stems enter a practice only as the user's picks (above); they are otherwise written on demand from the library (`origin = 'manual'`).
- The practice is complete only once every stem in that set has been written (§6.3 covers the per-stem writing mechanics, unchanged).
- `time_of_day` keeps its meaning for pre-amendment rows; programme selection is driven by `week_number`. `stems.weight` is retained in the schema (§4.2) but remains unread (ADR-0004).

### 6.3 The writing session

This is the core screen. Get it right.

1. The stem is displayed alone, large, with a **Start** control. Nothing is timed until the user taps Start, so a notification that arrives at a bad moment costs nothing.
2. On Start: the timer begins and the first input field is focused with the keyboard up.
3. The stem remains visible above the input at all times. The user is completing _this_ sentence, repeatedly, and losing sight of it breaks the exercise.
4. `target_endings` fields, revealed one at a time. Submitting a field (the return key) advances to the next; the field's `endings` row was created on first keypress (ADR-0003) and is finalized on submit. An empty field is not submittable; timeout/expiry saves it anyway (item 8, and the per-stem timer below).
5. Previously written endings in this session remain visible above, in a dimmed style. Seeing your own repetition is part of the method.
6. **Uncensored mode** (default on): backspace is limited to the current word only; long-press-to-select and cut are disabled within input fields; the user cannot navigate back to an earlier ending in the same session. Increment `backspace_count` regardless. A setting turns this off for users who find it intolerable, and the setting value is recorded per session.
7. The timer is a thin, calm progress indicator. No red, no ticking sound, no vibration, no countdown numerals larger than the text. Anxiety is not the goal; momentum is. An optional per-stem timer (`stem_timer_enabled`/`stem_timer_seconds`, 2026-09-11 addition; see §7) runs alongside it as a second, independent countdown scoped to the current field: on expiry, whatever is typed in that field is saved as-is (same "nothing discarded" rule as item 8) and the session advances to the next field without ending. The session timer above is unaffected and still ends the session if it expires first. The timer's numerals may carry a depleting-color cue tied to whichever of the two timers is more urgent, as an ambient pressure signal only — no penalty text, no shaming copy (§13.4).
8. On timeout: the session ends immediately, whatever is on screen is saved (including a partially typed final ending), `end_reason = 'timeout'`. Nothing is discarded, ever.
9. The user may finish early with a **Done** control (`end_reason = 'user_done'`), including with fewer than the target number of endings.
10. If the app is backgrounded mid-session: on return within 5 minutes, resume with the timer having continued to run. After 5 minutes, close the session with `end_reason = 'abandoned'` and save everything written.
11. After the session: the endings shown back once, and no scoring, no evaluation of the content. A post-session celebration is permitted only as bounded by §13.4/§13.6 and `docs/design/gamification-proposal-2026-09-11.md`.

### 6.4 Notifications

- Two repeating daily local notifications: one at `morning_notification_time`, one at `evening_notification_time` (both user-set "HH:MM" local wall-clock times, §7; default 08:00 and 21:00, the book's own suggestion of start and end of day). No randomness, no window, no count-per-day, no 90-minute gap rule — the user sets two exact times, and both fire every day at those times. The evening notification is scheduled only when `evening_practice_enabled` is true (§7).
- **2026-09-15 amendment (ADR-0005):** a third repeating local notification for the weekly reflection fires at `weekly_meta_time` on `weekly_meta_day` (§7; default Sunday 21:00) via the platform's native weekly-repeat trigger. Same discipline as the daily pair: content-free copy (e.g. "Time for your weekly reflection."), reschedule on foreground / setting change / permission grant, and no consequence for missing it.
- Use the platform's native daily-repeat trigger so the OS itself handles the daily repetition in local time; there is no fire-time math, rolling horizon, or DST handling to own in the app.
- Reschedule (cancel all pending, recreate from current settings) on: app foreground, a notification time being changed in settings, permission grant.
- `notification_schedule` is retained in the schema (§4.2) but is no longer written to by scheduling — there is no per-fire stem draw left to record (§6.2: a practice loads all of a period's stems, not one chosen at schedule time).
- Notification copy MUST NOT contain any stem text or user text, since notifications appear on lock screens and this content is private. Use neutral copy, e.g. "Time for your morning practice." / "Time for your evening practice." — distinct copy per period is fine as long as both stay content-free.
- Missing a notification has no consequence in the app. No streak counter, no guilt copy, no "you have not written in 4 days". If a streak-like display is added at all, it is descriptive and unemphasised.

### 6.5 Review mode

Three forms (ADR-0005):

1. **Scheduled weekly reflection** — offered by the weekly notification (§6.4) and a Home card on the target day. Show every ending written in the current programme week, grouped by session, chronological, read-only; then the weekly stem (`is_weekly_meta = 1`, §5.4) as a normal timed session (`review_timer_seconds`, default 180; `origin = 'review'`); store in `reviews` with the reviewed session ids captured explicitly. Completing it advances the derived programme week (§6.2) — by derivation, never by a write.
2. **Evening reflection** — §6.2's evening practice: today's morning endings read-only, then one alternating review meta-stem, same storage path as (1) but scoped to the day's sessions.
3. **On demand** — the same mechanics as (1) at any time, with any of the three meta-stems (§5.4) and a user-selected period.

### 6.6 Stem library

- List all stems, filterable by category, origin, and active state; searchable by text. Programme stems are grouped **by week** (Week 1–30); a week's page offers a one-off practice (`origin = 'manual'`, does not move the programme position) and a "make this my week" action (sets `program_week_override`, §6.2).
- Add: a single text field, plus optional category. Validate: non-empty after trim, under 200 characters, does not already exist verbatim. Warn but permit if it ends with terminal punctuation, since a stem should be an unfinished clause.
- Edit: permitted. Sessions retain their snapshot (section 4.4).
- Archive (`active = 0`) rather than delete, as the primary destructive action. Deletion is available but soft, and clearly explains that past sessions remain. Soft-deleted stems are hidden from the library list by default (2026-09-24, p10 owner pick); a "Show deleted" filter in the filters sheet reveals them as a read-only group — never writable, restore and exports unchanged. Archive is genuinely persistent (2026-09-23, ADR-0007): programme automation activates only stems the user has never touched (§6.2), so a deactivated stem — programme or not — stays deactivated.
- Bulk import: paste or open a `.txt` file, one stem per line, `origin = 'imported'`. Show a preview and a count before committing.

### 6.7 History

- Reverse-chronological list of sessions, showing stem and date.
- Full-text search across endings, using SQLite FTS5.
- Filter by stem, by category, by date range.
- Per session: all endings, timing, and the option to soft-delete the session.

---

## 7. Settings

| Key                         | Type   | Default   | Notes                                                                                                                                               |
| --------------------------- | ------ | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `endings_per_session`       | int    | 7         | Range 6 to 10 (default 7, 2026-09-24)                                                                                                              |
| `timer_seconds`             | int    | 90        | Range 30 to 600                                                                                                                                     |
| `review_timer_seconds`      | int    | 180       |                                                                                                                                                     |
| `uncensored_mode`           | bool   | true      |                                                                                                                                                     |
| `stem_terminator`           | string | `"..."`   |                                                                                                                                                     |
| `app_lock_enabled`          | bool   | false     | Biometric or device passcode                                                                                                                        |
| `weekly_review_prompt`      | bool   | true      |                                                                                                                                                     |
| `theme`                     | string | `system`  |                                                                                                                                                     |
| `stem_timer_enabled`        | bool   | false     | 2026-09-11 addition. Optional per-stem time limit, separate from `timer_seconds`; off by default                                                    |
| `stem_timer_seconds`        | int    | 60        | 2026-09-11 addition. Range 20 to 120. Only used when `stem_timer_enabled` is true                                                                   |
| `morning_notification_time` | string | `"08:00"` | 2026-09-14 addition. Local "HH:MM"                                                                                                                  |
| `evening_notification_time` | string | `"21:00"` | 2026-09-14 addition. Local "HH:MM"                                                                                                                  |
| `evening_practice_enabled`  | bool   | `true`    | 2026-09-15 addition (ADR-0005). Asked exactly once at first launch ("Include an evening practice?"): onboarding step 4 of 5 (2026-09-17); installs predating the five-tab flow are asked once via the standalone card. Changeable in Settings. Gates the evening reflection practice (§6.2) and the evening notification (§6.4) |
| `weekly_meta_day`           | string | `"sunday"` | 2026-09-15 addition. Day of the weekly reflection notification (§6.4); any weekday name, lowercase                                                |
| `weekly_meta_time`          | string | `"21:00"` | 2026-09-15 addition. Local "HH:MM" fire time of the weekly reflection notification                                                                 |
| `program_week_override`     | int/null | `null`  | 2026-09-15 addition. User-selected current programme week (1–30); null = derive from history (§6.2). Cleared when the selected week's reflection completes |
| `programme`                 | bool   | `true`    | 2026-09-23 addition (ADR-0007). The ONE binary Programme gate (§6.2): on = the practice includes the programme week block; off = picks only and the programme pauses. Lives in Settings, Practice section |

---

## 8. Export

The stated requirement is that this corpus stays open to analysis later. Export is therefore a first-class feature, not an afterthought, and it MUST be reachable in two taps from the main screen.

Offer three formats via the system share sheet:

1. **SQLite database file.** A direct copy of the app database, integrity-checked and VACUUMed before copying. This is the highest-fidelity option and the one to recommend in the UI for anyone who plans to analyse the data.
2. **JSON bundle.** A single UTF-8 file:
   ```json
   {
     "export_version": 1,
     "schema_version": 4,
     "app_version": "1.0.2",
     "exported_at": "2026-09-10T14:03:22.418Z",
     "exported_tz": "Europe/Berlin",
     "stems": [...],
     "sessions": [...],
     "endings": [...],
     "reviews": [...],
     "settings": {...}
   }
   ```
   Rows are exported as-is, including soft-deleted rows with their `deleted_at` intact.
3. **CSV set.** `stems.csv`, `sessions.csv`, `endings.csv`, `reviews.csv`, zipped, plus a `README.md` documenting every column, its type, its units, and its null semantics. RFC 4180 quoting. UTF-8 with BOM omitted. One header row. Newlines inside `endings.text` preserved inside quotes.

Additional requirements:

- Export MUST be lossless with respect to the database. If a column exists, it appears in the JSON and CSV export.
- A round-trip test MUST exist: export, wipe, import, export again, assert byte-identical JSON modulo the `exported_at` field.
- Import of a previously exported JSON bundle MUST be supported, with a clear choice between merge (by id, skipping existing) and replace.
- Never truncate, normalise, or clean the user's text on export. Their typos are their data.

---

## 9. Privacy and trust

- All data stays on device. No network calls. No analytics, no crash reporting SDK, no attribution SDK, no ads.
- Optional app lock via biometrics or device passcode, applied on cold start and on foreground after 60 seconds.
- Notification content never includes user text or stem text.
- The App Store and Play Store privacy declarations MUST accurately state that no data is collected. Do not add a dependency that would make this false without flagging it.
- Provide a "delete all data" action in settings, with a hard confirmation, that actually drops and recreates the database rather than soft-deleting.
- Screenshots for store listings MUST use invented sample endings, not anything resembling real personal disclosure.

---

## 10. Design direction

Restrained, text-first, and quiet. This app is used at odd hours by someone writing things they would not say out loud.

- Typography carries the design. One serif face for stems and endings, one neutral sans for interface chrome. Generous line height.
- Dark mode is not an afterthought; assume heavy evening use.
- No illustration, no mascot, no confetti. Achievement badges exist only as bounded by §13.4 and `docs/design/gamification-proposal-2026-09-11.md` — quiet, post-session, never during writing.
- Motion is limited to fades, the timer's progress, and the single sanctioned post-session completion settle (gamification proposal §1.A). Nothing bounces.
- The writing screen has no navigation chrome at all beyond a single exit affordance.
- Accessibility: full Dynamic Type support, VoiceOver labels on every control, minimum 4.5:1 contrast, and the timer must be announced as a non-alarming progress element rather than as a countdown.

---

## 11. Testing

Unit tests are required for:

- practice composition: the derived programme week (§6.2), `program_week_override` handling, and correct behaviour with an empty or exhausted week.
- Notifications: daily/weekly repeat triggers reschedule idempotently (cancel-and-recreate), copy stays content-free, the evening and weekly notifications gated by their settings.
- Session lifecycle: timeout saves partial text, backgrounding rules, `end_reason` correctness.
- Export: round-trip fidelity, CSV quoting for text containing commas, quotes, and newlines, soft-deleted row inclusion.
- Migrations: every schema version upgrades cleanly from every prior version, with a fixture database per version committed to the repo.

Integration test: complete a full session from notification through to a row in `endings`, on both platforms.

---

## 12. Milestones

Implement in this order. Each milestone ends with a working, installable build.

**M1: Data foundation.** Schema, migrations, seed insertion, repository layer, tests. No UI beyond a debug screen that dumps tables.

**M2: The session.** Writing screen, timer, uncensored mode, persistence, manual start only. This is the whole product in embryo; spend disproportionate time here and use it yourself before proceeding.

**M3: Stem library.** Browse, add, edit, archive, bulk import.

**M4: Notifications.** Fixed daily and weekly-repeat notifications, rescheduling on foreground/permission/setting change, deep link into a session.

**M5: History and review.** List, FTS5 search, filters, review mode with meta-stems.

**M6: Export and import.** All three formats, the documented CSV README, round-trip tests.

**M7: Polish and ship.** Onboarding, app lock, accessibility pass, design pass, store assets, privacy declarations.

Note for scheduling: if publishing to Google Play from a personal developer account created after November 2023, a closed test with at least 12 continuously opted-in testers for 14 days is required before production access. Start that clock at the end of M4, not at the end of M7.

---

## 13. Constraints the agent must not violate

1. No stem text used without recorded permission: the official programme is used under permission from Leigh Branden (§5.1); never add Branden text beyond it.
2. No network, no accounts, no analytics, no telemetry.
3. No AI features: no generated stems, no interpretation of the user's endings, no sentiment scoring shown in the app. Analysis is something the user does with their own exported data, on their own terms.
4. Gamification is permitted only as bounded by `docs/design/gamification-proposal-2026-09-11.md`: milestone badges and streak display, computed at read time (§13.7 still governs), shown only after a session completes, never during writing. Gamification MUST NOT shame absence — no guilt copy, no broken-streak dramatics, no consequence for a missed day. Streaks, where shown, are descriptive.
5. No destructive-by-default operations. Archive before delete, soft before hard.
6. No evaluation of the user's writing anywhere in the interface. Post-session celebration and badge/streak display are not evaluation: they acknowledge history, never score, interpret, rank, or compare the user's writing itself, and MUST NOT appear during the writing phase.
7. No stored derived values in the database.
8. Do not change the schema without a migration and a version bump, even in development.
9. The smallest supported screen is 320×640 @ 160dp (2026-09-24, owner-ratified support floor). Every screen MUST be fully usable at this size: no clipped controls, no unreachable actions. Overflow at this size is a defect, not a cosmetic issue.

---

## 14. Open questions for the user

All four are resolved; the resolutions live in `docs/DECISIONS.md` (with the ADRs they cite).
