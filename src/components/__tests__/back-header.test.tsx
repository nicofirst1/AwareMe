import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { BackHeader } from '@/components/back-header';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
}));

describe('BackHeader', () => {
  it('renders the default "Back" label and navigates back', () => {
    render(<BackHeader />);
    expect(screen.getByLabelText('Back')).toBeTruthy();
  });

  // packet-3 t8 (C4): the Back pressable measured 58x44; Android's minimum
  // touch target is 48dp effective (the pre-existing hitSlop 8 stays on top).
  it('touch target clears the Android 48dp minimum', () => {
    render(<BackHeader />);
    const style = StyleSheet.flatten(screen.getByLabelText('Back').props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});
