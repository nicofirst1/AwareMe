import { randomBytes } from 'node:crypto';

/**
 * Node stand-in for `expo-crypto` (scripts only): the real module is a
 * native binding that only runs on-device/simulator. The seed script below
 * runs under plain Node, so `@/db/id.ts`'s UUIDv7 randomness is served by
 * Node's own crypto — same guarantee (real random bytes), no native code.
 */
export function getRandomBytes(byteCount: number): Uint8Array {
  return new Uint8Array(randomBytes(byteCount));
}