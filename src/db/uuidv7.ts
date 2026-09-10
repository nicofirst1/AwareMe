/**
 * UUIDv7 (RFC 9562): a chronologically sortable UUID.
 * Layout: 48-bit big-endian Unix ms timestamp, then version/variant bits,
 * then 74 bits of randomness.
 *
 * Pure and deterministic given `now` and `randomBytes`, so it's unit
 * testable without touching a native module. Production callers should use
 * `newId()` in `id.ts`, which binds this to `expo-crypto`.
 */
export function uuidv7(now: number, randomBytes: (n: number) => Uint8Array): string {
  const bytes = new Uint8Array(16);
  const rand = randomBytes(10);

  // 48-bit ms timestamp, big-endian, into bytes[0..5]
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  // bytes[6..15]: 10 random bytes, with version/variant bits overlaid
  bytes.set(rand, 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
