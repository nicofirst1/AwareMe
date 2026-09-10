import { toCsv } from '../csv';

describe('toCsv', () => {
  it('renders a header row and one row per record, in column order', () => {
    const csv = toCsv(['id', 'text'], [{ id: '1', text: 'hello' }, { id: '2', text: 'world' }]);
    expect(csv).toBe('id,text\r\n1,hello\r\n2,world\r\n');
  });

  it('quotes a field containing a comma', () => {
    expect(toCsv(['a'], [{ a: 'x,y' }])).toBe('a\r\n"x,y"\r\n');
  });

  it('quotes a field containing a double quote, doubling it', () => {
    expect(toCsv(['a'], [{ a: 'say "hi"' }])).toBe('a\r\n"say ""hi"""\r\n');
  });

  it('quotes and preserves a newline inside a field (e.g. endings.text)', () => {
    const csv = toCsv(['text'], [{ text: 'line one\nline two' }]);
    expect(csv).toBe('text\r\n"line one\nline two"\r\n');
  });

  it('renders null and undefined as empty, not the string "null"', () => {
    expect(toCsv(['a', 'b'], [{ a: null, b: undefined }])).toBe('a,b\r\n,\r\n');
  });

  it('never trims or alters the text itself', () => {
    const csv = toCsv(['text'], [{ text: '  leading and trailing spaces  ' }]);
    expect(csv).toContain('  leading and trailing spaces  ');
  });
});
