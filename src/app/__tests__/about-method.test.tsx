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
  it('renders the ported intro prose, both book-title links, and the kept honest tail', () => {
    render(<AboutMethodScreen />);

    expect(screen.getByText('About the method')).toBeTruthy();
    // p11 t7-fixes (owner instruction): the intro's "About the method"
    // section IS the opening prose now (verbatim from the shipped intro
    // copy); the two section titles follow; the no-interpretation paragraph
    // and the books paragraph stay (spec §5.1). The old opening paragraphs
    // are superseded; the why-same-stems section is deliberately absent.
    expect(
      screen.getByText(
        /Without self-awareness, we often run on autopilot, reacting to life out of habit,\s+repeating the same mistakes, and feeling confused about why we feel stuck\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText(/This app uses the sentence completion method, developed by psychologist Nathaniel\s+Branden/)).toBeTruthy();
    expect(screen.getByText('How it works')).toBeTruthy();
    expect(screen.getByText(/You’ll get the start of a sentence \(a "stem"\) and finish it several times/)).toBeTruthy();
    expect(screen.getByText("Don’t polish. Don’t overthink. Just write.")).toBeTruthy();
    expect(screen.getByText('Include an evening practice?')).toBeTruthy();
    expect(screen.getByText(/The morning practice brings your hidden thoughts to the surface/)).toBeTruthy();
    expect(
      screen.getByText(/This app does not interpret, score, or comment on what you write/),
    ).toBeTruthy();
    expect(screen.queryByText('Why use the same stems every day?')).toBeNull();
    expect(screen.queryByText(/The value is in the pattern across many endings/)).toBeNull();
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
