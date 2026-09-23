import { DatabaseSync } from 'node:sqlite';

import { migrate } from '../migrate';
import { Repository } from '../repository';
import { nodeSqliteExecutor } from '../testSupport/nodeSqliteExecutor';

function freshRepository(): { db: DatabaseSync; repo: Repository } {
  const raw = new DatabaseSync(':memory:');
  const executor = nodeSqliteExecutor(raw);
  migrate(executor, '1.0.0');
  const repo = new Repository(executor);
  repo.seedIfEmpty();
  return { db: raw, repo };
}

// w1-t7 (s1-F7): the dead active-stem read is deleted (zero production
// callers). Fixture reads derive the same set from listAllStems.
function activeStems(repo: Repository) {
  return repo.listAllStems().filter((s) => s.active !== 0 && s.deleted_at === null);
}

function firstStemId(repo: Repository): string {
  return activeStems(repo)[0].id;
}

describe('Repository.insertScheduledNotification / listPendingNotifications', () => {
  it('records a pending row with a UUIDv7 id and the given stem/os identifier', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);

    const id = repo.insertScheduledNotification({
      scheduledFor: '2026-09-15T08:00:00.000Z',
      stemId,
      osIdentifier: 'os-123',
    });

    const pending = repo.listPendingNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(id);
    expect(pending[0].stem_id).toBe(stemId);
    expect(pending[0].os_identifier).toBe('os-123');
    expect(pending[0].state).toBe('pending');
    expect(pending[0].scheduled_for).toBe('2026-09-15T08:00:00.000Z');
  });

  it('allows a null stem_id (chosen later, if a caller ever needs that)', () => {
    const { repo } = freshRepository();
    repo.insertScheduledNotification({ scheduledFor: '2026-09-15T08:00:00.000Z', stemId: null, osIdentifier: 'os-1' });
    expect(repo.listPendingNotifications()[0].stem_id).toBeNull();
  });

  it('orders pending rows by scheduled_for', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    repo.insertScheduledNotification({ scheduledFor: '2026-09-16T08:00:00.000Z', stemId, osIdentifier: 'b' });
    repo.insertScheduledNotification({ scheduledFor: '2026-09-15T08:00:00.000Z', stemId, osIdentifier: 'a' });

    const pending = repo.listPendingNotifications();
    expect(pending.map((p) => p.os_identifier)).toEqual(['a', 'b']);
  });
});

describe('Repository.cancelPendingNotifications', () => {
  it('flips state to cancelled without deleting the row (append-only/soft-delete, §4.1.5)', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const id = repo.insertScheduledNotification({ scheduledFor: '2026-09-15T08:00:00.000Z', stemId, osIdentifier: 'a' });

    repo.cancelPendingNotifications([id]);

    expect(repo.listPendingNotifications()).toHaveLength(0);
    const row = db.prepare('SELECT state FROM notification_schedule WHERE id = ?').get(id) as { state: string };
    expect(row.state).toBe('cancelled');
  });

  it('is a no-op for an empty id list', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    repo.insertScheduledNotification({ scheduledFor: '2026-09-15T08:00:00.000Z', stemId, osIdentifier: 'a' });
    expect(() => repo.cancelPendingNotifications([])).not.toThrow();
    expect(repo.listPendingNotifications()).toHaveLength(1);
  });
});

describe('Repository.markPastPendingAsFired', () => {
  it('relabels only pending rows whose scheduled_for has passed', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    const pastId = repo.insertScheduledNotification({
      scheduledFor: '2026-09-01T08:00:00.000Z',
      stemId,
      osIdentifier: 'past',
    });
    const futureId = repo.insertScheduledNotification({
      scheduledFor: '2026-09-20T08:00:00.000Z',
      stemId,
      osIdentifier: 'future',
    });

    repo.markPastPendingAsFired('2026-09-10T00:00:00.000Z');

    const pending = repo.listPendingNotifications();
    expect(pending.map((p) => p.id)).toEqual([futureId]);
    expect(pending.map((p) => p.id)).not.toContain(pastId);
  });
});

describe('Repository.getNotificationByOsIdentifier', () => {
  it('finds the row by its expo-notifications identifier', () => {
    const { repo } = freshRepository();
    const stemId = firstStemId(repo);
    repo.insertScheduledNotification({ scheduledFor: '2026-09-15T08:00:00.000Z', stemId, osIdentifier: 'find-me' });

    const found = repo.getNotificationByOsIdentifier('find-me');
    expect(found?.stem_id).toBe(stemId);
  });

  it('returns null when no row matches', () => {
    const { repo } = freshRepository();
    expect(repo.getNotificationByOsIdentifier('missing')).toBeNull();
  });
});

describe('Repository.createSession with notification linkage', () => {
  it('stores notification_id/notified_at/opened_at when starting from a notification', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);
    const notificationRowId = repo.insertScheduledNotification({
      scheduledFor: '2026-09-15T08:00:00.000Z',
      stemId,
      osIdentifier: 'a',
    });

    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'text',
      origin: 'notification',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-15T08:05:00.000Z',
      deviceLocale: 'en-US',
      notificationId: notificationRowId,
      notifiedAt: '2026-09-15T08:00:00.000Z',
    });

    const row = db.prepare('SELECT notification_id, notified_at, opened_at FROM sessions WHERE id = ?').get(sessionId) as {
      notification_id: string | null;
      notified_at: string | null;
      opened_at: string | null;
    };
    expect(row.notification_id).toBe(notificationRowId);
    expect(row.notified_at).toBe('2026-09-15T08:00:00.000Z');
    expect(row.opened_at).toBe('2026-09-15T08:05:00.000Z');
  });

  it('leaves notification linkage null for a manual session', () => {
    const { db, repo } = freshRepository();
    const stemId = firstStemId(repo);

    const sessionId = repo.createSession({
      stemId,
      stemTextSnapshot: 'text',
      origin: 'manual',
      targetEndings: 6,
      timerSeconds: 90,
      uncensoredMode: true,
      startedAt: '2026-09-15T08:05:00.000Z',
      deviceLocale: 'en-US',
    });

    const row = db.prepare('SELECT notification_id, notified_at, opened_at FROM sessions WHERE id = ?').get(sessionId) as {
      notification_id: string | null;
      notified_at: string | null;
      opened_at: string | null;
    };
    expect(row.notification_id).toBeNull();
    expect(row.notified_at).toBeNull();
    expect(row.opened_at).toBeNull();
  });
});
