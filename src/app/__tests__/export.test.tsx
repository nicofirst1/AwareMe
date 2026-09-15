import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import ExportScreen from '@/app/export';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

const mockExportAndShare = jest.fn().mockResolvedValue(undefined);
jest.mock('@/export/fileExport', () => ({
  exportAndShare: (...args: unknown[]) => mockExportAndShare(...args),
}));

jest.mock('@/db', () => ({
  getDatabase: () => ({ mockDatabase: true }),
}));

describe('ExportScreen', () => {
  it('renders the ScreenHeader and all three lossless formats', () => {
    render(<ExportScreen />);

    expect(screen.getByText('Export')).toBeTruthy();
    expect(screen.getByLabelText('Back')).toBeTruthy();
    expect(screen.getByText('SQLite database')).toBeTruthy();
    expect(screen.getByText('JSON bundle')).toBeTruthy();
    expect(screen.getByText('CSV set (zipped)')).toBeTruthy();
  });

  it('hands the opened database to the format builder (second tap is the share, §8)', async () => {
    render(<ExportScreen />);

    fireEvent.press(screen.getByText('SQLite database'));
    await waitFor(() => {
      expect(mockExportAndShare).toHaveBeenCalledWith({ mockDatabase: true }, 'sqlite');
    });
  });
});
