import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DATABASE_NAME, LEGACY_DATABASE_NAME, moveLegacyDatabaseFile } from '../legacyDatabaseFile';

/** Node fs adapter — the same surface database.ts wires to expo-file-system on device. */
const io = {
  exists: (path: string) => fs.existsSync(path),
  move: (from: string, to: string) => fs.renameSync(from, to),
};

function sqliteDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awareme-db-move-'));
}

describe('moveLegacyDatabaseFile (issue 02 — DB filename rename)', () => {
  it('moves the legacy database to the new name, carrying its journal companions', () => {
    const dir = sqliteDir();
    const legacyData = 'legacy rows';
    fs.writeFileSync(path.join(dir, LEGACY_DATABASE_NAME), legacyData);
    fs.writeFileSync(path.join(dir, LEGACY_DATABASE_NAME + '-wal'), 'wal-bytes');
    fs.writeFileSync(path.join(dir, LEGACY_DATABASE_NAME + '-shm'), 'shm-bytes');

    const moved = moveLegacyDatabaseFile(dir, io);

    expect(moved).toBe(true);
    expect(fs.readFileSync(path.join(dir, DATABASE_NAME), 'utf8')).toBe(legacyData);
    expect(fs.existsSync(path.join(dir, LEGACY_DATABASE_NAME))).toBe(false);
    expect(fs.readFileSync(path.join(dir, DATABASE_NAME + '-wal'), 'utf8')).toBe('wal-bytes');
    expect(fs.readFileSync(path.join(dir, DATABASE_NAME + '-shm'), 'utf8')).toBe('shm-bytes');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is a no-op on a fresh install: no legacy file, nothing to move, nothing created', () => {
    const dir = sqliteDir();

    const moved = moveLegacyDatabaseFile(dir, io);

    expect(moved).toBe(false);
    expect(fs.existsSync(path.join(dir, DATABASE_NAME))).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('never touches an existing current database: a second open keeps it and leaves the legacy file alone', () => {
    const dir = sqliteDir();
    const currentData = 'current data';
    fs.writeFileSync(path.join(dir, DATABASE_NAME), currentData);
    fs.writeFileSync(path.join(dir, LEGACY_DATABASE_NAME), 'legacy data');

    const moved = moveLegacyDatabaseFile(dir, io);

    expect(moved).toBe(false);
    expect(fs.readFileSync(path.join(dir, DATABASE_NAME), 'utf8')).toBe(currentData);
    expect(fs.existsSync(path.join(dir, LEGACY_DATABASE_NAME))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
