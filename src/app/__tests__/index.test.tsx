import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the app name', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Six Endings')).toBeTruthy();
  });
});
