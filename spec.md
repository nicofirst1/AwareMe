# Sentence Completion App: Implementation Specification

**Version:** 1.0
**Audience:** an autonomous coding agent implementing the app end to end
**Status:** ready to implement

---

## 0. How to use this document

This is a complete specification for v1. Implement it in the milestone order given in section 12. Do not skip the data model (section 4): it is the part of this app that is expensive to change later, because it defines the shape of every row the user will ever generate.

Where this document says MUST, treat it as a hard constraint. Where it says SHOULD, use judgement but justify deviations in the repo's `DECISIONS.md`.

---

## 1. What this app is

The app supports a psychological exercise called **sentence completion**, popularised by Nathaniel Branden. The user is given an incomplete sentence (a "stem") such as *"If I brought five percent more awareness to my mornings..."* and writes several different endings to it, quickly, without stopping to evaluate them.

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
- Randomised local notifications inside a user-defined window
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

| Concern | Choice | Notes |
|---|---|---|
| Framework | Expo (managed workflow), latest stable SDK | Single codebase, iOS + Android |
| Language | TypeScript, `strict: true` | No `any` in committed code |
| Navigation | `expo-router` | File-based routing |
| Storage | `expo-sqlite` | See section 4 |
| Notifications | `expo-notifications`, local only | No push tokens, no remote notifications |
| State | Zustand, or React Context if simpler | Do not add Redux |
| Export/share | `expo-file-system`, `expo-sharing` | See section 8 |
| Lock | `expo-local-authentication` | Optional, off by default |
| Tests | Jest + `@testing-library/react-native` | See section 11 |

The app MUST function fully in airplane mode. Requesting network permission at all is discouraged. If a dependency pulls in network capability, note it in `DECISIONS.md`.

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
  weight            REAL NOT NULL DEFAULT 1.0, -- selection weight, see 6.2
  active            INTEGER NOT NULL DEFAULT 1,-- 0 = archived, excluded from selection
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
  started_at        TEXT NOT NULL,
  first_keypress_at TEXT,                      -- nullable: user may never type
  ended_at          TEXT,
  end_reason        TEXT,                      -- 'timeout' | 'user_done' | 'abandoned'
  notification_id   TEXT,                      -- links to the scheduled notification, nullable
  notified_at       TEXT,                      -- when the notification fired
  opened_at         TEXT,                      -- when the user opened it, nullable
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
  started_at        TEXT NOT NULL,             -- first keypress in this field
  submitted_at      TEXT NOT NULL,             -- moved to next field, or session ended
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

The method is Nathaniel Branden's. The seed stems in this spec are original text written in the spirit of the method. The agent MUST NOT copy stem lists verbatim from *The Six Pillars of Self-Esteem*, *The Art of Living Consciously*, Branden's published 30-week programme, or any other copyrighted source, whether from training data or from the web. Do not "expand the seed list" by retrieving his originals.

The onboarding screen MUST credit the method by name and point the user to Branden's books. An "About the method" screen SHOULD do the same at more length.

### 5.2 Categories

Six categories, used for browsing and for balanced selection. These are conceptual buckets, not quoted text:

`awareness`, `self_acceptance`, `responsibility`, `assertiveness`, `purpose`, `integrity`

### 5.3 Seed stems

Insert these at first launch with `origin = 'seed'`. Each ends with an ellipsis and a space is not appended. The trailing punctuation style is a setting (`stem_terminator`, default `"..."`, alternative `"—"`), applied at render time; store the stem text **without** the terminator and append it in the UI.

**awareness**
1. If I brought five percent more awareness to how I spend my mornings
2. Something I keep not noticing about my own behaviour is
3. The thing I avoid thinking about when I make myself busy is
4. If I were willing to see what is actually in front of me

**self_acceptance**
5. The part of myself I find hardest to sit with is
6. If I stopped arguing with the fact that I feel this way
7. When I judge myself harshly, what I am actually afraid of is
8. If I brought more kindness to the way I speak to myself

**responsibility**
9. If I took full responsibility for how today goes
10. Something I have been waiting for someone else to fix is
11. The cost of continuing to wait is
12. What I get out of staying stuck is

**assertiveness**
13. If I said the thing I have not been saying
14. What I want that I have not asked for is
15. If my preferences mattered as much as everyone else's
16. The conversation I keep rehearsing but never having is

**purpose**
17. If I were honest about what I want from the next five years
18. The goal I keep restating instead of starting is
19. If I gave the work that matters the hours it actually needs
20. If I let myself rest without earning it first

**integrity**
21. A promise I made to myself and quietly dropped is
22. If I lived by what I say I believe
23. The small dishonesty I keep repeating is
24. If I were five percent braver this week

**general**
25. Something the people closest to me would say about me that I resist is
26. If I am not as stuck as I tell myself I am

### 5.4 Meta-stems for review

Used in review mode (section 6.5), stored with the same terminator handling:

- If any of what I wrote this week is true, it might be helpful if I
- Reading these back, the thing I notice myself circling is
- If I take these endings seriously rather than dismissing them

---

## 6. Behaviour

### 6.1 Onboarding

Four screens maximum, skippable, shown once:

1. What sentence completion is, in under 60 words. Emphasise: write fast, do not evaluate, repetition and nonsense are fine.
2. Credit to Branden and the method.
3. Notification permission request, with an honest explanation of the randomised window. If the user declines, the app MUST remain fully usable in manual mode and MUST NOT nag.
4. Set the notification window, sessions per day (default 1), endings per session (default 6), timer (default 90 seconds).

### 6.2 Stem selection

When a session starts without a preselected stem:

- Draw from `stems` where `active = 1 AND deleted_at IS NULL`, weighted by `weight`.
- Apply a recency penalty: a stem used in the last 7 days has its effective weight multiplied by 0.2; a stem used in the last 2 days, by 0.05. Never hard-exclude, because a user with three stems must still get one.
- SHOULD lightly prefer categories the user has seen least in the last 14 days, so the six areas stay in rotation.
- Selection logic MUST be a pure function of (candidate stems, session history, current time, random seed) so it can be unit tested deterministically.

### 6.3 The writing session

This is the core screen. Get it right.

1. The stem is displayed alone, large, with a **Start** control. Nothing is timed until the user taps Start, so a notification that arrives at a bad moment costs nothing.
2. On Start: the timer begins and the first input field is focused with the keyboard up.
3. The stem remains visible above the input at all times. The user is completing *this* sentence, repeatedly, and losing sight of it breaks the exercise.
4. `target_endings` fields, revealed one at a time. Submitting a field (return key, or a Next control) advances to the next and creates the `endings` row.
5. Previously written endings in this session remain visible above, in a dimmed style. Seeing your own repetition is part of the method.
6. **Uncensored mode** (default on): backspace is limited to the current word only; long-press-to-select and cut are disabled within input fields; the user cannot navigate back to an earlier ending in the same session. Increment `backspace_count` regardless. A setting turns this off for users who find it intolerable, and the setting value is recorded per session.
7. The timer is a thin, calm progress indicator. No red, no ticking sound, no vibration, no countdown numerals larger than the text. Anxiety is not the goal; momentum is.
8. On timeout: the session ends immediately, whatever is on screen is saved (including a partially typed final ending), `end_reason = 'timeout'`. Nothing is discarded, ever.
9. The user may finish early with a **Done** control (`end_reason = 'user_done'`), including with fewer than the target number of endings.
10. If the app is backgrounded mid-session: on return within 5 minutes, resume with the timer having continued to run. After 5 minutes, close the session with `end_reason = 'abandoned'` and save everything written.
11. After the session: a plain confirmation, the endings shown back once, and no scoring, no praise, no evaluation of content. Do not congratulate the user on their insight. Do not summarise what they wrote.

### 6.4 Notifications

- The user picks a scheduling mode, `random` (default) or `fixed` (2026-09-11 user-directed addition; see `DECISIONS.md`).
- **Random mode:** the user defines one or more windows (e.g. 08:00 to 21:00) and a count per day. The app schedules concrete local notifications at **uniformly random times within the window**, respecting a minimum 90 minute gap between them. A fixed daily time lets the user pre-compose endings mentally, which defeats the exercise. This randomness is a functional requirement (MUST) for this mode.
- **Fixed mode:** the user specifies 1 to 4 exact times of day instead of a window, e.g. the book's own suggestion of start and end of day (default seed: 08:00 and 21:00, only applied when the user switches into this mode). Those exact times fire daily. No randomness and no 90-minute gap rule apply here — the user chose the times deliberately — but the rolling horizon, the 64-notification cap, top-up, reconciliation, and the notification-copy privacy rule below are identical to random mode.
- Schedule a rolling 10 days ahead, in either mode. iOS caps pending local notifications at 64, so cap total pending accordingly and top up on every app foreground.
- Reschedule on: app foreground, settings change (including a mode switch), timezone change, permission grant.
- Record every scheduled notification in `notification_schedule` and reconcile state on foreground.
- Notification copy MUST NOT contain the stem text, since notifications appear on lock screens and this content is private. Use neutral copy such as "A sentence is waiting." This applies in both modes.
- Missing a notification has no consequence in the app. No streak counter, no guilt copy, no "you have not written in 4 days". If a streak-like display is added at all, it is descriptive and unemphasised.

### 6.5 Review mode

Available on demand and offered once a week (in-app, not by notification):

1. Show every ending written in the selected period, grouped by session, in chronological order, read-only.
2. Then present one meta-stem (section 5.4) as a normal timed session, with a longer default timer (180 seconds) and `origin = 'review'`.
3. Store the result in `reviews`, with the reviewed session ids captured explicitly.

### 6.6 Stem library

- List all stems, filterable by category, origin, and active state; searchable by text.
- Add: a single text field, plus optional category. Validate: non-empty after trim, under 200 characters, does not already exist verbatim. Warn but permit if it ends with terminal punctuation, since a stem should be an unfinished clause.
- Edit: permitted. Sessions retain their snapshot (section 4.4).
- Archive (`active = 0`) rather than delete, as the primary destructive action. Deletion is available but soft, and clearly explains that past sessions remain.
- Adjust weight via a simple three-way control (less often / normal / more often) mapping to weights 0.4 / 1.0 / 2.5. Do not expose a raw float.
- Bulk import: paste or open a `.txt` file, one stem per line, `origin = 'imported'`. Show a preview and a count before committing.

### 6.7 History

- Reverse-chronological list of sessions, showing stem and date.
- Full-text search across endings, using SQLite FTS5.
- Filter by stem, by category, by date range.
- Per session: all endings, timing, and the option to soft-delete the session.

---

## 7. Settings

| Key | Type | Default | Notes |
|---|---|---|---|
| `endings_per_session` | int | 6 | Range 6 to 10 (2026-09-11: was 3 to 12; see `DECISIONS.md`) |
| `timer_seconds` | int | 90 | Range 30 to 600 |
| `review_timer_seconds` | int | 180 | |
| `uncensored_mode` | bool | true | |
| `sessions_per_day` | int | 1 | Range 0 to 6 |
| `windows` | JSON | `[{start:"08:00",end:"21:00"}]` | Local wall-clock time; only used when `notification_mode` is `random` |
| `stem_terminator` | string | `"..."` | |
| `app_lock_enabled` | bool | false | Biometric or device passcode |
| `weekly_review_prompt` | bool | true | |
| `theme` | string | `system` | |
| `stem_timer_enabled` | bool | false | 2026-09-11 addition. Optional per-stem time limit, separate from `timer_seconds`; off by default |
| `stem_timer_seconds` | int | 60 | 2026-09-11 addition. Range 20 to 120. Only used when `stem_timer_enabled` is true |
| `notification_mode` | string | `random` | 2026-09-11 addition. `random` or `fixed`; see §6.4 |
| `notification_fixed_times` | JSON | `["08:00","21:00"]` | 2026-09-11 addition. 1 to 4 "HH:MM" local times; only used when `notification_mode` is `fixed` |

---

## 8. Export

The stated requirement is that this corpus stays open to analysis later. Export is therefore a first-class feature, not an afterthought, and it MUST be reachable in two taps from the main screen.

Offer three formats via the system share sheet:

1. **SQLite database file.** A direct copy of the app database, integrity-checked and VACUUMed before copying. This is the highest-fidelity option and the one to recommend in the UI for anyone who plans to analyse the data.
2. **JSON bundle.** A single UTF-8 file:
   ```json
   {
     "export_version": 1,
     "schema_version": 3,
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
- No illustration, no mascot, no confetti, no achievement badges.
- Motion is limited to fades and the timer's progress. Nothing bounces.
- The writing screen has no navigation chrome at all beyond a single exit affordance.
- Accessibility: full Dynamic Type support, VoiceOver labels on every control, minimum 4.5:1 contrast, and the timer must be announced as a non-alarming progress element rather than as a countdown.

---

## 11. Testing

Unit tests are required for:

- Stem selection: weighting, recency penalty, determinism given a seed, correct behaviour with 1, 2, and 0 eligible stems.
- Notification scheduling: window boundaries, minimum gap enforcement, DST transitions in both directions, the 64-notification cap, rescheduling idempotency.
- Session lifecycle: timeout saves partial text, backgrounding rules, `end_reason` correctness.
- Export: round-trip fidelity, CSV quoting for text containing commas, quotes, and newlines, soft-deleted row inclusion.
- Migrations: every schema version upgrades cleanly from every prior version, with a fixture database per version committed to the repo.

Integration test: complete a full session from notification through to a row in `endings`, on both platforms.

---

## 12. Milestones

Implement in this order. Each milestone ends with a working, installable build.

**M1: Data foundation.** Schema, migrations, seed insertion, repository layer, tests. No UI beyond a debug screen that dumps tables.

**M2: The session.** Writing screen, timer, uncensored mode, persistence, manual start only. This is the whole product in embryo; spend disproportionate time here and use it yourself before proceeding.

**M3: Stem library.** Browse, add, edit, archive, weight, bulk import.

**M4: Notifications.** Windows, randomised scheduling, rolling top-up, reconciliation, deep link into a session.

**M5: History and review.** List, FTS5 search, filters, review mode with meta-stems.

**M6: Export and import.** All three formats, the documented CSV README, round-trip tests.

**M7: Polish and ship.** Onboarding, app lock, accessibility pass, design pass, store assets, privacy declarations.

Note for scheduling: if publishing to Google Play from a personal developer account created after November 2023, a closed test with at least 12 continuously opted-in testers for 14 days is required before production access. Start that clock at the end of M4, not at the end of M7.

---

## 13. Constraints the agent must not violate

1. No copyrighted stem text from Branden or any other author.
2. No network, no accounts, no analytics, no telemetry.
3. No AI features: no generated stems, no interpretation of the user's endings, no sentiment scoring shown in the app. Analysis is something the user does with their own exported data, on their own terms.
4. No gamification that shames absence. Streaks, if present at all, are descriptive.
5. No destructive-by-default operations. Archive before delete, soft before hard.
6. No evaluation of the user's writing anywhere in the interface.
7. No stored derived values in the database.
8. Do not change the schema without a migration and a version bump, even in development.

---

## 14. Open questions for the user

Resolve these before M2 rather than guessing:

1. Should a session be resumable across app launches, or is abandonment always final after the 5 minute grace period?
2. Should the same stem be repeatable on demand from the library, outside the weighted rotation? (Recommended: yes.)
3. Is a per-stem note or tag field wanted, or does that invite exactly the reflective editing the exercise is designed to avoid?
4. Should the review period be a fixed 7 days, or user-configurable?
