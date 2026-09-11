import { fireEvent, render, screen } from '@testing-library/react-native';

import { Button } from '@/components/button';

describe('Button', () => {
  it.each(['primary', 'secondary', 'text'] as const)('renders the %s variant with its label', (variant) => {
    render(<Button label="Start writing" onPress={() => {}} variant={variant} />);
    expect(screen.getByText('Start writing')).toBeTruthy();
  });

  it('fires onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', () => {
    const onPress = jest.fn();
    render(<Button label="Save" onPress={onPress} disabled />);
    fireEvent.press(screen.getByText('Save'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
  });
});
