import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
}));

/**
 * Packet-3 t6 (packet-2 cluster 7, p2n-25): at a 320dp viewport the Stems
 * screen's title row held a ~96dp-wide "Stems" (fontSize 32) AND 189dp of
 * trailing Import/Add buttons in a 272dp content column — the row squeezed
 * the title to 83dp and Android broke it mid-word ("Stem"/"s"; the banked
 * dump's heading node [24,92][107,180] is 88px tall = two 44px lines, 559
 * dark glyph px in the box). The title row now wraps: the trailing action
 * yields its own line and the title keeps its full one-line width. A
 * single-word title can never word-wrap, so a title that never loses width
 * never breaks mid-word.
 */
const chainToText = (
  node: { type?: string; props?: { style?: unknown }; children?: unknown[] },
  text: string,
  chain: { type?: string; props?: { style?: unknown }; children?: unknown[] }[],
): { type?: string; props?: { style?: unknown }; children?: unknown[] }[] | null => {
  const next = [...chain, node];
  for (const child of (node.children ?? []) as unknown[]) {
    if (typeof child === 'string') {
      if (child === text) return next;
      continue;
    }
    const found = chainToText(child as typeof node, text, next);
    if (found) return found;
  }
  return null;
};

describe('ScreenHeader', () => {
  beforeEach(() => mockBack.mockClear());

  it('renders the title and the default "Back" label', () => {
    render(<ScreenHeader title="Stems" />);
    expect(screen.getByText('Stems')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  it('renders a custom back label', () => {
    render(<ScreenHeader title="Edit stem" backLabel="Close" />);
    expect(screen.getByLabelText('Close')).toBeTruthy();
  });

  it('navigates back when the back row is pressed', () => {
    render(<ScreenHeader title="Stems" />);
    fireEvent.press(screen.getByLabelText('Back'));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('renders a trailing action', () => {
    render(<ScreenHeader title="Stems" trailingAction={<Text>Add</Text>} />);
    expect(screen.getByText('Add')).toBeTruthy();
  });

  it('yields the title row to the trailing action instead of squeezing the title below its word width', () => {
    // Packet-3 t6 (cluster 7): Stems-screen geometry at 320dp — the two
    // text-variant buttons measured 189dp together in the p2n-25 dump
    // (Import [107,114][203,158] + Add [219,114][296,158] inside the group
    // [107,114][296,158]).
    render(
      <ScreenHeader
        title="Stems"
        trailingAction={<View style={{ width: 189, height: 44, flexDirection: 'row' }} />}
      />,
    );
    const chain = chainToText(screen.toJSON() as never, 'Stems', []);
    expect(chain).not.toBeNull();
    // The title text's parent is the titleRow View.
    const titleRow = chain![chain!.length - 2];
    expect(StyleSheet.flatten(titleRow.props?.style)).toMatchObject({ flexWrap: 'wrap' });
    // The title keeps its flexShrink safety net for titles wider than the
    // whole column (pre-existing semantics, unchanged).
    expect(StyleSheet.flatten(screen.getByText('Stems').props.style)).toMatchObject({
      flexShrink: 1,
    });
  });

  it('keeps the wrap available when the trailing action fits beside the title', () => {
    // A narrow trailing action leaves the title in place — the wrap only
    // engages when the row would otherwise squeeze the title (device proof:
    // Stems screen at 480dp, heading one line before AND after).
    render(<ScreenHeader title="History" trailingAction={<View style={{ width: 40, height: 44 }} />} />);
    const chain = chainToText(screen.toJSON() as never, 'History', []);
    expect(chain).not.toBeNull();
    const titleRow = chain![chain!.length - 2];
    expect(StyleSheet.flatten(titleRow.props?.style)).toMatchObject({ flexWrap: 'wrap' });
    expect(screen.getByText('History')).toBeTruthy();
  });
});
