import { getRandomBytes } from 'expo-crypto';

import { uuidv7 } from './uuidv7';

/** A fresh UUIDv7 primary key, using real randomness. Use for every row id. */
export function newId(): string {
  return uuidv7(Date.now(), getRandomBytes);
}
