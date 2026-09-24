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

  // p8-t2 replay contract: `disabled` renders both buttons disabled at the
  // app's 0.5 step (the button.tsx idiom) and presses never fire; the
  // default (prop omitted) stays enabled — settings' sole consumer keeps
  // its behavior unchanged.
  it('disabled renders both buttons inert at the 0.5 step; the default stays enabled', () => {
    const onChange = jest.fn();
    render(
      <StepperRow label="Endings per session" value={7} rangeKey="endings_per_session" onChange={onChange} disabled />,
    );

    for (const label of ['Decrease Endings per session', 'Increase Endings per session']) {
      const button = screen.getByLabelText(label);
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      expect(StyleSheet.flatten(button.props.style).opacity).toBe(0.5);
    }
    fireEvent.press(screen.getByLabelText('Increase Endings per session'));
    expect(onChange).not.toHaveBeenCalled();

    render(<StepperRow label="Plain" value={7} rangeKey="endings_per_session" onChange={onChange} />);
    expect(screen.getByLabelText('Increase Plain').props.accessibilityState).toMatchObject({ disabled: false });
    expect(StyleSheet.flatten(screen.getByLabelText('Increase Plain').props.style).opacity).toBeUndefined();
  });
});
