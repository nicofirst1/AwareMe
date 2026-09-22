import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { StyleSheet, Text, type TextStyle } from 'react-native';

import ReviewScreen from '@/app/review';
import { ThemedText, type ThemedTextProps } from '@/components/themed-text';
import type { EndingRow, SessionRow, StemRow } from '@/db';
import type { SessionState } from '@/session/sessionMachine';
import type { WritingSessionView } from '@/session/useWritingSession';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockMetaStem: StemRow = {
  id: 'meta-1',
  text: 'What would I do if I knew no one would judge me?',
  origin: 'meta',
  category: null,
  weight: 1,
  time_of_day: null,
};

function makeSession(id: string, startedAt: string): SessionRow {
  return {
    id,
    stem_id: `stem-${id}`,
    stem_text_snapshot: `Review stem ${id}`,
    origin: 'manual',
    target_endings: 2,
    timer_seconds: 90,
    uncensored_mode: 0,
    started_at: startedAt,
    first_keypress_at: null,
    ended_at: startedAt,
    end_reason: 'user_done',
    last_activity_at: startedAt,
    tz: 'Europe/Berlin',
    offset_min: 120,
    device_locale: 'de-DE',
  };
}

function makeEnding(id: string, sessionId: string, ordinal: number, text: string): EndingRow {
  return {
    id,
    session_id: sessionId,
    ordinal,
    text,
    started_at: '2026-09-10T08:05:00.000Z',
    submitted_at: '2026-09-10T08:09:00.000Z',
    backspace_count: 2,
  };
}

const mockReviewed = [
  {
    session: makeSession('s1', '2026-09-10T08:00:00.000Z'),
    endings: [
      makeEnding('e1', 's1', 1, 'First ending of the week.'),
      makeEnding('e2', 's1', 2, 'Second ending of the week.'),
    ],
  },
  {
    session: makeSession('s2', '2026-09-12T21:00:00.000Z'),
    endings: [makeEnding('e3', 's2', 1, '')],
  },
];

const mockCreateReview = jest.fn();

jest.mock('@/db', () => {
  const actual = jest.requireActual('@/db');
  return {
    ...actual,
    getRepository: () => ({
      listMetaStems: () => [mockMetaStem],
      listSessionsForReview: () => mockReviewed,
      getLastReviewAt: () => null,
      getSettings: () => ({ review_timer_seconds: 180 }),
      createReview: mockCreateReview,
    }),
  };
});

// jest.mock()'s factory can't close over non-`mock`-prefixed bindings; tests
// mutate this object between renders to drive the session phases.
const mockSessionView: WritingSessionView = {
  phase: 'idle',
  sessionId: null,
  stemText: null,
  state: null,
  activeText: '',
  remainingSeconds: 0,
  stemRemainingSeconds: null,
  start: jest.fn(),
  changeActiveText: jest.fn(),
  submitActive: jest.fn(),
  finishNow: jest.fn(),
};

jest.mock('@/session/useWritingSession', () => ({
  useWritingSession: () => mockSessionView,
}));

function activeSessionState(): SessionState {
  return {
    config: { targetEndings: 1, timerSeconds: 180, uncensoredMode: false, stemTimerSeconds: null },
    startedAt: '2026-09-15T08:00:00.000Z',
    firstKeypressAt: null,
    lastActivityAt: '2026-09-15T08:01:00.000Z',
    endedAt: null,
    endReason: null,
    endings: [],
    activeOrdinal: 1,
  };
}

// Same Intl expression review.tsx's eyebrow header uses, so the assertion
// holds whatever locale the test environment runs under (audit C6).
function expectedCardDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

describe('ReviewScreen', () => {
  // R2 (layout-audit-2026-09-15, LC5): session cards used to open with a
  // bare dim date line and endings that differed from the stem by opacity
  // only. Now each card carries a metadata header (date + ending count —
  // descriptive only, §13.4/§13.6) and dim, hairline-separated endings. The
  // header took the 12px eyebrow role until packet-3 t7 raised it to small
  // (14, readable per p2n-17); the inventory test pins the role set.
  it('gives session cards a metadata header with date and ending count', () => {
    render(<ReviewScreen />);

    expect(screen.getByText(`${expectedCardDate('2026-09-10T08:00:00.000Z')} · 2 endings`)).toBeTruthy();
    expect(screen.getByText(`${expectedCardDate('2026-09-12T21:00:00.000Z')} · 1 ending`)).toBeTruthy();
    // Endings render as their own dim rows under the serif stem; the empty
    // one keeps the quiet fallback (nothing discarded, nothing dramatized).
    expect(screen.getByText('First ending of the week.')).toBeTruthy();
    expect(screen.getByText('Second ending of the week.')).toBeTruthy();
    expect(screen.getByText('(nothing written)')).toBeTruthy();
  });

  // t7 (packet-3 rollup 12 / p2n-17): the screen carried five type scales at
  // once (32/22/16/14/12) with the card metadata in 12px spaced caps, too
  // small next to the content it describes. The consolidation pins every
  // text node to four DESIGN.md roles: title (screen anchor), stem (the
  // user's writing, the reserved serif face), small (metadata + helper
  // lines at a readable 14), default (control labels and status copy). The
  // eyebrow role (12px) leaves this screen.
  it('renders the screen in exactly four DESIGN.md type roles, none at 12px', () => {
    const view = render(<ReviewScreen />);

    const roles = view.root
      .findAllByType(ThemedText)
      .map((node: { props: ThemedTextProps }) => node.props.type ?? 'default');
    expect(new Set(roles)).toEqual(new Set(['title', 'stem', 'small', 'default']));

    // Size inventory over the real host tree. Icon glyphs (Ionicons: the
    // back chevron, the selected-chip checkmark) are icon sizes, not type
    // scales, and are excluded by their icon fontFamily.
    const fontSizes = view.root
      .findAll((node: { type: unknown }) => node.type === Text)
      .map((node: { props: { style?: TextStyle } }): Pick<TextStyle, 'fontSize' | 'fontFamily'> =>
        (StyleSheet.flatten([node.props.style]) as Pick<TextStyle, 'fontSize' | 'fontFamily'>) ?? {},
      )
      .filter((flat: Pick<TextStyle, 'fontSize' | 'fontFamily'>) => typeof flat.fontFamily !== 'string' || !/icons$/i.test(flat.fontFamily))
      .map((flat: Pick<TextStyle, 'fontSize' | 'fontFamily'>) => flat.fontSize)
      .filter((size: number | undefined): size is number => typeof size === 'number');
    expect(fontSizes).not.toContain(12);
    expect(new Set(fontSizes).size).toBeLessThanOrEqual(4);
  });

  // R1 (layout-audit-2026-09-15): "Continue" used to render after the whole
  // reread stream (~2,200pt with a five-session period). It must be a child
  // of the pinned bottom bar, not of the scrolling stream.
  it('pins Continue in the bottom action bar, outside the scroll stream', () => {
    render(<ReviewScreen />);

    const bar = screen.getByTestId('review-bottom-bar');
    expect(within(bar).getByLabelText('Continue')).toBeTruthy();
    expect(screen.getAllByLabelText('Continue')).toHaveLength(1);
  });

  it('shows the meta-stem with the same pinned write primitives while active', () => {
    mockSessionView.phase = 'active';
    mockSessionView.sessionId = 'meta-session';
    mockSessionView.stemText = mockMetaStem.text;
    mockSessionView.state = activeSessionState();
    mockSessionView.activeText = 'Half a thought, still moving.';
    mockSessionView.remainingSeconds = 90;

    render(<ReviewScreen />);
    fireEvent.press(screen.getByLabelText('Continue'));

    // The timer strip's MM:SS — sole carrier of the countdown since the
    // Save button's removal (2026-09-15 owner decision; the pressure cue
    // now colors these numerals) — plus the reflection input and Done in
    // the pinned bar.
    expect(screen.getAllByText('1:30')).toHaveLength(1);
    expect(screen.getByLabelText('Your reflection')).toBeTruthy();
    expect(screen.getByLabelText('Finish session')).toBeTruthy();
  });

  it('records the review with whatever was written when the meta-stem finishes', () => {
    mockSessionView.phase = 'active';
    mockSessionView.sessionId = 'meta-session';
    mockSessionView.stemText = mockMetaStem.text;
    mockSessionView.state = activeSessionState();
    mockSessionView.activeText = '';
    mockSessionView.remainingSeconds = 180;

    const view = render(<ReviewScreen />);
    fireEvent.press(screen.getByLabelText('Continue'));

    mockSessionView.phase = 'done';
    mockSessionView.state = {
      ...activeSessionState(),
      endedAt: '2026-09-15T08:03:00.000Z',
      endReason: 'user_done',
      endings: [
        { ordinal: 1, text: 'My reflection text.', startedAt: '2026-09-15T08:01:00.000Z', submittedAt: '2026-09-15T08:03:00.000Z', backspaceCount: 1 },
      ],
    };
    view.rerender(<ReviewScreen />);

    expect(mockCreateReview).toHaveBeenCalledWith(
      expect.objectContaining({
        metaStemText: mockMetaStem.text,
        sessionIds: ['s1', 's2'],
        reflectionText: 'My reflection text.',
      }),
    );
    expect(screen.getByText('Saved.')).toBeTruthy();
  });
});
