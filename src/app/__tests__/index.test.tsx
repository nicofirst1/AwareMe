import { render, screen } from '@testing-library/react-native';

import HomeScreen from '@/app/index';

describe('HomeScreen', () => {
  it('renders the app name', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Six Endings')).toBeTruthy();
  });

  it('has one primary action and a secondary destination group', () => {
    render(<HomeScreen />);
    expect(screen.getByText('Start writing')).toBeTruthy();
    expect(screen.getByText('Stems')).toBeTruthy();
    expect(screen.getByText('History')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByText('Import')).toBeTruthy();
  });
});
