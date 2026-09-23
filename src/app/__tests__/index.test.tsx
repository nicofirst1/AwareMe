import { fireEvent, render, screen } from '@testing-library/react-native';
import { Dimensions, Linking, StyleSheet } from 'react-native';

import HomeScreen from '@/app/index';
import { Colors, Spacing } from '@/constants/theme';
import { DEFAULT_SETTINGS, type Settings } from '@/db';

// The home header (packet-3 t2b) scales itself against the measured viewport,
// so the narrow-viewport tests set the window through the real Dimensions
// API (useWindowDimensions reads it); each test restores the default. The
// default here is a normal-phone geometry.
const DEFAULT_TEST_WINDOW = { width: 411, height: 891, scale: 2, fontScale: 1 };
const setTestWindow = (width: number, height: number, scale = 1): void => {
  Dimensions.set({ window: { width, height, scale, fontScale: 1 } });
};

// The splash entrance sequence (v14 issue 01) runs its own timers and
// reads AccessibilityInfo on mount — both belong to its own test file
// (SplashSequence.test.tsx). Home tests pin only the wiring: the sequence
// is mounted, and its presence in the render tree is asserted below.
jest.mock('@/components/splash/SplashSequence', () => {
  const { createElement } = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    SplashSequence: () => createElement(View, { testID: 'splash-sequence' }),
  };
});

// `useFocusEffect` (2026-09-11 visual-test fix: home status now refreshes on
// focus, not just mount) calls `useNavigation()` under the hood, which
// throws outside a real navigation tree — this bare `render(<HomeScreen />)`
// has none. Same fix as `stems.test.tsx`: run the effect once on mount
// instead, matching what happens on a real mount-while-focused, and keep
// `useRouter`/`Link` real since index.tsx's existing usage of them already
// works fine in this environment.
jest.mock('expo-router', () => {
  const { useEffect } = require('react');
  const actual = jest.requireActual('expo-router');
  return {
    ...actual,
    useFocusEffect: (effect: () => void) => useEffect(() => effect(), []),
  };
});

// Same pattern as `progress.test.tsx`: a minimal repository stub so the
// programme cards' read-time state (readHomeProgrammeStatus) has something
// real to render, instead of silently catching a throw from a real
// (unopenable-in-this-env) on-device DB. The issue's standing note — the
// @/db mock must carry every repository method the screen's read path
// calls — applies: the programme reads are all stubbed here (their SQL is
// exercised against real SQLite in programRepository.test.ts).
const mockRepository: {
  listSessionsForHistory: () => { id: string }[];
  getLastReviewAt: () => string | null;
  listSessionsForStats: () => { id: string }[];
  getFirstProgrammePractice: () => { startedAt: string; offsetMin: number } | null;
  listCompletedWeeklyReflections: () => { startedAt: string; offsetMin: number; programmeOn: number }[];
  listCompletedEveningReflections: () => { startedAt: string; offsetMin: number }[];
  getProgrammeStemsForWeek: (week: number) => { id: string }[];
  countProgrammeStemsCompletedInRange: (week: number, start: string, end: string) => number;
  getHighestUnlockedWeek: () => number;
  getSettings?: () => Settings;
} = {
  listSessionsForHistory: () => [{ id: 'session-1' }],
  getLastReviewAt: () => '2000-01-01T00:00:00.000Z',
  listSessionsForStats: () => [],
  getFirstProgrammePractice: () => null,
  listCompletedWeeklyReflections: () => [],
  listCompletedEveningReflections: () => [],
  getProgrammeStemsForWeek: () => [{ id: 'stem-1' }],
  countProgrammeStemsCompletedInRange: () => 0,
  getHighestUnlockedWeek: () => 0,
  getSettings: () => DEFAULT_SETTINGS,
};

jest.mock('@/db', () => {
  const actual = jest.requireActual<typeof import('@/db')>('@/db');
  return {
    ...actual,
    getRepository: () => mockRepository,
  };
});

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
const todayName = (): string => WEEKDAY_NAMES[new Date().getDay()];

describe('HomeScreen', () => {
  afterEach(() => {
    mockRepository.getSettings = () => DEFAULT_SETTINGS;
    setTestWindow(DEFAULT_TEST_WINDOW.width, DEFAULT_TEST_WINDOW.height, DEFAULT_TEST_WINDOW.scale);
  });

  it('renders the week card with the derived week, stem count, and a review row', () => {
    render(<HomeScreen />);
    // Fresh install: no first programme Practice → derived week 1.
    expect(screen.getByText('Week 1 of 30')).toBeTruthy();
    expect(screen.getByText('1 stem ready')).toBeTruthy();
    expect(screen.getByText('1 session this week')).toBeTruthy();
    expect(screen.getByText('Review available')).toBeTruthy();
    // o11 layout/a11y cycle: the review row is a Link with an explicit role
    // and label (matches BackHeader's documented link convention).
    expect(screen.getByRole('link', { name: 'Review available' })).toBeTruthy();
    expect(screen.getByText('Start morning practice')).toBeTruthy();
  });

  it('renders the evening reflection card (enabled by default) and marks its done state', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Evening reflection')).toBeTruthy();
    expect(screen.getByText('Begin evening reflection')).toBeTruthy();

    // A completed evening reflection today → the quiet done state, and the
    // card stays (a second Practice is allowed, absence is never punished,
    // §13.4).
    const nowIso = new Date().toISOString();
    const offsetMin = -new Date().getTimezoneOffset();
    mockRepository.listCompletedEveningReflections = () => [{ startedAt: nowIso, offsetMin }];
    render(<HomeScreen />);
    expect(screen.getByText('Reflected today')).toBeTruthy();
  });

  it('hides the evening card when evening practice is disabled', () => {
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, evening_practice_enabled: false });
    render(<HomeScreen />);
    expect(screen.queryByText('Evening reflection')).toBeNull();
  });

  it('shows the weekly reflection card on its target day, with its done state', () => {
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, weekly_meta_day: todayName() });
    render(<HomeScreen />);
    expect(screen.getByText('Weekly reflection')).toBeTruthy();
    expect(screen.getByText(`Week 1’s endings, then the weekly stem.`)).toBeTruthy();
    expect(screen.getByText('Begin weekly reflection')).toBeTruthy();
  });

  it('does not show the weekly reflection card on other days', () => {
    const otherDay = WEEKDAY_NAMES[(new Date().getDay() + 3) % 7];
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, weekly_meta_day: otherDay });
    render(<HomeScreen />);
    expect(screen.queryByText('Weekly reflection')).toBeNull();
  });

  it('nudges only when this calendar week advanced the derived week', () => {
    // A reflection in the current Mon–Sun week (anchored 3 weeks ago):
    // derived 2 with it, 1 without it → the calm nudge with derived numbers.
    const now = new Date();
    const offsetMin = -now.getTimezoneOffset();
    const anchor = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
    mockRepository.getFirstProgrammePractice = () => ({ startedAt: anchor.toISOString(), offsetMin });
    mockRepository.listCompletedWeeklyReflections = () => [{ startedAt: now.toISOString(), offsetMin, programmeOn: 1 }];
    render(<HomeScreen />);
    expect(screen.getByText('Week 1 complete. Week 2 is ready.')).toBeTruthy();

    // No reflection this week → no nudge, no guilt about the missed one.
    mockRepository.listCompletedWeeklyReflections = () => [];
    render(<HomeScreen />);
    expect(screen.queryByText(/is ready\./)).toBeNull();
  });

  it('marks the week-30 completion state and points at the library', () => {
    const now = new Date();
    const offsetMin = -now.getTimezoneOffset();
    mockRepository.getSettings = () => ({ ...DEFAULT_SETTINGS, program_week_override: 30 });
    mockRepository.listCompletedWeeklyReflections = () => [{ startedAt: now.toISOString(), offsetMin, programmeOn: 1 }];
    render(<HomeScreen />);
    expect(screen.getByText('Week 30 of 30')).toBeTruthy();
    expect(screen.getByText('Week 30 complete. The library is yours from here.')).toBeTruthy();
    expect(screen.getByText('Browse the library')).toBeTruthy();
    // o11: the completion block's library link carries the link role + label.
    expect(screen.getByRole('link', { name: 'Browse the library' })).toBeTruthy();
    // The nudge is suppressed once the completion state speaks.
    expect(screen.queryByText(/is ready\./)).toBeNull();
  });

  it('still renders (default period rule) when settings cannot be read', () => {
    // No `getSettings` on the stub: the render path must catch the throw and
    // fall back (currentPracticePeriod(undefined, undefined)), not crash the
    // screen — and the status block is simply absent, not an error message.
    const baseGetSettings = mockRepository.getSettings;
    delete mockRepository.getSettings;
    try {
      render(<HomeScreen />);
      expect(screen.getByText('Morning practice')).toBeTruthy();
      expect(screen.queryByText('1 stem ready')).toBeNull();
    } finally {
      mockRepository.getSettings = baseGetSettings;
    }
  });

  it('renders the app name and tagline', () => {
    render(<HomeScreen />);
    expect(screen.getByText('AwareMe')).toBeTruthy();
    // Tagline (v12 issue 02): states the purpose, in the self-esteem
    // direction; alternatives live in the issue Comments.
    expect(screen.getByText('A daily practice for self-esteem, one sentence at a time.')).toBeTruthy();
  });

  it('renders the app icon above the title', () => {
    render(<HomeScreen />);
    // Depth-first order over the host JSON tree = visual order. Plain data
    // only: identity-comparing RNTL instances (instance.parent toBe) fails
    // and jest's failure printout walks the whole renderer tree (heap OOM).
    const json = screen.toJSON() as { props?: { testID?: string }; children?: unknown[] };
    const marks: { testID?: string; text?: string }[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') {
        marks.push({ text: node });
        return;
      }
      const n = node as { props?: { testID?: string }; children?: unknown[] };
      marks.push({ testID: n.props?.testID });
      (n.children ?? []).forEach(walk);
    };
    walk(json);
    const iconIndex = marks.findIndex((m) => m.testID === 'home-app-icon');
    const titleIndex = marks.findIndex((m) => m.text === 'AwareMe');
    expect(iconIndex).toBeGreaterThanOrEqual(0);
    expect(titleIndex).toBeGreaterThan(iconIndex);
  });

  it('gives all eight tiles one shared background', () => {
    render(<HomeScreen />);
    const labels = ['Stems', 'History', 'Review', 'Progress', 'Settings', 'Export', 'Import', 'About'];
    const fills = labels.map((label) =>
      StyleSheet.flatten(screen.getByRole('link', { name: label }).props.style).backgroundColor,
    );
    // Asserted symbolically (house rule since the palette round): every tile
    // reads the same theme token — no per-tile special case (v13 issue 05).
    expect(new Set(fills)).toEqual(new Set([Colors.light.backgroundElement]));
  });

  it('has a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Stems')).toBeTruthy();
    // o11: the tile grid renders as links with label-pinned names.
    expect(screen.getByRole('link', { name: 'Stems' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'History' })).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Progress')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('keeps every tile label on one line', () => {
    render(<HomeScreen />);
    // v14 issue 12: "Progress" wrapped a lone "s" at narrow widths — the
    // contract is that NO tile label wraps (numberOfLines pinned here; the
    // one-line rendering itself is verified by capture at 320pt).
    const labels = ['Stems', 'History', 'Review', 'Progress', 'Settings', 'Export', 'Import', 'About'];
    labels.forEach((label) => {
      expect(screen.getByText(label).props.numberOfLines).toBe(1);
    });
  });

  it('hosts the splash entrance sequence', () => {
    render(<HomeScreen />);
    // v14 issue 01: the home screen mounts the (self-dismissing) entrance
    // overlay; the mock above stands in for its timers.
    expect(screen.getByTestId('splash-sequence')).toBeTruthy();
  });

  it('pins the nav dock outside the scrolling content, below it', () => {
    // Packet-3 t2a (packet-2 C1): the grid used to be the last block INSIDE
    // the home ScrollView — on a 320x640 viewport it landed below the fold
    // (first row ~83% clipped at initial scroll, a11y bounds inverted,
    // 16/16 tap probes dead: p2n-08/09). Pinned outside the scroll area it
    // is reachable and tappable at any scroll position. What jest can reach
    // is the mechanism (the tiles must not be scroll-content); the on-device
    // tap-probe captures carry the visual half.
    render(<HomeScreen />);
    const tileLabels = ['Stems', 'History', 'Review', 'Progress', 'Settings', 'Export', 'Import', 'About'];
    const json = screen.toJSON() as { type?: string; children?: unknown[] };
    type Node = { type?: string; children?: unknown[] };
    const findScrollAncestry = (node: Node, inScroll: boolean, visit: (tile: Node, inside: boolean) => void): void => {
      const nowInScroll = inScroll || /Scroll/i.test(node.type ?? '');
      if (typeof node === 'string') return;
      (node.children ?? []).forEach((child) => {
        if (typeof child === 'string') {
          if (tileLabels.includes(child)) visit(node, nowInScroll);
          return;
        }
        findScrollAncestry(child as Node, nowInScroll, visit);
      });
    };
    let insideCount = 0;
    let seen = 0;
    findScrollAncestry(json, false, (_tile, inside) => {
      seen += 1;
      if (inside) insideCount += 1;
    });
    expect(seen).toBe(tileLabels.length);
    expect(insideCount).toBe(0);
    // The scroll's content container must not carry the vertical centering
    // itself: `justifyContent: 'center'` on an overflowing content container
    // pushes the header above the reachable scroll region (observed at the
    // 440dpi probe — heading below the fold, inverted dump bounds). The
    // centering lives on the inner wrapper instead.
    const findScrollView = (node: Node): Node | null => {
      if (/Scroll/i.test(node.type ?? '')) return node;
      for (const child of (node.children ?? []) as Node[]) {
        if (typeof child === 'string') continue;
        const found = findScrollView(child);
        if (found) return found;
      }
      return null;
    };
    const scrollView = findScrollView(json);
    expect(scrollView).not.toBeNull();
    const contentContainer = StyleSheet.flatten(
      (scrollView as { props?: { contentContainerStyle?: unknown } }).props?.contentContainerStyle,
    ) as { justifyContent?: string };
    expect(contentContainer.justifyContent).toBeUndefined();
  });

  it('shrinks the header brand block below the 320dp floor so the title fits its line', () => {
    // Packet-3 t2b (packet-2 C5 half): at the 440dpi probe geometry
    // (~116x186dp viewport) the 32dp title could not fit the ~68dp content
    // column and Android broke "AwareMe" mid-word, clipping it to "Awa"
    // (p2n-28a). "AwareMe" measured 135dp wide at fontSize 32 (p2n-08 dump,
    // heading bounds [92,136][227,180]), so the fitted size must keep
    // fontSize x 135/32 within the measured content width.
    setTestWindow(116, 186, 2.75);
    render(<HomeScreen />);
    const title = screen.getByText('AwareMe');
    const flattened = StyleSheet.flatten(title.props.style) as { fontSize?: number };
    const contentWidth = 116 - Spacing.four * 2;
    expect((flattened.fontSize ?? 32) * (135 / 32)).toBeLessThanOrEqual(contentWidth + 0.5);
    // The icon shrinks with the same block — it may not claim the narrow
    // viewport at its fixed 76dp either.
    const icon = screen.getByTestId('home-app-icon');
    const iconStyle = StyleSheet.flatten(icon.props.style) as { width?: number };
    expect(iconStyle.width ?? 76).toBeLessThan(76);
    // The dock yields by the same factor below the floor: a fixed-dp dock
    // (three ~66dp rows) alone overflows the ~186dp probe viewport and
    // pushes the header off-screen (verified on-device, first 440 after-pass).
    const dockLabel = StyleSheet.flatten(screen.getByText('Stems').props.style) as {
      fontSize?: number;
    };
    expect(dockLabel.fontSize ?? 16).toBeLessThan(16);
  });

  it('keeps the header at its designed sizes at and above the 320dp floor', () => {
    // Density independence is a floor-shrink, not a rescale: at the 320dp
    // floor and every larger viewport the header renders exactly as before.
    setTestWindow(320, 640);
    render(<HomeScreen />);
    const flattened = StyleSheet.flatten(screen.getByText('AwareMe').props.style) as {
      fontSize?: number;
      lineHeight?: number;
    };
    expect(flattened.fontSize).toBe(32);
    expect(flattened.lineHeight).toBe(44);
    const iconStyle = StyleSheet.flatten(screen.getByTestId('home-app-icon').props.style) as {
      width?: number;
    };
    expect(iconStyle.width).toBe(76);
    // Dock tiles ride the same scale: at the floor they are untouched.
    const dockLabel = StyleSheet.flatten(screen.getByText('Stems').props.style) as {
      fontSize?: number;
    };
    expect(dockLabel.fontSize).toBe(16);
  });

  it('keeps the review action link out of the metadata ink', () => {
    // Packet-3 t6 (packet-2 cluster 11, p2f-27): "Review available" is a
    // tappable action while "N sessions this week" is inert metadata — the
    // pre-fix tree rendered both `small`/400 in `textSecondary` (audit:
    // "same weight for different information types"). The link text now
    // reads full ink. Accent stays off the TEXT (accent clears AA only on
    // `background`, 4.35:1 on the card's `backgroundElement` fill — the
    // 2026-09-15 review finding); the chevron keeps the accent affordance.
    render(<HomeScreen />);
    const review = StyleSheet.flatten(screen.getByText('Review available').props.style) as {
      color?: string;
    };
    expect(review.color).toBe(Colors.light.text);
    // The inert counters keep the secondary ink — the distinction is the point.
    const metadata = StyleSheet.flatten(screen.getByText('1 session this week').props.style) as {
      color?: string;
    };
    expect(metadata.color).toBe(Colors.light.textSecondary);
  });

  it('separates the practice card into state, action, and metadata groups', () => {
    // Packet-3 t6 (packet-2 cluster 11, p2f-27): the state line, the CTA,
    // and the metadata footer sat in one uniformly-spaced block (the card's
    // base 8dp gap everywhere), so the completion message read as the
    // button's caption ("overlay pattern creates hierarchy confusion",
    // audit-hierarchy-typography.md p2f-27). The action row and the
    // metadata footer carry their own top margin on top of the base gap:
    // 16dp of separation around the CTA vs 8dp inside the state group and
    // 4dp inside the metadata group — three proximity groups, three type
    // treatments (subtitle 600 state / filled CTA / small 400 metadata).
    render(<HomeScreen />);
    const json = screen.toJSON() as { type?: string; children?: unknown[] };
    type JsonNode = { type?: string; props?: { style?: unknown }; children?: unknown[] };
    // Node chain whose LAST node directly contains the marker string.
    const chainToText = (node: JsonNode, text: string, chain: JsonNode[]): JsonNode[] | null => {
      const next = [...chain, node];
      for (const child of (node.children ?? []) as unknown[]) {
        if (typeof child === 'string') {
          if (child === text) return next;
          continue;
        }
        const found = chainToText(child as JsonNode, text, next);
        if (found) return found;
      }
      return null;
    };
    // Button label chain: [..., startRow View, Pressable host, Text] — the
    // action row is two hosts above the label text.
    const startChain = chainToText(json, 'Start morning practice', []);
    expect(startChain).not.toBeNull();
    const startRow = startChain![startChain!.length - 3] as JsonNode;
    expect(StyleSheet.flatten(startRow.props?.style)).toMatchObject({ marginTop: Spacing.two });
    // Metadata chain: [..., statusFooter View, Text].
    const metaChain = chainToText(json, '1 session this week', []);
    expect(metaChain).not.toBeNull();
    const footer = metaChain![metaChain!.length - 2] as JsonNode;
    expect(StyleSheet.flatten(footer.props?.style)).toMatchObject({ marginTop: Spacing.two });
  });

  it('renders the practice state as the card headline (subtitle role)', () => {
    // Regression guard (green pre-fix): the state line is the card's one
    // 600-weight headline — the practice-state text must not drift toward a
    // metadata treatment while the groups are being separated. The default
    // stub tree renders "1 stem ready" as the state line; same node either way.
    render(<HomeScreen />);
    const stateText =
      screen.queryByText('Morning practice complete') ?? screen.getByText('1 stem ready');
    const flattened = StyleSheet.flatten(stateText.props.style) as {
      fontWeight?: string;
      fontSize?: number;
      lineHeight?: number;
    };
    expect(flattened.fontWeight).toBe('600');
    expect(flattened.fontSize).toBe(20);
    expect(flattened.lineHeight).toBe(30);
  });

  it('has a tappable creator footer', () => {
    render(<HomeScreen />);
    expect(screen.getByText("Created by Nicolo’ Brandizzi")).toBeTruthy();
  });

  it('opens the creator site with the app tag', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockImplementation(async () => {});
    render(<HomeScreen />);

    // Issue 09: the footer link carries `utm_source=awareme`.
    fireEvent.press(screen.getByText("Created by Nicolo’ Brandizzi"));
    expect(openURL).toHaveBeenCalledWith('https://nicolobrandizzi.com/?utm_source=awareme');
  });
});
