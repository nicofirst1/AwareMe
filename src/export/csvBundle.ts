/**
 * The CSV set (spec §8.3): one CSV per table (`stems`, `sessions`,
 * `endings`, `reviews`) plus a README documenting every column. Pure —
 * takes the table dump, returns file contents; zipping and README wording
 * live here since both are just string assembly, no I/O.
 */
import { toCsv } from './csv';
import type { TableDump } from './jsonBundle';

export const CSV_TABLES = ['stems', 'sessions', 'endings', 'reviews'] as const;

/** Column order per table, matching the DDL (migrations/0001_initial.ts) exactly — every column, nothing derived or dropped. */
export const COLUMNS: Record<(typeof CSV_TABLES)[number], readonly string[]> = {
  stems: ['id', 'text', 'origin', 'category', 'language', 'weight', 'active', 'created_at', 'created_tz', 'created_offset_min', 'deleted_at', 'time_of_day', 'week_number', 'is_weekly_meta'],
  sessions: [
    'id', 'stem_id', 'stem_text_snapshot', 'origin', 'target_endings', 'timer_seconds', 'uncensored_mode',
    'started_at', 'first_keypress_at', 'ended_at', 'end_reason', 'notification_id', 'notified_at', 'opened_at',
    'last_activity_at', 'tz', 'offset_min', 'device_locale', 'deleted_at',
  ],
  endings: ['id', 'session_id', 'ordinal', 'text', 'started_at', 'submitted_at', 'backspace_count', 'was_revised', 'deleted_at'],
  reviews: ['id', 'period_start', 'period_end', 'session_ids', 'reflection_text', 'meta_stem_text', 'created_at', 'tz', 'offset_min', 'deleted_at'],
};

const README = `# AwareMe export

One CSV file per table, RFC 4180 quoted (fields containing a comma, quote,
or newline are double-quoted; a literal quote is doubled). One header row.
UTF-8, no BOM. User-written text (stem text, ending text) is included
byte-for-byte: never trimmed, normalised, or re-encoded.

Soft-deleted rows are included with \`deleted_at\` set: a row that was
written and later deleted is still data ("written and retracted" is itself
a signal). Nothing in this export is ever hard-deleted.

All timestamps are UTC, ISO-8601, millisecond precision (e.g.
\`2026-09-10T14:03:22.418Z\`). Every user-event row additionally carries the
IANA timezone and UTC offset (minutes east of UTC) captured at the moment
of the event, so local time can be reconstructed without a lookup table
that might not match what the user's device actually observed.

## stems.csv
One row per stem, seed or user-authored.
- \`id\` (text, UUIDv7): primary key.
- \`text\` (text): the stem's wording. Never truncated.
- \`origin\` (text): one of \`seed\`, \`user\`, \`imported\`, \`meta\`. \`meta\` stems are
  used only in review sessions, never in the normal weighted rotation.
- \`category\` (text, nullable): one of \`awareness\`, \`self_acceptance\`,
  \`responsibility\`, \`assertiveness\`, \`purpose\`, \`integrity\`, or null for
  meta-stems.
- \`language\` (text): BCP-47-ish tag, currently always \`en\`.
- \`weight\` (real): relative draw weight used by the weighted selection.
- \`active\` (integer, 0/1): 0 means archived (excluded from the weighted
  draw but still visible in the library and this export).
- \`created_at\` (text, UTC ISO-8601 ms): when the stem was added.
- \`created_tz\` (text, IANA zone): device timezone at creation.
- \`created_offset_min\` (integer, minutes): UTC offset at creation.
- \`deleted_at\` (text, UTC ISO-8601 ms, nullable): set if soft-deleted;
  null otherwise.
- \`time_of_day\` (text, nullable): \`morning\` or \`evening\`; which fixed
  daily notification this stem belongs to. Null for the weekly meta-stem
  and any pre-pivot row never backfilled; the two evening reflection
  meta-stems carry \`evening\` (issue 06).
- \`week_number\` (integer, nullable): the official programme block
  (1-30) this stem belongs to (2026-09-15, ADR-0005). Null for
  non-programme stems.
- \`is_weekly_meta\` (integer, 0/1): 1 for the official weekly reflection
  stem (§5.4 #1), the one the scheduled weekly reflection uses. 0 for
  everything else.

## sessions.csv
One row per writing session (a stem shown once, with one or more endings).
- \`id\` (text, UUIDv7): primary key.
- \`stem_id\` (text): foreign key into \`stems.id\`.
- \`stem_text_snapshot\` (text): the exact stem wording shown at the time
  this session started. Stems are editable; this column is deliberately
  denormalised so a past session's record never shifts if the stem's
  current text later changes.
- \`origin\` (text): how the session started, e.g. \`manual\`, \`notification\`,
  \`review\`.
- \`target_endings\` (integer): how many endings this session asked for.
- \`timer_seconds\` (integer): the per-ending timer length in effect.
- \`uncensored_mode\` (integer, 0/1): whether uncensored writing mode
  (limited backspace, no going back) was on for this session.
- \`started_at\` (text, UTC ISO-8601 ms): when the session began.
- \`first_keypress_at\` (text, UTC ISO-8601 ms, nullable): the first
  keystroke of the session, if any.
- \`ended_at\` (text, UTC ISO-8601 ms, nullable): when the session
  finished; null if it was left open (e.g. app killed mid-session).
- \`end_reason\` (text, nullable): why the session ended, e.g. \`completed\`,
  \`timeout\`, \`abandoned\`.
- \`notification_id\` (text, nullable): the notification row this session
  was opened from, if \`origin = 'notification'\`.
- \`notified_at\` (text, UTC ISO-8601 ms, nullable): when that notification
  fired.
- \`opened_at\` (text, UTC ISO-8601 ms, nullable): when the user opened the
  session from the notification.
- \`last_activity_at\` (text, UTC ISO-8601 ms, nullable): most recent
  autosave or state change, used to detect an abandoned session across a
  cold start.
- \`tz\` (text, IANA zone): device timezone when the session started.
- \`offset_min\` (integer, minutes): UTC offset when the session started.
- \`device_locale\` (text): device locale at the time, e.g. \`en-US\`.
- \`deleted_at\` (text, UTC ISO-8601 ms, nullable): set if the session was
  soft-deleted from history; the row and its endings remain here regardless.

## endings.csv
One row per individual ending written within a session.
- \`id\` (text, UUIDv7): primary key.
- \`session_id\` (text): foreign key into \`sessions.id\`.
- \`ordinal\` (integer): this ending's 1-based position within its session.
- \`text\` (text): the ending as typed, including a half-typed or
  never-submitted ending if the session ended before it was finished.
  Newlines, if any, are preserved inside the CSV quoting. Never trimmed or
  cleaned.
- \`started_at\` (text, UTC ISO-8601 ms): first keystroke into this ending.
- \`submitted_at\` (text, UTC ISO-8601 ms, nullable): when this ending was
  submitted (Next/Done), or when the session ended if it closed the field
  without an explicit submit; null only if never reached.
- \`backspace_count\` (integer): backspaces made while writing this ending,
  counted even when uncensored mode's backspace restriction is off.
- \`was_revised\` (integer, 0/1): reserved; not currently set by the app.
- \`deleted_at\` (text, UTC ISO-8601 ms, nullable): set if soft-deleted.

## reviews.csv
One row per completed weekly-style review.
- \`id\` (text, UUIDv7): primary key.
- \`period_start\` (text, UTC ISO-8601 ms): inclusive start of the period
  reviewed.
- \`period_end\` (text, UTC ISO-8601 ms): exclusive end of the period
  reviewed.
- \`session_ids\` (text, JSON array of session ids): the sessions re-read
  during this review. Does not include the review's own meta-stem session,
  which is a normal \`sessions\` row in its own right (\`origin = 'review'\`).
- \`reflection_text\` (text, nullable): the text written in response to the
  meta-stem during this review, denormalised here for the same reason as
  \`stem_text_snapshot\`.
- \`meta_stem_text\` (text): which meta-stem prompt was used.
- \`created_at\` (text, UTC ISO-8601 ms): when the review was completed.
- \`tz\` (text, IANA zone): device timezone at the time.
- \`offset_min\` (integer, minutes): UTC offset at the time.
- \`deleted_at\` (text, UTC ISO-8601 ms, nullable): set if soft-deleted.
`;

export interface CsvFile {
  name: string;
  content: string;
}

/** Builds `stems.csv`, `sessions.csv`, `endings.csv`, `reviews.csv`, and `README.md` — the exact file set spec §8.3 zips together. */
export function buildCsvFiles(dump: TableDump): CsvFile[] {
  const files = CSV_TABLES.map((table) => ({
    name: `${table}.csv`,
    content: toCsv(COLUMNS[table], dump[table]),
  }));
  files.push({ name: 'README.md', content: README });
  return files;
}
