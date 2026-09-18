import { MIGRATION_0001_INITIAL } from './0001_initial';
import { MIGRATION_0002_ENDINGS_FTS } from './0002_endings_fts';
import { MIGRATION_0003_STEMS_TIME_OF_DAY } from './0003_stems_time_of_day';
import { MIGRATION_0004_OFFICIAL_PROGRAMME } from './0004_official_programme';
import { MIGRATION_0005_STEM_CATEGORIES } from './0005_stem_categories';
import { MIGRATION_0006_EVENING_META_TIME_OF_DAY } from './0006_evening_meta_time_of_day';
import { MIGRATION_0007_EVENING_PRACTICE_STARTER_SET } from './0007_evening_practice_starter_set';

/** One numbered migration: `version` is the `schema_version` it upgrades to. */
export interface Migration {
  version: number;
  sql: string;
}

/**
 * Every schema change is a new entry here, in ascending version order.
 * Never edit a past migration's `sql` after it has shipped — add a new one.
 */
export const MIGRATIONS: readonly Migration[] = [
  { version: 1, sql: MIGRATION_0001_INITIAL },
  { version: 2, sql: MIGRATION_0002_ENDINGS_FTS },
  { version: 3, sql: MIGRATION_0003_STEMS_TIME_OF_DAY },
  { version: 4, sql: MIGRATION_0004_OFFICIAL_PROGRAMME },
  { version: 5, sql: MIGRATION_0005_STEM_CATEGORIES },
  { version: 6, sql: MIGRATION_0006_EVENING_META_TIME_OF_DAY },
  { version: 7, sql: MIGRATION_0007_EVENING_PRACTICE_STARTER_SET },
];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
