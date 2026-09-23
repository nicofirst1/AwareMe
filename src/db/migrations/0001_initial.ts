/**
 * Migration 0001: initial schema.
 *
 * Tables and indexes per spec.md §4.2, with the two deviations recorded in
 * docs/DECISIONS.md / docs/adr/0003-endings-row-created-on-first-keypress.md:
 *   - `endings.submitted_at` is nullable (an ending begun but not yet
 *     submitted has no submit time).
 *   - `sessions.last_activity_at` is a new column, bumped on autosave, so
 *     absence can be measured across a cold start (ADR-0001).
 */
export const MIGRATION_0001_INITIAL = `
CREATE TABLE schema_meta (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  schema_version    INTEGER NOT NULL,
  app_version       TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE stems (
  id                TEXT PRIMARY KEY,
  text              TEXT NOT NULL,
  origin            TEXT NOT NULL,
  category          TEXT,
  language          TEXT NOT NULL DEFAULT 'en',
  weight            REAL NOT NULL DEFAULT 1.0,
  active            INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  created_tz        TEXT NOT NULL,
  created_offset_min INTEGER NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE sessions (
  id                TEXT PRIMARY KEY,
  stem_id           TEXT NOT NULL REFERENCES stems(id),
  stem_text_snapshot TEXT NOT NULL,
  origin            TEXT NOT NULL,
  target_endings    INTEGER NOT NULL,
  timer_seconds     INTEGER NOT NULL,
  uncensored_mode   INTEGER NOT NULL,
  started_at        TEXT NOT NULL,
  first_keypress_at TEXT,
  ended_at          TEXT,
  end_reason        TEXT,
  notification_id   TEXT,
  notified_at       TEXT,
  opened_at         TEXT,
  last_activity_at  TEXT,
  tz                TEXT NOT NULL,
  offset_min        INTEGER NOT NULL,
  device_locale     TEXT NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE endings (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id),
  ordinal           INTEGER NOT NULL,
  text              TEXT NOT NULL,
  started_at        TEXT NOT NULL,
  submitted_at      TEXT,
  backspace_count   INTEGER NOT NULL DEFAULT 0,
  was_revised       INTEGER NOT NULL DEFAULT 0,
  deleted_at        TEXT,
  UNIQUE (session_id, ordinal)
);

CREATE TABLE reviews (
  id                TEXT PRIMARY KEY,
  period_start      TEXT NOT NULL,
  period_end        TEXT NOT NULL,
  session_ids       TEXT NOT NULL,
  reflection_text   TEXT,
  meta_stem_text    TEXT NOT NULL,
  created_at        TEXT NOT NULL,
  tz                TEXT NOT NULL,
  offset_min        INTEGER NOT NULL,
  deleted_at        TEXT
);

CREATE TABLE settings (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE notification_schedule (
  id                TEXT PRIMARY KEY,
  scheduled_for     TEXT NOT NULL,
  stem_id           TEXT REFERENCES stems(id),
  os_identifier     TEXT,
  state             TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE INDEX idx_sessions_started_at ON sessions(started_at);
CREATE INDEX idx_sessions_stem_id ON sessions(stem_id);
CREATE INDEX idx_endings_session_id ON endings(session_id);
CREATE INDEX idx_stems_active_deleted ON stems(active, deleted_at);
`;
