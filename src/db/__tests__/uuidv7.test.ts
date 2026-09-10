import { uuidv7 } from '../uuidv7';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function zeroBytes(n: number): Uint8Array {
  return new Uint8Array(n);
}

function fixedRandomBytes(seed: number) {
  return (n: number): Uint8Array => {
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) out[i] = (seed + i) % 256;
    return out;
  };
}

describe('uuidv7', () => {
  it('produces a well-formed UUIDv7 (version 7, RFC 4122 variant)', () => {
    const id = uuidv7(Date.now(), zeroBytes);
    expect(id).toMatch(UUID_RE);
  });

  it('is deterministic given the same time and randomness', () => {
    const now = 1_700_000_000_000;
    const a = uuidv7(now, fixedRandomBytes(1));
    const b = uuidv7(now, fixedRandomBytes(1));
    expect(a).toBe(b);
  });

  it('sorts chronologically by generation time', () => {
    const earlier = uuidv7(1_700_000_000_000, fixedRandomBytes(7));
    const later = uuidv7(1_700_000_001_000, fixedRandomBytes(3));
    const sorted = [later, earlier].sort();
    expect(sorted).toEqual([earlier, later]);
  });

  it('differs across calls with different randomness at the same ms', () => {
    const now = 1_700_000_000_000;
    const a = uuidv7(now, fixedRandomBytes(1));
    const b = uuidv7(now, fixedRandomBytes(99));
    expect(a).not.toBe(b);
  });

  it('encodes the given timestamp in the first 48 bits', () => {
    const now = 1_700_000_000_123;
    const id = uuidv7(now, zeroBytes);
    const hex = id.replace(/-/g, '');
    const encoded = parseInt(hex.slice(0, 12), 16);
    expect(encoded).toBe(now);
  });
});
