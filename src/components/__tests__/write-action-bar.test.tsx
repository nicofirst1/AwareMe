import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { WriteActionBar } from '@/components/write-action-bar';
import { Colors, Radius } from '@/constants/theme';

function renderBar() {
  return render(
    <WriteActionBar value="" onChangeText={jest.fn()} onSubmitEditing={jest.fn()} onDone={jest.fn()} />,
  );
}

// Packet-3 t5 (p2f-04/p2n-13/p2f-05, rollup cluster 2): the writing input
// rendered as bare text with only a cursor — no visual container told the
// user where writing happens. These render-level assertions pin the field
// treatment the fix ships: a filled surface plus a control outline, both
// straight from the DESIGN.md tokens (backgroundElement fill, borderStrong
// boundary at Radius.small — "buttons, inputs" per the radius scale).
describe('WriteActionBar — input field affordance', () => {
  it('renders the input inside a bordered, filled field container', () => {
    renderBar();
    const input = screen.getByLabelText('Your ending');
    const style = StyleSheet.flatten(input.props.style);

    expect(style.borderWidth).toBeGreaterThan(0);
    expect(style.borderColor).toBe(Colors.light.borderStrong);
    expect(style.borderRadius).toBe(Radius.small);
    expect(style.backgroundColor).toBe(Colors.light.backgroundElement);
  });

  it('keeps the writing face and the generous writing height inside the container', () => {
    renderBar();
    const input = screen.getByLabelText('Your ending');
    const style = StyleSheet.flatten(input.props.style);

    expect(style.fontFamily).toBeDefined();
    expect(style.fontSize).toBe(22);
    expect(style.minHeight).toBe(80);
  });
});
