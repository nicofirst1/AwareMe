/**
 * Migration 0002: FTS5 full-text index over `endings.text` (spec §6.7,
 * ticket 12).
 *
 * `endings_fts` is an external-content FTS5 table (the indexed text stays
 * only in `endings`; the FTS table stores just the inverted index, keyed by
 * `endings.rowid`). Three triggers keep it in sync with every write this
 * app makes to `endings` — insert (first keypress, ADR-0003), update
 * (autosave debounce, submit, finalize, and soft-delete's `deleted_at`
 * flag), and delete (never used by app code — soft-delete only — but
 * included so the index can't silently drift if that ever changes).
 *
 * Soft-deleted endings are NOT removed from the index by a trigger: a
 * plain UPDATE of `deleted_at` still re-indexes the row (its text is
 * unchanged), so the index always mirrors `endings.text` byte for byte.
 * `Repository.searchEndings` filters `deleted_at IS NULL` at query time,
 * the same place every other read in this app excludes soft-deleted rows.
 */
export const MIGRATION_0002_ENDINGS_FTS = `
CREATE VIRTUAL TABLE endings_fts USING fts5(text, content='endings', content_rowid='rowid');

INSERT INTO endings_fts(rowid, text) SELECT rowid, text FROM endings;

CREATE TRIGGER endings_fts_ai AFTER INSERT ON endings BEGIN
  INSERT INTO endings_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER endings_fts_ad AFTER DELETE ON endings BEGIN
  INSERT INTO endings_fts(endings_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;

CREATE TRIGGER endings_fts_au AFTER UPDATE ON endings BEGIN
  INSERT INTO endings_fts(endings_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
  INSERT INTO endings_fts(rowid, text) VALUES (new.rowid, new.text);
END;
`;
