import {
  finalizeSession,
  isComplete,
  recordFirstKeypress,
  startSession,
  submitActiveEnding,
  updateActiveEndingText,
} from '../sessionMachine';

const CONFIG = { targetEndings: 3, timerSeconds: 90, uncensoredMode: true };
const T0 = '2026-09-10T08:00:00.000Z';

describe('startSession', () => {
  it('starts with no endings, field 1 active, clock at startedAt', () => {
    const s = startSession(CONFIG, T0);
    expect(s.activeOrdinal).toBe(1);
    expect(s.endings).toHaveLength(0);
    expect(s.startedAt).toBe(T0);
    expect(s.lastActivityAt).toBe(T0);
    expect(s.firstKeypressAt).toBeNull();
    expect(s.endedAt).toBeNull();
  });
});

describe('recordFirstKeypress', () => {
  it('creates the endings row for the active field on first keystroke (ADR-0003)', () => {
    const s = recordFirstKeypress(startSession(CONFIG, T0), '2026-09-10T08:00:05.000Z');
    expect(s.endings).toHaveLength(1);
    expect(s.endings[0]).toMatchObject({ ordinal: 1, text: '', submittedAt: null });
    expect(s.endings[0].startedAt).toBe('2026-09-10T08:00:05.000Z');
  });

  it('stamps session.firstKeypressAt only on the very first keypress of the session', () => {
    let s = startSession(CONFIG, T0);
    s = recordFirstKeypress(s, '2026-09-10T08:00:05.000Z');
    expect(s.firstKeypressAt).toBe('2026-09-10T08:00:05.000Z');

    s = submitActiveEnding(s, '2026-09-10T08:00:10.000Z');
    s = recordFirstKeypress(s, '2026-09-10T08:00:20.000Z');
    expect(s.firstKeypressAt).toBe('2026-09-10T08:00:05.000Z');
  });

  it('is a no-op if the active field already has a row', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), '2026-09-10T08:00:05.000Z');
    s = recordFirstKeypress(s, '2026-09-10T08:00:06.000Z');
    expect(s.endings).toHaveLength(1);
    expect(s.endings[0].startedAt).toBe('2026-09-10T08:00:05.000Z');
  });
});

describe('updateActiveEndingText', () => {
  it('replaces the active field text and bumps lastActivityAt', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), '2026-09-10T08:00:05.000Z');
    s = updateActiveEndingText(s, 'hello', '2026-09-10T08:00:06.000Z');
    expect(s.endings[0].text).toBe('hello');
    expect(s.lastActivityAt).toBe('2026-09-10T08:00:06.000Z');
  });

  it('accumulates a backspace delta onto the field backspace count', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = updateActiveEndingText(s, 'hell', T0, 1);
    s = updateActiveEndingText(s, 'hel', T0, 1);
    expect(s.endings[0].backspaceCount).toBe(2);
  });
});

describe('submitActiveEnding', () => {
  it('stamps submittedAt and advances activeOrdinal', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = updateActiveEndingText(s, 'first ending', T0);
    s = submitActiveEnding(s, '2026-09-10T08:00:30.000Z');
    expect(s.endings[0].submittedAt).toBe('2026-09-10T08:00:30.000Z');
    expect(s.activeOrdinal).toBe(2);
  });

  it('is a no-op with no active field yet (nothing typed)', () => {
    const s0 = startSession(CONFIG, T0);
    const s1 = submitActiveEnding(s0, T0);
    expect(s1).toEqual(s0);
  });

  it('is a no-op if the active field is already submitted', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = submitActiveEnding(s, '2026-09-10T08:00:10.000Z');
    const after = submitActiveEnding(s, '2026-09-10T08:00:20.000Z');
    expect(after).toEqual(s);
  });
});

describe('isComplete', () => {
  it('is false until targetEndings fields are submitted', () => {
    let s = startSession(CONFIG, T0);
    for (let i = 0; i < CONFIG.targetEndings - 1; i++) {
      s = recordFirstKeypress(s, T0);
      s = submitActiveEnding(s, T0);
    }
    expect(isComplete(s)).toBe(false);
  });

  it('is true once targetEndings fields are submitted', () => {
    let s = startSession(CONFIG, T0);
    for (let i = 0; i < CONFIG.targetEndings; i++) {
      s = recordFirstKeypress(s, T0);
      s = submitActiveEnding(s, T0);
    }
    expect(isComplete(s)).toBe(true);
  });
});

describe('finalizeSession', () => {
  it('on timeout, preserves a half-typed final ending and stamps its submittedAt (nothing discarded)', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = updateActiveEndingText(s, 'half-typed thou', T0);
    s = finalizeSession(s, 'timeout', '2026-09-10T08:01:30.000Z');

    expect(s.endedAt).toBe('2026-09-10T08:01:30.000Z');
    expect(s.endReason).toBe('timeout');
    expect(s.endings[0].text).toBe('half-typed thou');
    expect(s.endings[0].submittedAt).toBe('2026-09-10T08:01:30.000Z');
  });

  it('does not touch already-submitted endings', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = submitActiveEnding(s, '2026-09-10T08:00:10.000Z');
    s = finalizeSession(s, 'user_done', '2026-09-10T08:00:40.000Z');
    expect(s.endings[0].submittedAt).toBe('2026-09-10T08:00:10.000Z');
  });

  it('user_done can finalize with fewer than target_endings', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = submitActiveEnding(s, T0);
    s = finalizeSession(s, 'user_done', T0);
    expect(s.endReason).toBe('user_done');
    expect(isComplete(s)).toBe(false);
  });

  it('is idempotent: finalizing an already-finalized session is a no-op', () => {
    let s = recordFirstKeypress(startSession(CONFIG, T0), T0);
    s = finalizeSession(s, 'timeout', '2026-09-10T08:01:30.000Z');
    const again = finalizeSession(s, 'user_done', '2026-09-10T09:00:00.000Z');
    expect(again).toEqual(s);
  });

  it('finalizing with no field ever touched saves an empty endings list, not an error', () => {
    const s = finalizeSession(startSession(CONFIG, T0), 'abandoned', '2026-09-10T08:10:00.000Z');
    expect(s.endings).toHaveLength(0);
    expect(s.endReason).toBe('abandoned');
  });
});
