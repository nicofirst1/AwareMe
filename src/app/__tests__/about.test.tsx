import { render, screen } from '@testing-library/react-native';

import AboutScreen from '@/app/about';

// Same pattern as `progress.test.tsx`: no real navigation tree in a bare
// render, so `useRouter`/`BackHeader` need a stub `back`/`push`.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

describe('AboutScreen', () => {
  it('renders app identity, version, and both links', () => {
    render(<AboutScreen />);

    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText(/Six Endings is a quiet place/)).toBeTruthy();
    expect(screen.getByText(/Version/)).toBeTruthy();
    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByText('Created by Nicolò Brandizzi')).toBeTruthy();
  });

  it('renders both links as standard link rows (layout audit A1)', () => {
    render(<AboutScreen />);

    // A1: label left, chevron in the reserved right slot — the rows keep
    // `accessibilityRole="link"` with the row label as the accessible name.
    expect(screen.getByRole('link', { name: 'About the method' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Created by Nicolò Brandizzi' })).toBeTruthy();
    // The header's back affordance is the only other link on the screen.
    expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy();
  });
});
