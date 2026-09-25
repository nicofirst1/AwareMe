import { act, configure, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';

import { SPLASH_QUOTE_PLACEHOLDER, SplashSequence } from '@/components/splash/SplashSequence';
import { Colors } from '@/constants/theme';

// The overlay is deliberately hidden from accessibility (it is decorative;
// the home screen behind already announces "AwareMe"). RNTL excludes
// accessibility-hidden subtrees from queries by default, so this file opts
// back in — file-scoped config, other suites are untouched.
configure({ defaultIncludeHiddenElements: true });

// The sequence is choreographed by setTimeout transitions, so tests drive it
// with fake timers and assert the RESERVED-SLOT contract: both text slots are
// mounted from the first frame with opacity 0 (the centered column's layout
// never re-flows), the phase machine drives only their opacity, and the
// overlay still dismisses itself — never interpolation values mid-animation
// (the Animated driver does not run meaningfully in the jest environment).
// Rendered styles carry the animated values' snapshot at the latest render,
// so pre-beat slots read a deterministic 0; the reduce-motion path's
// setValue(1) happens without a re-render, so only presence is asserted
// there (visibility on-device comes from the setValue, not the render).
//
// `isReduceMotionEnabled` is spied per test: the component reads it once on
// mount, so the spy's resolved value decides which path runs (animated vs.
// static reduce-motion one).

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/**
 * Flush the reduce-motion read (a promise microtask) and settle re-renders
 * before advancing the phase machine.
 */
async function settle(): Promise<void> {
  await act(async () => {});
}

/**
 * The rendered opacity snapshot of a reserved slot: the animated value's
 * value at the latest render. Deterministic for slots no animation has
 * touched yet (the constructor's start value, 0); mid-animation and
 * post-setValue values are not asserted (stale snapshot / driver-dependent).
 */
function slotOpacity(testId: string): number {
  const style = StyleSheet.flatten(screen.getByTestId(testId).props.style);
  return style.opacity as number;
}

describe('SplashSequence', () => {
  it('reserves both text slots from mount, animates their opacity in sequence, then dismisses itself', async () => {
    render(<SplashSequence />);
    await settle();

    // Phase 1: the logo alone over the full-screen overlay — but BOTH text
    // slots are already mounted (reserved from frame one) and transparent,
    // so the centered column's layout is stable and never re-flows when a
    // slot becomes visible (the owner's 2026-09-25 logo-hop report).
    expect(screen.getByTestId('splash-overlay')).toBeTruthy();
    expect(screen.getByTestId('splash-logo')).toBeTruthy();
    expect(screen.getByTestId('splash-wordmark')).toBeTruthy();
    expect(screen.getByTestId('splash-quote')).toBeTruthy();
    expect(screen.getByText('AwareMe')).toBeTruthy();
    expect(slotOpacity('splash-wordmark')).toBe(0);
    expect(slotOpacity('splash-quote')).toBe(0);

    // Phase 2: the wordmark's beat (560ms into the sequence) — its opacity
    // is now animating (not asserted mid-flight); the quote slot is still
    // untouched by any animation, so its value is deterministic.
    act(() => {
      jest.advanceTimersByTime(560);
    });
    expect(slotOpacity('splash-quote')).toBe(0);

    // Phase 3: the quote's beat (1120ms).
    act(() => {
      jest.advanceTimersByTime(560);
    });
    expect(screen.getByText(SPLASH_QUOTE_PLACEHOLDER)).toBeTruthy();

    // 2450ms: the exit fade begins; 380ms later the overlay is gone and the
    // home screen stands alone.
    act(() => {
      jest.advanceTimersByTime(1330);
    });
    expect(screen.getByTestId('splash-overlay')).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.queryByTestId('splash-overlay')).toBeNull();
  });

  it('renders the placeholder quote verbatim (the pinned stub)', async () => {
    render(<SplashSequence />);
    await settle();
    // Advance phase by phase (the phase machine's timers are re-scheduled
    // per phase, so the sequence is driven in steps, not one leap).
    act(() => {
      jest.advanceTimersByTime(560);
    });
    act(() => {
      jest.advanceTimersByTime(560);
    });
    // The quote stub must render exactly the exported constant — a guard
    // against programme/Branden text ever drifting in (spec §5.1).
    expect(screen.getByText(SPLASH_QUOTE_PLACEHOLDER)).toBeTruthy();
  });

  it('paints the overlay with the theme background token (native-splash handoff)', async () => {
    render(<SplashSequence />);
    await settle();
    const overlay = screen.getByTestId('splash-overlay');
    const style = StyleSheet.flatten(overlay.props.style);
    // Light theme default: the cream the native splash paints (#fef5e8) —
    // the same surface value `Colors.light.background` resolves to, so the
    // native splash → overlay handoff shows no seam.
    expect(style.backgroundColor).toEqual(Colors.light.background);
  });

  it('reduced motion: shows the final composition statically, then clears', async () => {
    // The beforeEach spy is already in place — this overrides its resolved
    // value for this test only.
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    render(<SplashSequence />);
    await settle();

    // No intermediate phases: logo, wordmark and quote are all mounted at
    // once — the composed final state, reached without any animation. (The
    // setValue(1) that makes the reserved slots visible happens without a
    // re-render, so the rendered opacity snapshot is not asserted here.)
    expect(screen.getByTestId('splash-logo')).toBeTruthy();
    expect(screen.getByText('AwareMe')).toBeTruthy();
    expect(screen.getByTestId('splash-quote')).toBeTruthy();

    // After the static hold the overlay clears entirely (no fade — an
    // animated opacity is exactly what reduce motion asked not to get).
    act(() => {
      jest.advanceTimersByTime(900);
    });
    expect(screen.queryByTestId('splash-overlay')).toBeNull();
  });
});
