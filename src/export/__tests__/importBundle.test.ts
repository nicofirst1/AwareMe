import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../db/migrate';
import { Repository } from '../../db/repository';
import { nodeSqliteExecutor } from '../../db/testSupport/nodeSqliteExecutor';
import { applyImport } from '../importBundle';
import { buildJsonBundle, ExportBundle, TableDump } from '../jsonBundle';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  return { db: raw, repo: new Repository(executor) };
}

function bundleFrom(dump: TableDump): ExportBundle {
  return buildJsonBundle(dump, { schemaVersion: 2, appVersion: '1.0.0', exportedAt: '2026-09-10T00:00:00.000Z', exportedTz: 'UTC' });
}

function makeStemRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'stem-1',
    text: 'A stem...',
    origin: 'user',
    category: null,
    language: 'en',
    weight: 1.0,
    active: 1,
    created_at: '2026-09-01T00:00:00.000Z',
    created_tz: 'UTC',
    created_offset_min: 0,
    deleted_at: null,
    time_of_day: null,
    week_number: null,
    is_weekly_meta: 0,
    ...overrides,
  };
}

describe('applyImport — merge', () => {
  it('inserts rows that do not already exist', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);
    const bundle = bundleFrom({
      stems: [makeStemRow()],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
      notification_schedule: [],
      schema_meta: [],
    });

    const result = applyImport(executor, bundle, 'merge');
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);
    const stems = repo.listAllStems();
    expect(stems.some((s) => s.id === 'stem-1')).toBe(true);
  });

  it('skips a row whose primary key already exists, leaving the existing row untouched', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);
    repo.addStem({ text: 'Original text...', category: null, origin: 'user' });
    const existingId = repo.listAllStems()[0].id;

    const bundle = bundleFrom({
      stems: [makeStemRow({ id: existingId, text: 'A DIFFERENT text that should not land...' })],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
      notification_schedule: [],
      schema_meta: [],
    });

    const result = applyImport(executor, bundle, 'merge');
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(1);
    expect(repo.listAllStems().find((s) => s.id === existingId)?.text).toBe('Original text...');
  });

  it('preserves a soft-deleted row exactly, deleted_at intact', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);
    const bundle = bundleFrom({
      stems: [makeStemRow({ deleted_at: '2026-09-05T12:00:00.000Z' })],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
      notification_schedule: [],
      schema_meta: [],
    });

    applyImport(executor, bundle, 'merge');
    const row = repo.listAllStems().find((s) => s.id === 'stem-1');
    expect(row?.deleted_at).toBe('2026-09-05T12:00:00.000Z');
  });
});

describe('applyImport — replace', () => {
  it('deletes existing rows in the imported tables before inserting the bundle', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);
    repo.seedIfEmpty();
    expect(repo.listAllStems().length).toBeGreaterThan(0);

    const bundle = bundleFrom({
      stems: [makeStemRow()],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
      notification_schedule: [],
      schema_meta: [],
    });

    applyImport(executor, bundle, 'replace');
    const stems = repo.listAllStems();
    expect(stems).toHaveLength(1);
    expect(stems[0].id).toBe('stem-1');
  });

  it('does not touch notification_schedule or schema_meta (not part of the bundle)', () => {
    const { db, repo } = freshRepository();
    const executor = nodeSqliteExecutor(db);
    repo.seedIfEmpty();
    repo.insertScheduledNotification({ scheduledFor: '2026-09-11T09:00:00.000Z', stemId: null, osIdentifier: 'x' });

    const bundle = bundleFrom({ stems: [], sessions: [], endings: [], reviews: [], settings: [], notification_schedule: [], schema_meta: [] });
    applyImport(executor, bundle, 'replace');

    expect(repo.listPendingNotifications()).toHaveLength(1);
  });
});
