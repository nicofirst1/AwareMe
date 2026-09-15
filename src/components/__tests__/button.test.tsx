import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/button';
import { Colors } from '@/constants/theme';

describe('Button', () => {
  it.each(['primary', 'secondary', 'text'] as const)('renders the %s variant with its label', (variant) => {
    render(<Button label="Start writing" onPress={() => {}} variant={variant} />);
    expect(screen.getByText('Start writing')).toBeTruthy();
  });

  it('secondary variant carries a hairline border so it stays defined on same-fill surfaces', () => {
    render(<Button label="Save" onPress={() => {}} variant="secondary" />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.borderWidth).toBe(1);
    // Scheme is 'unspecified' in tests → light fallback (use-theme.ts).
    expect(style.borderColor).toBe(Colors.light.border);
  });

  it.each(['primary', 'text'] as const)('%s variant stays borderless', (variant) => {
    render(<Button label="Save" onPress={() => {}} variant={variant} />);
    const style = StyleSheet.flatten(screen.getByRole('button').props.style);
    expect(style.borderWidth).toBeUndefined();
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
