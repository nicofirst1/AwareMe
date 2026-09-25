import { fireEvent, render, screen } from '@testing-library/react-native';

import * as Linking from 'expo-linking';

import AboutScreen from '@/app/about';

// Same pattern as `progress.test.tsx`: no real navigation tree in a bare
// render, so `useRouter`/`BackHeader` need a stub `back`/`push`. The
// programme link goes through `expo-linking`'s `openURL`, mocked here so
// the exact URL can be asserted without leaving the test process.
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
}));
jest.mock('expo-linking', () => ({
  openURL: jest.fn(),
}));

describe('AboutScreen', () => {
  it('renders app identity, version, both links, framing, and attribution', () => {
    render(<AboutScreen />);

    expect(screen.getByText('About')).toBeTruthy();
    expect(screen.getByText(/AwareMe is a quiet place/)).toBeTruthy();
    expect(screen.getByText(/Version/)).toBeTruthy();
    expect(screen.getByText('About the method')).toBeTruthy();
    expect(screen.getByText('Created by Nicolo\' Brandizzi')).toBeTruthy();

    // §5.1 amendment (c04): method framing — Branden's sentence completion,
    // an exercise for self-esteem and increased self-awareness.
    expect(
      screen.getByText(
        /sentence completion, developed by psychologist Nathaniel Branden as an exercise for\s+self-esteem and increased self-awareness/, //
      ),
    ).toBeTruthy();

    // §5.1 amendment (c04): permission attribution, per the issue's wording sketch.
    expect(
      screen.getByText(
        /used with permission from Leigh Branden\. Method and original\s+programme: Nathaniel Branden, nathanielbranden\.com\./, //
      ),
    ).toBeTruthy();
  });

  it('renders the four links as standard link rows (layout audit A1, p8-t2)', () => {
    render(<AboutScreen />);

    // A1: label left, chevron in the reserved right slot — the rows keep
    // `accessibilityRole="link"` with the row label as the accessible name.
    // p8-t2 adds the replay entry as the first row of the block.
    expect(screen.getByRole('link', { name: 'Show the introduction from your first launch' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'About the method' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Created by Nicolo\' Brandizzi' })).toBeTruthy();
    // The header's back affordance is the only other link on the screen.
    expect(screen.getByRole('link', { name: 'Back' })).toBeTruthy();
  });

  it('pushes the read-only onboarding replay from the Show introduction row (p8-t2)', () => {
    render(<AboutScreen />);

    // p8-t2, owner-approved mechanics: the row is one more link row; the
    // `replay=1` route param is the whole re-entry mechanism (no new
    // storage) — onboarding renders the flow read-only and returns here.
    const row = screen.getByRole('link', { name: 'Show the introduction from your first launch' });
    fireEvent.press(row);

    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/onboarding', params: { replay: '1' } });
  });

  it('programme link opens the official URL and announces it opens the website', () => {
    render(<AboutScreen />);

    // The accessible label states that the row opens the website, per the
    // §5.1 amendment's acceptance bullet — not just "The official programme".
    const row = screen.getByRole('link', {
      name: 'The official programme, opens the nathanielbranden.com website',
    });
    expect(row).toBeTruthy();

    fireEvent.press(row);
    expect(Linking.openURL).toHaveBeenCalledTimes(1);
    expect(Linking.openURL).toHaveBeenCalledWith('https://nathanielbranden.com/sentence-completion-i/');
  });

  it('creator link opens the site with the app tag', () => {
    render(<AboutScreen />);

    // Issue 09: the app’s outbound link carries `utm_source=awareme`.
    const row = screen.getByRole('link', { name: 'Created by Nicolo\' Brandizzi' });
    fireEvent.press(row);
    expect(Linking.openURL).toHaveBeenCalledWith('https://nicolobrandizzi.com/?utm_source=awareme');
  });
});
