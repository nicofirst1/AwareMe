import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { FilterChip } from '@/components/filter-chip';

describe('FilterChip', () => {
  it('renders plain, category, and color variants and fires onPress', () => {
    const onPress = jest.fn();
    render(<FilterChip label="Awareness" selected onPress={onPress} category="awareness" />);
    expect(screen.getByText('Awareness')).toBeTruthy();

    render(<FilterChip label="Active" selected={false} onPress={onPress} />);
    render(<FilterChip label="Custom" selected onPress={onPress} color={{ bg: '#F6EAE4', text: '#B5541A' }} />);

    fireEvent.press(screen.getByText('Custom'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  // v13-feedback issue 07: one chip anatomy for every variant. The
  // selected/unselected distinction is never color alone (colorblind users):
  // the checkmark appears only on the selected chip, and unselected chips
  // lose the tinted fill (outline-only), so a shape cue and a fill cue change
  // together. `hue` resolves a named Palette hue per theme (the stems
  // screen's Morning/Evening/Programme filters).
  it('marks only the selected chip with the checkmark, hue variant included', () => {
    const onPress = jest.fn();
    const { rerender } = render(<FilterChip label="Morning" selected onPress={onPress} hue="amber" />);
    expect(screen.getByTestId('filter-chip-checkmark')).toBeTruthy();
    expect(screen.getByLabelText('Morning').props.accessibilityState).toMatchObject({ selected: true });

    rerender(<FilterChip label="Morning" selected={false} onPress={onPress} hue="amber" />);
    expect(screen.queryByTestId('filter-chip-checkmark')).toBeNull();
    expect(screen.getByLabelText('Morning').props.accessibilityState).toMatchObject({ selected: false });
  });

  // packet-3 t8 (C4): Android's minimum touch target is 48dp effective.
  // Measured review chips were 44 high, and short numeric labels ("7") land
  // below 48 wide — so both axes bind on the shared chip.
  it('touch target clears the Android 48dp minimum on both axes', () => {
    render(<FilterChip label="7" selected={false} onPress={() => {}} />);
    const style = StyleSheet.flatten(screen.getByLabelText('7').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
    expect(style.minWidth).toBeGreaterThanOrEqual(48);
  });
});
