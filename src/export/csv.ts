/**
 * RFC 4180 CSV encoding (spec §8: "RFC 4180 quoting... newlines inside
 * `endings.text` preserved inside quotes"). Pure string in, string out — no
 * file system, no zip, so it's directly unit-testable.
 */

/** Quotes a field iff it contains a comma, quote, or newline; doubles any embedded quote. Never trims or otherwise alters the value. */
function encodeField(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Renders rows (plain objects) as a CSV document with one header row,
 * columns in `columns` order. `\r\n` line endings per RFC 4180.
 */
export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [columns.map(encodeField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => encodeField(row[c])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
