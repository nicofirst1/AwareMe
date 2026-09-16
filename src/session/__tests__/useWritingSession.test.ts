import { act, renderHook } from '@testing-library/react-native';

import { DEFAULT_SETTINGS, type Settings } from '@/db';
import { useWritingSession } from '@/session/useWritingSession';

/**
 * Behavioral coverage for the per-stem countdown (spec §6.3.4's optional
 * per-stem timer: `stem_timer_enabled` / `stem_timer_seconds`) — and
 * specifically for its RESET rule, which the write screen's pressure cue
 * depends on: the field countdown starts from the configured value again
 * whenever the active field changes (a submitted field, or the field
 * timer's own expiry) and only then. The session countdown is an
 * independent clock — a field change never touches it.
 *
 * Zero-coverage gap named by the 2026-09-16 lint disposition (issue 17):
 * these tests pin the reset behavior before the session-state refactor
 * (set-state-in-effect debt pass) touches the code that implements it.
 */

// jest.mock()'s factory can't close over module-scope variables unless
// they're prefixed `mock*` (jest's hoisting rule) — and the reference has
// to be lazy (inside the returned closure), because the factory itself is
// hoisted above the module's own initializations.
const mockSettings: { current: Settings } = { current: { ...DEFAULT_SETTINGS } };

jest.mock('@/db', () => ({
  ...jest.requireActual<typeof import('@/db')>('@/db'),
  getRepository: () => ({
    getSettings: () => mockSettings.current,
    getOpenSession: () => null,
    createSession: () => 'session-1',
    recordFirstKeypress: () => {},
    autosaveEndingText: () => {},
    submitEnding: () => {},
    finalizeSession: () => {},
  }),
}));

const STEM = { id: 'stem-1', text: 'If I notice how this begins' };

function withSettings(overrides: Partial<Settings>) {
  mockSettings.current = { ...DEFAULT_SETTINGS, ...overrides };
}

beforeEach(() => {
  jest.useFakeTimers();
  withSettings({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useWritingSession — per-stem countdown (stem_timer_enabled)', () => {
  it('starts a new field at the configured stem_timer_seconds, session clock separate', () => {
    withSettings({ stem_timer_enabled: true, stem_timer_seconds: 45, timer_seconds: 600 });
    const { result } = renderHook(() => useWritingSession());

    act(() => {
      result.current.start(STEM);
    });

    expect(result.current.phase).toBe('active');
    expect(result.current.stemRemainingSeconds).toBe(45);
    expect(result.current.remainingSeconds).toBe(600);
  });

  it('resets the field countdown when a submitted field advances to the next field', () => {
    withSettings({
      stem_timer_enabled: true,
      stem_timer_seconds: 45,
      timer_seconds: 600,
      endings_per_session: 3,
    });
    const { result } = renderHook(() => useWritingSession());

    act(() => {
      result.current.start(STEM);
    });

    // A few seconds tick off field 1.
    act(() => {
      jest.advanceTimersByTime(12_000);
    });
    expect(result.current.stemRemainingSeconds).toBe(33);

    // Enter submits field 1; field 2 opens — the countdown starts over.
    act(() => {
      result.current.submitActive('one honest sentence about right now');
    });

    expect(result.current.stemRemainingSeconds).toBe(45);
    expect(result.current.phase).toBe('active');
    expect(result.current.state?.activeOrdinal).toBe(2);
    // The session countdown is independent: twelve seconds are gone and
    // they stay gone (a field change never resets the session clock).
    expect(result.current.remainingSeconds).toBe(588);
  });

  it('resets the field countdown after an expiry saves the field and the next one opens', () => {
    withSettings({
      stem_timer_enabled: true,
      stem_timer_seconds: 45,
      timer_seconds: 600,
      endings_per_session: 3,
    });
    const { result } = renderHook(() => useWritingSession());

    act(() => {
      result.current.start(STEM);
    });

    // Let the field timer run all the way out: 45 ticks of one second.
    act(() => {
      jest.advanceTimersByTime(45_000);
    });

    // The field expired (nothing typed, so nothing is lost) and the next
    // field opened with a full countdown; the session itself keeps running
    // (600s session clock, only 45s elapsed).
    expect(result.current.stemRemainingSeconds).toBe(45);
    expect(result.current.phase).toBe('active');
    expect(result.current.state?.activeOrdinal).toBe(2);
    expect(result.current.remainingSeconds).toBe(555);
  });

  it('does not reset the field countdown when the final submit ends the session', () => {
    withSettings({
      stem_timer_enabled: true,
      stem_timer_seconds: 45,
      timer_seconds: 600,
      endings_per_session: 1,
    });
    const { result } = renderHook(() => useWritingSession());

    act(() => {
      result.current.start(STEM);
    });

    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current.stemRemainingSeconds).toBe(35);

    // The one target field is submitted: the session completes — there is
    // no "next field" to start a fresh countdown for.
    act(() => {
      result.current.submitActive('the only field, submitted');
    });

    expect(result.current.phase).toBe('done');
    expect(result.current.stemRemainingSeconds).toBe(35);
  });
});

describe('useWritingSession — per-stem countdown disabled', () => {
  it('keeps stemRemainingSeconds null while the stem timer is off', () => {
    withSettings({ stem_timer_enabled: false });
    const { result } = renderHook(() => useWritingSession());

    act(() => {
      result.current.start(STEM);
    });
    expect(result.current.stemRemainingSeconds).toBeNull();

    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    act(() => {
      result.current.submitActive('typed without a field clock');
    });

    expect(result.current.phase).toBe('active');
    expect(result.current.stemRemainingSeconds).toBeNull();
  });
});
