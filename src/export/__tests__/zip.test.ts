import { buildZip } from '../zip';

/**
 * Minimal STORE-only unzip, test-only: reads back exactly what `buildZip`
 * writes, so the round-trip is verified against the real ZIP byte layout
 * rather than trusting `buildZip`'s own bookkeeping. Not shipped — the app
 * never reads a zip back in (see zip.ts's own comment).
 */
function readStoredEntries(zip: Uint8Array): { name: string; content: string }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const entries: { name: string; content: string }[] = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const name = decoder.decode(zip.slice(nameStart, nameStart + nameLength));
    const content = decoder.decode(zip.slice(dataStart, dataStart + compressedSize));
    entries.push({ name, content });
    offset = dataStart + compressedSize;
  }
  return entries;
}

describe('buildZip', () => {
  it('round-trips entries byte-for-byte, including text with newlines and unicode', () => {
    const entries = [
      { name: 'stems.csv', content: 'id,text\r\n1,"hello, world"\r\n' },
      { name: 'endings.csv', content: 'text\r\n"line one\nline two"\r\n' },
      { name: 'README.md', content: '# Notes\n\nWith émoji 🎉 and ünicode.' },
    ];
    const zip = buildZip(entries);
    expect(readStoredEntries(zip)).toEqual(entries);
  });

  it('produces a valid end-of-central-directory record with the right entry count', () => {
    const zip = buildZip([{ name: 'a.txt', content: 'hi' }]);
    const view = new DataView(zip.buffer);
    // Find EOCD signature from the end (no comment, so it's the last 22 bytes).
    const eocdOffset = zip.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    expect(view.getUint16(eocdOffset + 8, true)).toBe(1); // entries on this disk
    expect(view.getUint16(eocdOffset + 10, true)).toBe(1); // total entries
  });

  it('handles an empty entry list', () => {
    const zip = buildZip([]);
    expect(readStoredEntries(zip)).toEqual([]);
  });

  it('handles empty file content', () => {
    const zip = buildZip([{ name: 'empty.csv', content: '' }]);
    expect(readStoredEntries(zip)).toEqual([{ name: 'empty.csv', content: '' }]);
  });
});
