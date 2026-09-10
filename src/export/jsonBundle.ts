/**
 * The JSON export bundle (spec §8.2): a single UTF-8 JSON file with rows
 * exported as-is, soft-deleted rows included with `deleted_at` intact.
 * Pure — takes the already-read table dump (`Repository.dumpAllTables()`
 * shape), no file system or DB access here.
 */
import { CURRENT_SCHEMA_VERSION } from '../db/migrations';
import type { TableName } from '../db/repository';

export const EXPORT_VERSION = 1;

/** Row shape is intentionally untyped: export must be lossless of whatever columns exist (§8), not re-derive the app's row types and risk drifting from them. */
export type TableDump = Record<TableName, Record<string, unknown>[]>;

export interface ExportBundle {
  export_version: number;
  schema_version: number;
  app_version: string;
  exported_at: string;
  exported_tz: string;
  stems: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  endings: Record<string, unknown>[];
  reviews: Record<string, unknown>[];
  settings: Record<string, unknown>[];
}

export interface ExportMeta {
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  exportedTz: string;
}

/**
 * Builds the JSON bundle. Only `stems`, `sessions`, `endings`, `reviews`,
 * `settings` are included, matching spec §8.2's example verbatim —
 * `notification_schedule` and `schema_meta` are operational bookkeeping, not
 * part of the user's corpus, and neither appears in the spec's JSON shape or
 * the ticket's CSV set.
 */
export function buildJsonBundle(dump: TableDump, meta: ExportMeta): ExportBundle {
  return {
    export_version: EXPORT_VERSION,
    schema_version: meta.schemaVersion,
    app_version: meta.appVersion,
    exported_at: meta.exportedAt,
    exported_tz: meta.exportedTz,
    stems: dump.stems,
    sessions: dump.sessions,
    endings: dump.endings,
    reviews: dump.reviews,
    settings: dump.settings,
  };
}

export function serializeJsonBundle(bundle: ExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

const BUNDLE_TABLES: readonly (keyof ExportBundle & TableName)[] = ['stems', 'sessions', 'endings', 'reviews', 'settings'];

/** Throws with a human-readable message if `raw` isn't a well-formed export bundle. */
export function parseJsonBundle(raw: string): ExportBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('Not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Not a valid export bundle: expected a JSON object.');
  }
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.schema_version !== 'number') {
    throw new Error('Not a valid export bundle: missing schema_version.');
  }
  if (obj.schema_version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `This backup is from a newer app version (schema ${obj.schema_version}) than this app supports (${CURRENT_SCHEMA_VERSION}).`,
    );
  }
  for (const table of BUNDLE_TABLES) {
    if (!Array.isArray(obj[table])) {
      throw new Error(`Not a valid export bundle: missing or malformed "${table}".`);
    }
  }

  return obj as unknown as ExportBundle;
}
