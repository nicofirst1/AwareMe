import { render } from '@testing-library/react-native';
import { StatusBar } from 'expo-status-bar';

import { AppStatusBar } from '@/components/app-status-bar';

jest.mock('expo-status-bar', () => ({
  StatusBar: jest.fn(() => null),
}));

jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => mockScheme(),
}));

let currentScheme: 'light' | 'dark' = 'light';
function mockScheme(): 'light' | 'dark' {
  return currentScheme;
}

const statusBarMock = jest.mocked(StatusBar);

function lastBarProps(): { style?: string } {
  const last = statusBarMock.mock.calls.at(-1);
  return (last?.[0] ?? {}) as { style?: string };
}

describe('AppStatusBar', () => {
  beforeEach(() => {
    statusBarMock.mockClear();
    currentScheme = 'light';
  });

  it('renders dark status-bar content on the light theme (light backgrounds)', () => {
    currentScheme = 'light';
    render(<AppStatusBar />);
    expect(lastBarProps()).toEqual(expect.objectContaining({ style: 'dark' }));
  });

  it('renders light status-bar content on the dark theme', () => {
    currentScheme = 'dark';
    render(<AppStatusBar />);
    expect(lastBarProps()).toEqual(expect.objectContaining({ style: 'light' }));
  });
});
