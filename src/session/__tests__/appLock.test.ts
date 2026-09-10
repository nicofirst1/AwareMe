import { FOREGROUND_LOCK_THRESHOLD_MS, nextLockState } from '../appLock';

describe('nextLockState', () => {
  it('never locks when the setting is off, regardless of event', () => {
    expect(nextLockState(false, false, { type: 'cold_start' })).toBe(false);
    expect(nextLockState(false, true, { type: 'foreground', backgroundedAtMs: 0, nowMs: 1_000_000 })).toBe(false);
  });

  it('always locks on cold start when enabled', () => {
    expect(nextLockState(true, false, { type: 'cold_start' })).toBe(true);
  });

  it('locks on foreground if backgrounded for at least the 60s threshold', () => {
    const backgroundedAtMs = 0;
    expect(
      nextLockState(true, false, { type: 'foreground', backgroundedAtMs, nowMs: FOREGROUND_LOCK_THRESHOLD_MS }),
    ).toBe(true);
    expect(
      nextLockState(true, false, { type: 'foreground', backgroundedAtMs, nowMs: FOREGROUND_LOCK_THRESHOLD_MS + 1 }),
    ).toBe(true);
  });

  it('does not lock on foreground if backgrounded for under the threshold', () => {
    expect(
      nextLockState(true, false, { type: 'foreground', backgroundedAtMs: 0, nowMs: FOREGROUND_LOCK_THRESHOLD_MS - 1 }),
    ).toBe(false);
  });

  it('a brief foreground never unlocks an already-locked app early', () => {
    expect(nextLockState(true, true, { type: 'foreground', backgroundedAtMs: 0, nowMs: 1 })).toBe(true);
  });

  it('authenticated always unlocks when enabled', () => {
    expect(nextLockState(true, true, { type: 'authenticated' })).toBe(false);
  });
});
