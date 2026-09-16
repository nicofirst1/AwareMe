import { fireEvent, render, screen } from '@testing-library/react-native';

import * as Linking from 'expo-linking';

import AboutMethodScreen from '@/app/about-method';

// Same pattern as `about.test.tsx`: no real navigation tree in a bare
// render, so `BackHeader`'s `useRouter` needs a stub `back`/`push`. The
// book-title links go through `expo-linking`'s `openURL`, mocked here so
// the exact URL can be asserted without leaving the test process.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

describe('AboutMethodScreen', () => {
  it('renders prose plus both book titles as links announcing the website', () => {
    render(<AboutMethodScreen />);

    expect(screen.getByText('About the method')).toBeTruthy();
    expect(
      screen.getByText(/sentence completion, a self-reflection technique developed by the psychologist/),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'The Six Pillars of Self-Esteem, opens the nathanielbranden.com website',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('link', {
        name: 'The Art of Living Consciously, opens the nathanielbranden.com website',
      }),
    ).toBeTruthy();
    // The header's back affordance is the other link on the screen.
    expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy();
  });

  it('opens nathanielbranden.com when a title link is pressed', () => {
    render(<AboutMethodScreen />);

    fireEvent.press(
      screen.getByRole('link', {
        name: 'The Art of Living Consciously, opens the nathanielbranden.com website',
      }),
    );

    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith('https://nathanielbranden.com/');
  });
});
