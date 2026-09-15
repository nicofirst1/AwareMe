import { Alert } from 'react-native';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ImportScreen from '@/app/import';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockPickAndImportBundle = jest.fn().mockResolvedValue({ inserted: 2, skipped: 1 });
jest.mock('@/export/fileImport', () => ({
  pickAndImportBundle: (...args: unknown[]) => mockPickAndImportBundle(...args),
}));

jest.mock('@/db', () => ({
  getDatabase: () => ({ mockDatabase: true }),
}));

describe('ImportScreen', () => {
  // Replace is destructive, so it must pass through the confirm dialog
  // (same pattern as stem deletion); spy on Alert to drive its callback.
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockPickAndImportBundle.mockClear();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('renders the ScreenHeader and both import modes', () => {
    render(<ImportScreen />);

    expect(screen.getByText('Import')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByText('Merge')).toBeTruthy();
    expect(screen.getByText('Replace')).toBeTruthy();
  });

  it('runs a merge import directly (nothing existing is removed)', async () => {
    render(<ImportScreen />);

    fireEvent.press(screen.getByText('Merge'));
    await waitFor(() => {
      expect(mockPickAndImportBundle).toHaveBeenCalledWith({ mockDatabase: true }, 'merge');
    });
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Import complete', 'Added 2 rows, skipped 1 already present.');
    });
  });

  it('confirms before a replace import (destructive, irreversible in-app)', async () => {
    render(<ImportScreen />);

    fireEvent.press(screen.getByText('Replace'));
    expect(alertSpy).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alertSpy.mock.calls[0];
    expect(title).toBe('Replace all data?');
    expect((buttons as { text: string }[]).map((b) => b.text)).toEqual(['Cancel', 'Replace']);

    const replace = (buttons as { text: string; onPress?: () => void }[])[1];
    replace.onPress?.();
    await waitFor(() => {
      expect(mockPickAndImportBundle).toHaveBeenCalledWith({ mockDatabase: true }, 'replace');
    });
  });
});
