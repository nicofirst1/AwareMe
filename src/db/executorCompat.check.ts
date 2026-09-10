// Type-only compatibility check: a real expo-sqlite SQLiteDatabase must be
// assignable to our SqlExecutor interface, so production code written
// against SqlExecutor works unmodified against the real native module.
import type { SQLiteDatabase } from 'expo-sqlite';

import type { SqlExecutor } from './executor';

declare const db: SQLiteDatabase;
const _check: SqlExecutor = db;
void _check;
