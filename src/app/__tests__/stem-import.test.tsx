import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import StemImportScreen from '@/app/stem-import';

// w1-t7 (s2-9, packet-7): bulk import wrote every non-blank line
// unconditionally — no dedupe, no validateStemText — while Add enforces
// both (stem-edit.tsx validateStemText against listStemTexts). The fix
// applies Add's checks IN THE SCREEN: each line is validated against the
// existing texts plus the lines already accepted from this paste
// (intra-paste duplicates), the preview counts only accepted lines, skips
// are reported, and only accepted lines reach bulkImportStems. The
// repository call itself stays unconditional (contract 5: the export
// round-trip seeds through it — adversarialRoundTrip expects 200).
// Failing-first: on the pre-fix screen every assertion below fails at the
// preview count / the bulkImportStems arguments / the missing skip note.
const mockRouter = { push: jest.fn(), back: jest.fn() };

jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));

// Mock-prefixed holder so the hoisted jest.mock factory can reach it
// (same pattern as stems.test.tsx's mockStemsOverride).
const mockExistingTexts: string[] = [];
const mockBulkImportStems = jest.fn((..._args: unknown[]) => 0);

jest.mock('@/db', () => ({
  getRepository: () => ({
    listStemTexts: () => mockExistingTexts,
    bulkImportStems: (...args: unknown[]) => mockBulkImportStems(...args),
  }),
}));

describe('StemImportScreen — Add checks applied to the paste (w1-t7a)', () => {
  // Replace is destructive elsewhere; here commit just reports. Spy so the
  // import alert never fires a real dialog and its button callback runs.
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockExistingTexts.length = 0;
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  const paste = (text: string) => {
    fireEvent.changeText(screen.getByLabelText('Stems to import'), text);
  };

  it('excludes a line that duplicates an existing stem and reports the skip in the preview', () => {
    mockExistingTexts.push('Already in the library');
    render(<StemImportScreen />);

    paste('Already in the library\nA fresh line');

    expect(screen.getByText('1 stem to import')).toBeTruthy();
    expect(screen.getByText('A fresh line')).toBeTruthy();
    expect(screen.getByText('1 line skipped (duplicate or invalid).')).toBeTruthy();
  });

  it('excludes duplicates within the paste itself', () => {
    render(<StemImportScreen />);

    paste('Same line twice\nSame line twice');

    expect(screen.getByText('1 stem to import')).toBeTruthy();

    fireEvent.press(screen.getByText('Import'));
    expect(mockBulkImportStems).toHaveBeenCalledTimes(1);
    expect(mockBulkImportStems.mock.calls[0][0]).toEqual(['Same line twice']);
  });

  it('excludes an over-long line (200 characters or more)', () => {
    render(<StemImportScreen />);

    paste(`${'x'.repeat(200)}\nA fresh line`);

    expect(screen.getByText('1 stem to import')).toBeTruthy();
    expect(screen.getByText('A fresh line')).toBeTruthy();
    expect(screen.getByText('1 line skipped (duplicate or invalid).')).toBeTruthy();
  });

  it('commits exactly the accepted lines, with the chosen category and time of day', () => {
    render(<StemImportScreen />);

    paste('One fresh fixture line\nAnother fresh fixture line');

    expect(screen.getByText('2 stems to import')).toBeTruthy();

    // The spy stands in for the repository's count return (the alert
    // reports it).
    mockBulkImportStems.mockReturnValueOnce(2);
    fireEvent.press(screen.getByText('Import'));
    expect(mockBulkImportStems).toHaveBeenCalledTimes(1);
    expect(mockBulkImportStems).toHaveBeenCalledWith(['One fresh fixture line', 'Another fresh fixture line'], null, null);
    expect(alertSpy).toHaveBeenCalledWith('Imported', 'Added 2 stems.', expect.anything());
  });
});
