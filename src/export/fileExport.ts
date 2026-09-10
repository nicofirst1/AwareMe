/**
 * Thin glue: turns the pure builders (`jsonBundle.ts`, `csvBundle.ts`,
 * `zip.ts`) into real files and hands them to the system share sheet
 * (spec §8). Deliberately free of business logic — every decision about
 * what goes in an export lives in the pure modules above, tested without
 * touching the file system.
 */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { SQLiteDatabase } from 'expo-sqlite';

import { getRepository } from '../db';
import { CURRENT_SCHEMA_VERSION } from '../db/migrations';
import { nowEventTime } from '../db/time';
import { buildCsvFiles } from './csvBundle';
import { buildJsonBundle, serializeJsonBundle } from './jsonBundle';
import { buildZip } from './zip';

// package.json's "version" field; kept as a literal for the same reason database.ts's APP_VERSION is (reading package.json at runtime is unnecessary indirection for one string).
const APP_VERSION = '1.0.0';

export type ExportFormat = 'sqlite' | 'json' | 'csv';

function exportDir(): Directory {
  const dir = new Directory(Paths.cache, 'exports');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

function timestampForFilename(at: string): string {
  return at.replace(/[:.]/g, '-');
}

/**
 * VACUUMs and integrity-checks the live database, then writes a raw copy —
 * the "highest-fidelity option" (§8.1). `serializeSync` returns the exact
 * on-disk bytes, so the copy is a real SQLite file another tool can open
 * directly, not a re-derived approximation.
 */
function writeSqliteExport(db: SQLiteDatabase, at: string): File {
  const integrity = db.getFirstSync<{ integrity_check: string }>('PRAGMA integrity_check');
  if (integrity?.integrity_check !== 'ok') {
    throw new Error(`Database integrity check failed: ${integrity?.integrity_check ?? 'unknown'}`);
  }
  db.execSync('VACUUM');

  const bytes = db.serializeSync();
  const file = new File(exportDir(), `six-endings-${timestampForFilename(at)}.db`);
  file.create({ overwrite: true });
  file.write(bytes);
  return file;
}

function writeJsonExport(at: string, tz: string): File {
  const repo = getRepository();
  const dump = repo.dumpAllTables();
  const bundle = buildJsonBundle(dump, { schemaVersion: CURRENT_SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: at, exportedTz: tz });
  const file = new File(exportDir(), `six-endings-${timestampForFilename(at)}.json`);
  file.create({ overwrite: true });
  file.write(serializeJsonBundle(bundle));
  return file;
}

function writeCsvExport(at: string): File {
  const repo = getRepository();
  const dump = repo.dumpAllTables();
  const csvFiles = buildCsvFiles(dump);
  const zipBytes = buildZip(csvFiles, new Date(at));
  const file = new File(exportDir(), `six-endings-${timestampForFilename(at)}.zip`);
  file.create({ overwrite: true });
  file.write(zipBytes);
  return file;
}

/**
 * Builds the export file for `format` and hands it to the system share
 * sheet. This is the one function the export screen calls.
 */
export async function exportAndShare(db: SQLiteDatabase, format: ExportFormat): Promise<void> {
  const { at, tz } = nowEventTime();

  const file = format === 'sqlite' ? writeSqliteExport(db, at) : format === 'json' ? writeJsonExport(at, tz) : writeCsvExport(at);

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri);
}
