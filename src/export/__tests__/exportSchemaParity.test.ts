/**
 * Export-schema parity guard (added in the c01 review round, finding F3).
 *
 * The column lists in `importBundle.ts` (JSON import) and `csvBundle.ts`
 * (stems/sessions/endings/reviews.csv) carry comments claiming they match
 * the schema DDL "exactly — every column, nothing derived or dropped".
 * Nothing enforced that claim: migration 0004 added `week_number` and
 * `is_weekly_meta` to `stems`, the CSV list silently missed them, and
 * those two columns never reached `stems.csv` — a §8 losslessness hole
 * that the JSON-only round-trip test could not see. This test derives the
 * truth from the migrated schema itself (`PRAGMA table_info`) and fails
 * the moment an export projection drifts from the DDL in either
 * direction: a schema column missing from a list, or a list entry that no
 * longer exists.
 *
 * Set equality, not order: §8 requires presence and fidelity, and both
 * files' historical column orders predate the DDL's. Import binds by name
 * (explicit column list), CSV by header — order is presentational.
 */
import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../db/migrate';
import type { TableName } from '../../db/repository';
import { nodeSqliteExecutor } from '../../db/testSupport/nodeSqliteExecutor';
import { buildCsvFiles, COLUMNS as CSV_COLUMNS, CSV_TABLES } from '../csvBundle';
import { COLUMNS as IMPORT_COLUMNS, IMPORT_TABLES } from '../importBundle';
import type { TableDump } from '../jsonBundle';

function ddlColumns(db: DatabaseSync, table: string): string[] {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
}

function schema(): DatabaseSync {
  const raw = new DatabaseSync(':memory:');
  migrate(nodeSqliteExecutor(raw), '1.0.0');
  return raw;
}

function emptyDump(): TableDump {
  const dump = {} as TableDump;
  for (const table of ['stems', 'sessions', 'endings', 'reviews', 'settings', 'notification_schedule', 'schema_meta'] as TableName[]) {
    dump[table] = [];
  }
  return dump;
}

describe('export column lists match the migrated DDL exactly (spec §8)', () => {
  it.each([...IMPORT_TABLES])('importBundle COLUMNS.%s covers every schema column and nothing else', (table) => {
    const db = schema();
    expect([...IMPORT_COLUMNS[table]].sort()).toEqual(ddlColumns(db, table).sort());
    db.close();
  });

  it.each([...CSV_TABLES])('csvBundle COLUMNS.%s covers every schema column and nothing else', (table) => {
    const db = schema();
    expect([...CSV_COLUMNS[table]].sort()).toEqual(ddlColumns(db, table).sort());
    db.close();
  });

  it('the CSV projection emits the listed header and carries the new columns\' data', () => {
    const dump = emptyDump();
    dump.stems = [{ id: 's1', week_number: 3, is_weekly_meta: 0 }];
    const stemsCsv = buildCsvFiles(dump).find((f) => f.name === 'stems.csv');
    expect(stemsCsv).toBeDefined();
    const lines = stemsCsv!.content.split('\r\n');
    expect(lines[0].split(',')).toEqual([...CSV_COLUMNS.stems]);
    // 14 columns, only id + the two migration-0004 columns populated —
    // exactly the fields the original F1 bug dropped.
    expect(lines[1]).toBe('s1,,,,,,,,,,,,3,0');
  });
});
