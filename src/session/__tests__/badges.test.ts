import { BADGES, computeEarnedBadgeIds, computeNewlyEarnedBadgeIds, type BadgeHistory, type BadgeSession } from '../badges';

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
    endings: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }, { text: 'f' }],
    ...overrides,
  };
}

function history(overrides: Partial<BadgeHistory> = {}): BadgeHistory {
  return { sessions: [], hasReview: false, hasUserStem: false, ...overrides };
}

describe('BADGES catalog', () => {
  it('has exactly 11 badges, per the proposal', () => {
    expect(BADGES).toHaveLength(11);
  });

  it('has unique ids', () => {
    const ids = new Set(BADGES.map((b) => b.id));
    expect(ids.size).toBe(BADGES.length);
  });
});

describe('computeEarnedBadgeIds: empty history', () => {
  it('earns nothing from zero sessions', () => {
    expect(computeEarnedBadgeIds(history())).toEqual(new Set());
  });
});

describe('first_words', () => {
  it('not earned with zero sessions', () => {
    expect(computeEarnedBadgeIds(history()).has('first_words')).toBe(false);
  });

  it('earned on the first completed session', () => {
    expect(computeEarnedBadgeIds(history({ sessions: [session()] })).has('first_words')).toBe(true);
  });
});

describe('six_endings', () => {
  it('just under: fewer submitted endings than target does not earn it', () => {
    const s = session({ targetEndings: 6, endings: [{ text: 'a' }, { text: 'b' }] });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('six_endings')).toBe(false);
  });

  it('just earned: endings reach target', () => {
    const s = session({ targetEndings: 6, endings: Array.from({ length: 6 }, (_, i) => ({ text: `e${i}` })) });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('six_endings')).toBe(true);
  });

  it('earned when endings exceed a lower target', () => {
    const s = session({ targetEndings: 3, endings: Array.from({ length: 6 }, (_, i) => ({ text: `e${i}` })) });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('six_endings')).toBe(true);
  });
});

describe('week_of_mornings', () => {
  function daySessions(count: number): BadgeSession[] {
    return Array.from({ length: count }, (_, i) =>
      session({ id: `s${i}`, startedAt: `2026-09-${String(1 + i).padStart(2, '0')}T09:00:00.000Z`, offsetMin: 0 }),
    );
  }

  it('just under: 6 distinct days does not earn it', () => {
    expect(computeEarnedBadgeIds(history({ sessions: daySessions(6) })).has('week_of_mornings')).toBe(false);
  });

  it('just earned: 7 distinct days', () => {
    expect(computeEarnedBadgeIds(history({ sessions: daySessions(7) })).has('week_of_mornings')).toBe(true);
  });

  it('multiple sessions on the same day count once', () => {
    const sessions = [
      session({ id: 'a', startedAt: '2026-09-01T08:00:00.000Z', offsetMin: 0 }),
      session({ id: 'b', startedAt: '2026-09-01T20:00:00.000Z', offsetMin: 0 }),
      ...daySessions(6).slice(1), // days 2..6, total distinct days = 6
    ];
    expect(computeEarnedBadgeIds(history({ sessions })).has('week_of_mornings')).toBe(false);
  });
});

describe('every_corner', () => {
  const categories = ['awareness', 'self_acceptance', 'responsibility', 'assertiveness', 'purpose', 'integrity'];

  it('just under: 5 of 6 categories does not earn it', () => {
    const sessions = categories.slice(0, 5).map((c, i) => session({ id: `s${i}`, category: c }));
    expect(computeEarnedBadgeIds(history({ sessions })).has('every_corner')).toBe(false);
  });

  it('just earned: all 6 categories, order/repeat-agnostic', () => {
    const sessions = [...categories, categories[0]].map((c, i) => session({ id: `s${i}`, category: c }));
    expect(computeEarnedBadgeIds(history({ sessions })).has('every_corner')).toBe(true);
  });

  it('sessions with a null category (deleted/edited stem) never satisfy a slot', () => {
    const sessions = categories.slice(0, 5).map((c, i) => session({ id: `s${i}`, category: c }));
    sessions.push(session({ id: 's5', category: null }));
    expect(computeEarnedBadgeIds(history({ sessions })).has('every_corner')).toBe(false);
  });
});

describe('fifty_endings / two_hundred_endings', () => {
  function sessionsWithEndings(totalEndings: number): BadgeSession[] {
    const out: BadgeSession[] = [];
    let remaining = totalEndings;
    let i = 0;
    while (remaining > 0) {
      const n = Math.min(6, remaining);
      out.push(session({ id: `s${i}`, endings: Array.from({ length: n }, (_, j) => ({ text: `e${j}` })) }));
      remaining -= n;
      i++;
    }
    return out;
  }

  it('49 endings does not earn fifty_endings', () => {
    expect(computeEarnedBadgeIds(history({ sessions: sessionsWithEndings(49) })).has('fifty_endings')).toBe(false);
  });

  it('50 endings earns fifty_endings', () => {
    expect(computeEarnedBadgeIds(history({ sessions: sessionsWithEndings(50) })).has('fifty_endings')).toBe(true);
  });

  it('199 endings does not earn two_hundred_endings', () => {
    expect(computeEarnedBadgeIds(history({ sessions: sessionsWithEndings(199) })).has('two_hundred_endings')).toBe(false);
  });

  it('200 endings earns two_hundred_endings (and fifty_endings too)', () => {
    const earned = computeEarnedBadgeIds(history({ sessions: sessionsWithEndings(200) }));
    expect(earned.has('two_hundred_endings')).toBe(true);
    expect(earned.has('fifty_endings')).toBe(true);
  });
});

describe('long_way_round', () => {
  it('not earned: timeout but a field left empty', () => {
    const s = session({
      endReason: 'timeout',
      targetEndings: 6,
      endings: [{ text: 'a' }, { text: 'b' }, { text: 'c' }, { text: 'd' }, { text: 'e' }, { text: '' }],
    });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('long_way_round')).toBe(false);
  });

  it('not earned: every field filled but ended by user_done, not timeout', () => {
    const s = session({ endReason: 'user_done' });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('long_way_round')).toBe(false);
  });

  it('not earned: timeout cut the session short of target_endings', () => {
    const s = session({ endReason: 'timeout', targetEndings: 6, endings: [{ text: 'a' }, { text: 'b' }] });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('long_way_round')).toBe(false);
  });

  it('earned: timeout, every field filled up to target', () => {
    const s = session({ endReason: 'timeout', targetEndings: 6 });
    expect(computeEarnedBadgeIds(history({ sessions: [s] })).has('long_way_round')).toBe(true);
  });
});

describe('uncensored', () => {
  function uncensoredSessions(count: number): BadgeSession[] {
    return Array.from({ length: count }, (_, i) => session({ id: `s${i}`, uncensoredMode: true }));
  }

  it('just under: 24 uncensored sessions does not earn it', () => {
    expect(computeEarnedBadgeIds(history({ sessions: uncensoredSessions(24) })).has('uncensored')).toBe(false);
  });

  it('just earned: 25 uncensored sessions', () => {
    expect(computeEarnedBadgeIds(history({ sessions: uncensoredSessions(25) })).has('uncensored')).toBe(true);
  });

  it('non-uncensored sessions do not count toward the total', () => {
    const sessions = [...uncensoredSessions(24), session({ id: 'plain', uncensoredMode: false })];
    expect(computeEarnedBadgeIds(history({ sessions })).has('uncensored')).toBe(false);
  });
});

describe('looking_back', () => {
  it('not earned without a review', () => {
    expect(computeEarnedBadgeIds(history({ hasReview: false })).has('looking_back')).toBe(false);
  });

  it('earned once a review exists', () => {
    expect(computeEarnedBadgeIds(history({ hasReview: true })).has('looking_back')).toBe(true);
  });
});

describe('stem_of_your_own', () => {
  it('not earned without a user-origin stem', () => {
    expect(computeEarnedBadgeIds(history({ hasUserStem: false })).has('stem_of_your_own')).toBe(false);
  });

  it('earned once a user-origin stem exists', () => {
    expect(computeEarnedBadgeIds(history({ hasUserStem: true })).has('stem_of_your_own')).toBe(true);
  });
});

describe('seven_day_rhythm (consecutive days)', () => {
  function consecutiveDaySessions(count: number, startDay = 1): BadgeSession[] {
    return Array.from({ length: count }, (_, i) =>
      session({
        id: `s${i}`,
        startedAt: `2026-09-${String(startDay + i).padStart(2, '0')}T09:00:00.000Z`,
        offsetMin: 0,
      }),
    );
  }

  it('just under: 6 consecutive days does not earn it', () => {
    expect(computeEarnedBadgeIds(history({ sessions: consecutiveDaySessions(6) })).has('seven_day_rhythm')).toBe(false);
  });

  it('just earned: 7 consecutive days', () => {
    expect(computeEarnedBadgeIds(history({ sessions: consecutiveDaySessions(7) })).has('seven_day_rhythm')).toBe(true);
  });

  it('a gap day resets the run: 4 + gap + 4 does not earn it', () => {
    const sessions = [...consecutiveDaySessions(4, 1), ...consecutiveDaySessions(4, 6)]; // days 1-4, then 6-9 (day 5 missing)
    expect(computeEarnedBadgeIds(history({ sessions })).has('seven_day_rhythm')).toBe(false);
  });

  it('7 non-consecutive days (week_of_mornings territory) does not earn the rhythm badge', () => {
    const sessions = [1, 3, 5, 7, 9, 11, 13].map((d) =>
      session({ id: `s${d}`, startedAt: `2026-09-${String(d).padStart(2, '0')}T09:00:00.000Z`, offsetMin: 0 }),
    );
    const earned = computeEarnedBadgeIds(history({ sessions }));
    expect(earned.has('week_of_mornings')).toBe(true);
    expect(earned.has('seven_day_rhythm')).toBe(false);
  });

  it('timezone crossing: uses the session\'s own recorded offset, not raw UTC date, to bucket local days', () => {
    // 2026-09-01T23:30:00Z with offset +600 (UTC+10) is already 2026-09-02
    // local — naive UTC-date bucketing would wrongly call this 09-01.
    const s1 = session({ id: 'a', startedAt: '2026-09-01T23:30:00.000Z', offsetMin: 600 });
    // 2026-09-02T14:00:00Z with offset -420 (UTC-7) is still 2026-09-02
    // local morning — naive UTC-date bucketing would wrongly call this 09-02
    // afternoon, which happens to match here, so also check a case where it
    // wouldn't: 2026-09-02T23:30:00Z with offset -420 is 2026-09-02 local
    // (16:30), not 09-03.
    const s2 = session({ id: 'b', startedAt: '2026-09-02T23:30:00.000Z', offsetMin: -420 });
    const seventh = consecutiveDaySessions(5, 3); // fills local days 3-7 so the run reaches 7 with s1 (day 2)
    const earned = computeEarnedBadgeIds(history({ sessions: [s1, s2, ...seventh] }));
    // s1 -> local day 2026-09-02, s2 -> local day 2026-09-02 (same day, not
    // 09-03): combined with days 3..7 that's 6 distinct consecutive days,
    // not enough for the 7-day rhythm badge — proves the offset, not the
    // UTC date, drove the bucketing (a UTC-date bug would have produced a
    // 7th distinct day from s2 and wrongly earned the badge).
    expect(earned.has('seven_day_rhythm')).toBe(false);
    expect(earned.has('week_of_mornings')).toBe(false); // only 6 distinct local days total
  });
});

describe('computeNewlyEarnedBadgeIds', () => {
  it('returns nothing when the new session crosses no threshold', () => {
    const before: BadgeHistory = history({ sessions: [session({ id: 'a' })] });
    const newSession = session({ id: 'b' });
    expect(computeNewlyEarnedBadgeIds(before, newSession)).toEqual([]);
  });

  it('returns first_words on the very first session (an incomplete one, so no other badge crosses)', () => {
    const before = history();
    const newSession = session({ id: 'a', endings: [{ text: 'a' }] }); // short of targetEndings=6
    expect(computeNewlyEarnedBadgeIds(before, newSession)).toEqual(['first_words']);
  });

  it('returns multiple badges crossed in the same session (e.g. first session also completing all endings)', () => {
    const before = history();
    const newSession = session({ id: 'a', targetEndings: 6 });
    const newly = computeNewlyEarnedBadgeIds(before, newSession);
    expect(newly).toEqual(expect.arrayContaining(['first_words', 'six_endings']));
  });

  it('does not re-report a badge already earned before this session', () => {
    const before = history({ sessions: [session({ id: 'a' })] }); // already has first_words
    const newSession = session({ id: 'b' });
    expect(computeNewlyEarnedBadgeIds(before, newSession)).not.toContain('first_words');
  });

  it('reports a volume badge only in the session that crosses the threshold, not before or after', () => {
    const fortyNine = Array.from({ length: 49 }, (_, i) => session({ id: `s${i}`, endings: [{ text: 'x' }] }));
    const before = history({ sessions: fortyNine });
    const crossing = session({ id: 'cross', endings: [{ text: 'x' }] }); // brings total to 50
    expect(computeNewlyEarnedBadgeIds(before, crossing)).toEqual(['fifty_endings']);

    const afterHistory = history({ sessions: [...fortyNine, crossing] });
    const nextSession = session({ id: 'next', endings: [{ text: 'x' }] });
    expect(computeNewlyEarnedBadgeIds(afterHistory, nextSession)).toEqual([]);
  });
});
