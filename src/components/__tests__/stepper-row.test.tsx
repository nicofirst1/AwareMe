import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { StepperRow } from '@/components/stepper-row';

describe('StepperRow', () => {
  it('renders the label and the current value in one row', () => {
    render(<StepperRow label="Endings per session" value={6} rangeKey="endings_per_session" onChange={() => {}} />);

    expect(screen.getByText('Endings per session')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
    expect(screen.getByLabelText('Decrease Endings per session')).toBeTruthy();
    expect(screen.getByLabelText('Increase Endings per session')).toBeTruthy();
  });

  it('steps by `step` and passes the next value to onChange', () => {
    const onChange = jest.fn();
    render(<StepperRow label="Timer (seconds)" value={90} rangeKey="timer_seconds" step={10} onChange={onChange} />);

    fireEvent.press(screen.getByLabelText('Increase Timer (seconds)'));
    expect(onChange).toHaveBeenLastCalledWith(100);

    fireEvent.press(screen.getByLabelText('Decrease Timer (seconds)'));
    expect(onChange).toHaveBeenLastCalledWith(80);
  });

  it('clamps to the setting range instead of emitting out-of-range values (spec §7)', () => {
    const onChange = jest.fn();
    // endings_per_session range is 6–10; already at both bounds here.
    render(<StepperRow label="Endings per session" value={10} rangeKey="endings_per_session" onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(onChange).toHaveBeenLastCalledWith(10);

    render(<StepperRow label="Low" value={6} rangeKey="endings_per_session" onChange={onChange} />);
    fireEvent.press(screen.getByLabelText('Decrease Low'));
    expect(onChange).toHaveBeenLastCalledWith(6);
  });

  // packet-3 t8 (C4): the −/+ buttons measured 44x44; Android's minimum
  // touch target is 48dp effective on both axes.
  it('stepper buttons clear the Android 48dp minimum on both axes', () => {
    render(<StepperRow label="Timer (seconds)" value={90} rangeKey="timer_seconds" onChange={() => {}} />);
    for (const label of ['Decrease Timer (seconds)', 'Increase Timer (seconds)']) {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
      expect(style.width).toBeGreaterThanOrEqual(48);
      expect(style.height).toBeGreaterThanOrEqual(48);
    }
  });
});
