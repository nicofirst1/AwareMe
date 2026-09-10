import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../../db/migrate';
import { Repository } from '../../db/repository';
import { nodeSqliteExecutor } from '../../db/testSupport/nodeSqliteExecutor';
import { CURRENT_SCHEMA_VERSION } from '../../db/migrations';
import { applyImport } from '../importBundle';
import { buildJsonBundle, ExportBundle, serializeJsonBundle } from '../jsonBundle';

/**
 * Spec §8's explicit test: "export, wipe, import, export again, assert
 * byte-identical JSON modulo the exported_at field." This is the test that
 * proves export and import are true inverses of each other, not just
 * individually plausible.
 */

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  return { db: raw, repo };
}

function exportNow(repo: Repository, exportedAt: string): ExportBundle {
  return buildJsonBundle(repo.dumpAllTables(), {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: '1.0.0',
    exportedAt,
    exportedTz: 'Europe/Berlin',
  });
}

/** Writes a realistic, varied corpus: a user stem, a completed session with two endings (one containing quotes/commas/newlines — the CSV-hostile characters), a soft-deleted stem, a soft-deleted session, and a review. */
function writeRealisticCorpus(repo: Repository): void {
  const stemId = repo.listActiveStems()[0].id;

  const userStemId = repo.addStem({ text: 'A user-written stem, with a comma...', category: 'purpose', origin: 'user' });

  const sessionId = repo.createSession({
    stemId,
    stemTextSnapshot: 'The stem shown at the time',
    origin: 'manual',
    targetEndings: 2,
    timerSeconds: 90,
    uncensoredMode: true,
    startedAt: '2026-09-05T08:00:00.000Z',
    deviceLocale: 'en-US',
  });
  repo.recordFirstKeypress(sessionId, 1, '2026-09-05T08:00:05.000Z');
  repo.autosaveEndingText(sessionId, 1, 'a line with "quotes", a comma, and\na newline', 3, '2026-09-05T08:00:10.000Z');
  repo.submitEnding(sessionId, 1, '2026-09-05T08:00:15.000Z');
  repo.recordFirstKeypress(sessionId, 2, '2026-09-05T08:00:20.000Z');
  repo.autosaveEndingText(sessionId, 2, 'a half-typed second ending', 0, '2026-09-05T08:00:25.000Z');
  repo.finalizeSession(sessionId, 'timeout', '2026-09-05T08:01:30.000Z');

  // A second, soft-deleted session — export must include it, deleted_at intact.
  const deletedSessionId = repo.createSession({
    stemId: userStemId,
    stemTextSnapshot: 'A user-written stem, with a comma...',
    origin: 'manual',
    targetEndings: 1,
    timerSeconds: 90,
    uncensoredMode: false,
    startedAt: '2026-09-06T08:00:00.000Z',
    deviceLocale: 'en-US',
  });
  repo.recordFirstKeypress(deletedSessionId, 1, '2026-09-06T08:00:05.000Z');
  repo.submitEnding(deletedSessionId, 1, '2026-09-06T08:00:10.000Z');
  repo.softDeleteSession(deletedSessionId, '2026-09-07T00:00:00.000Z');

  // A soft-deleted stem.
  const deletedStemId = repo.addStem({ text: 'A stem I later deleted', category: null, origin: 'user' });
  repo.softDeleteStem(deletedStemId, '2026-09-07T01:00:00.000Z');

  // A review.
  repo.createReview({
    periodStart: '2026-09-01T00:00:00.000Z',
    periodEnd: '2026-09-08T00:00:00.000Z',
    sessionIds: [sessionId],
    metaStemText: 'What pattern do you notice...',
    reflectionText: 'A reflection, with punctuation!',
    createdAt: '2026-09-08T09:00:00.000Z',
  });
}

describe('export/import round trip (spec §8, §11)', () => {
  it('export -> wipe -> import (replace) -> export is byte-identical modulo exported_at', () => {
    const { db, repo } = freshRepository();
    writeRealisticCorpus(repo);

    const firstBundle = exportNow(repo, '2026-09-10T14:03:22.418Z');
    const firstJson = serializeJsonBundle(firstBundle);

    // Wipe: replace-mode import of an empty bundle deletes every row of every imported table.
    const executor = nodeSqliteExecutor(db);
    const emptyBundle: ExportBundle = {
      export_version: 1,
      schema_version: CURRENT_SCHEMA_VERSION,
      app_version: '1.0.0',
      exported_at: 'x',
      exported_tz: 'UTC',
      stems: [],
      sessions: [],
      endings: [],
      reviews: [],
      settings: [],
    };
    applyImport(executor, emptyBundle, 'replace');
    expect(repo.listAllStems()).toHaveLength(0);

    // Import the first export back in.
    applyImport(executor, firstBundle, 'replace');
    repo.rebuildEndingsFts();

    const secondBundle = exportNow(repo, '2026-09-11T00:00:00.000Z'); // different exported_at on purpose
    const secondJson = serializeJsonBundle(secondBundle);

    const normalize = (json: string) => json.replace(/"exported_at": "[^"]*"/, '"exported_at": "NORMALIZED"');
    expect(normalize(secondJson)).toBe(normalize(firstJson));

    // Also assert equality field-by-field for a clearer failure message if this ever regresses.
    expect(secondBundle.stems).toEqual(firstBundle.stems);
    expect(secondBundle.sessions).toEqual(firstBundle.sessions);
    expect(secondBundle.endings).toEqual(firstBundle.endings);
    expect(secondBundle.reviews).toEqual(firstBundle.reviews);
    expect(secondBundle.settings).toEqual(firstBundle.settings);
  });

  it('search still works after the round trip (FTS index correctly rebuilt from imported rows)', () => {
    const { db, repo } = freshRepository();
    writeRealisticCorpus(repo);

    const bundle = exportNow(repo, '2026-09-10T00:00:00.000Z');
    const executor = nodeSqliteExecutor(db);
    applyImport(executor, { ...bundle, stems: [], sessions: [], endings: [], reviews: [], settings: [] }, 'replace'); // wipe
    applyImport(executor, bundle, 'replace');
    repo.rebuildEndingsFts();

    expect(repo.searchEndings('half-typed')).toHaveLength(1);
  });

  it('merge mode is idempotent: importing the same export twice does not duplicate rows', () => {
    const { db, repo } = freshRepository();
    writeRealisticCorpus(repo);
    const bundle = exportNow(repo, '2026-09-10T00:00:00.000Z');
    const executor = nodeSqliteExecutor(db);

    const first = applyImport(executor, bundle, 'merge');
    const second = applyImport(executor, bundle, 'merge');

    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(first.inserted + first.skipped);
  });
});
