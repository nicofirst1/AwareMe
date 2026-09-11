import { computeProgressStats, computeStreaks } from '../progressStats';
import type { BadgeSession } from '../badges';

function session(overrides: Partial<BadgeSession> = {}): BadgeSession {
  return {
    id: 's1',
    stemId: 'stem-1',
    category: 'awareness',
    origin: 'manual',
    targetEndings: 6,
    uncensoredMode: false,
    startedAt: '2026-09-10T09:00:00.000Z',
    endedAt: '2026-09-10T09:10:00.000Z',
    endReason: 'user_done',
    tz: 'Europe/Berlin',
    offsetMin: 0,
    endings: [{ text: 'a' }, { text: 'b' }, { text: 'c' }],
    ...overrides,
  };
}

describe('computeProgressStats: empty history', () => {
  it('returns all zeros', () => {
    const stats = computeProgressStats([], '2026-09-10T12:00:00.000Z', 0);
    expect(stats).toEqual({
      totalSessions: 0,
      totalEndings: 0,
      distinctStemsUsed: 0,
      longestStreak: 0,
      currentStreak: 0,
    });
  });
});

describe('computeProgressStats: totals', () => {
  it('counts sessions, endings, and distinct stems', () => {
    const sessions = [
      session({ id: 'a', stemId: 'stem-1', endings: [{ text: 'x' }, { text: 'y' }] }),
      session({ id: 'b', stemId: 'stem-1', endings: [{ text: 'x' }] }),
      session({ id: 'c', stemId: 'stem-2', endings: [{ text: 'x' }, { text: 'y' }, { text: 'z' }] }),
    ];
    const stats = computeProgressStats(sessions, '2026-09-10T12:00:00.000Z', 0);
    expect(stats.totalSessions).toBe(3);
    expect(stats.totalEndings).toBe(6);
    expect(stats.distinctStemsUsed).toBe(2);
  });
});

describe('computeStreaks: longest streak', () => {
  it('is 0 for no sessions', () => {
    expect(computeStreaks([], '2026-09-10T12:00:00.000Z', 0).longest).toBe(0);
  });

  it('is 1 for a single day, even with multiple sessions that day', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-05T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-05T20:00:00.000Z', offsetMin: 0 }),
    ];
    expect(computeStreaks(sessions, '2026-09-10T12:00:00.000Z', 0).longest).toBe(1);
  });

  it('breaks on a gap day', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-01T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-02T08:00:00.000Z', offsetMin: 0 }),
      // gap: 09-03 missing
      session({ id: 'c', startedAt: '2026-09-04T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'd', startedAt: '2026-09-05T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'e', startedAt: '2026-09-06T08:00:00.000Z', offsetMin: 0 }),
    ];
    expect(computeStreaks(sessions, '2026-09-10T12:00:00.000Z', 0).longest).toBe(3);
  });

  it('picks the longest of several runs, not the most recent', () => {
    const days = [1, 2, 3, 4, 5, 8, 9]; // a 5-day run, then a 2-day run
    const sessions = days.map((d) => session({ id: `s${d}`, startedAt: `2026-09-${String(d).padStart(2, '0')}T08:00:00.000Z`, offsetMin: 0 }));
    expect(computeStreaks(sessions, '2026-09-10T12:00:00.000Z', 0).longest).toBe(5);
  });
});

describe('computeStreaks: current streak', () => {
  it('is 0 with no sessions', () => {
    expect(computeStreaks([], '2026-09-10T12:00:00.000Z', 0).current).toBe(0);
  });

  it('counts a run ending today', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-08T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-09T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'c', startedAt: '2026-09-10T08:00:00.000Z', offsetMin: 0 }),
    ];
    expect(computeStreaks(sessions, '2026-09-10T20:00:00.000Z', 0).current).toBe(3);
  });

  it('still counts the streak as current when the most recent session was yesterday (a day off does not zero it immediately)', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-08T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-09T08:00:00.000Z', offsetMin: 0 }),
    ];
    expect(computeStreaks(sessions, '2026-09-10T20:00:00.000Z', 0).current).toBe(2);
  });

  it('is 0 once two or more days have been missed', () => {
    const sessions = [session({ id: 'a', startedAt: '2026-09-05T08:00:00.000Z', offsetMin: 0 })];
    expect(computeStreaks(sessions, '2026-09-10T20:00:00.000Z', 0).current).toBe(0);
  });

  it('same-day multiple sessions do not inflate the streak', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-10T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-10T09:00:00.000Z', offsetMin: 0 }),
      session({ id: 'c', startedAt: '2026-09-10T10:00:00.000Z', offsetMin: 0 }),
    ];
    expect(computeStreaks(sessions, '2026-09-10T20:00:00.000Z', 0).current).toBe(1);
  });

  it('timezone crossing: a late-night session in a positive-offset zone counts toward the correct local "today"', () => {
    // Session recorded at 2026-09-09T22:00:00Z with offset +180 (UTC+3) is
    // 2026-09-10T01:00 local — i.e. local "today" relative to `now` below.
    const sessions = [session({ id: 'a', startedAt: '2026-09-09T22:00:00.000Z', offsetMin: 180 })];
    // "now" is evaluated in the same +180 zone, late on 2026-09-10 local.
    const now = '2026-09-10T20:00:00.000Z'; // 2026-09-10T23:00 local at +180
    expect(computeStreaks(sessions, now, 180).current).toBe(1);
  });

  it('timezone crossing: the same UTC instant is "yesterday" from a zone-naive UTC-date reading but "today" using the recorded offset', () => {
    // 2026-09-10T23:30:00Z, offset +600 (UTC+10) -> local 2026-09-11T09:30.
    const sessions = [session({ id: 'a', startedAt: '2026-09-10T23:30:00.000Z', offsetMin: 600 })];
    // "now" in the same +600 zone: 2026-09-11T10:00Z UTC + 600 -> local 2026-09-11T20:00.
    const now = '2026-09-11T10:00:00.000Z';
    expect(computeStreaks(sessions, now, 600).current).toBe(1);
  });
});
