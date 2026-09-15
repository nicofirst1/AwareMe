import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ScreenHeader } from '@/components/screen-header';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: () => mockBack() }),
}));

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
});
