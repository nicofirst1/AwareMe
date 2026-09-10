/**
 * Thin glue: reads a user-picked JSON export bundle from disk and restores
 * it (ticket 15). Business logic — validation, merge/replace — lives in
 * `jsonBundle.ts`/`importBundle.ts`; this only touches the file system and
 * rebuilds the FTS index afterwards, the one side effect `applyImport`
 * deliberately leaves to its caller (see `Repository.rebuildEndingsFts`'s
 * own doc comment).
 */
import { File } from 'expo-file-system';
import { SQLiteDatabase } from 'expo-sqlite';

import { Repository } from '../db/repository';
import { applyImport, ImportMode, ImportResult } from './importBundle';
import { parseJsonBundle } from './jsonBundle';

/** Opens the system file picker for a `.json` bundle, restores it into `db`, and rebuilds the search index. Returns null if the user cancels. */
export async function pickAndImportBundle(db: SQLiteDatabase, mode: ImportMode): Promise<ImportResult | null> {
  const result = await File.pickFileAsync({ mimeTypes: 'application/json' });
  if (result.canceled) return null;

  const raw = await result.result.text();
  const bundle = parseJsonBundle(raw);

  const importResult = applyImport(db, bundle, mode);
  new Repository(db).rebuildEndingsFts();
  return importResult;
}
