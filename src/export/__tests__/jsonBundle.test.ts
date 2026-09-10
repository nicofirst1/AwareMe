import { buildJsonBundle, EXPORT_VERSION, parseJsonBundle, serializeJsonBundle, TableDump } from '../jsonBundle';
import { CURRENT_SCHEMA_VERSION } from '../../db/migrations';

function emptyDump(): TableDump {
  return {
    stems: [],
    sessions: [],
    endings: [],
    reviews: [],
    settings: [],
    notification_schedule: [],
    schema_meta: [],
  };
}

describe('buildJsonBundle', () => {
  it('carries export metadata and the five user-corpus tables, excluding notification_schedule and schema_meta', () => {
    const dump = emptyDump();
    dump.stems = [{ id: 's1', text: 'A stem...' }];
    const bundle = buildJsonBundle(dump, {
      schemaVersion: 2,
      appVersion: '1.0.0',
      exportedAt: '2026-09-10T14:03:22.418Z',
      exportedTz: 'Europe/Berlin',
    });

    expect(bundle.export_version).toBe(EXPORT_VERSION);
    expect(bundle.schema_version).toBe(2);
    expect(bundle.app_version).toBe('1.0.0');
    expect(bundle.exported_at).toBe('2026-09-10T14:03:22.418Z');
    expect(bundle.exported_tz).toBe('Europe/Berlin');
    expect(bundle.stems).toEqual([{ id: 's1', text: 'A stem...' }]);
    expect(Object.keys(bundle)).not.toContain('notification_schedule');
    expect(Object.keys(bundle)).not.toContain('schema_meta');
  });

  it('includes soft-deleted rows as-is, deleted_at intact', () => {
    const dump = emptyDump();
    dump.stems = [{ id: 's1', text: 'gone', deleted_at: '2026-09-11T00:00:00.000Z' }];
    const bundle = buildJsonBundle(dump, { schemaVersion: 2, appVersion: '1.0.0', exportedAt: 'x', exportedTz: 'UTC' });
    expect(bundle.stems[0].deleted_at).toBe('2026-09-11T00:00:00.000Z');
  });
});

describe('parseJsonBundle', () => {
  const validBundle = () =>
    serializeJsonBundle(
      buildJsonBundle(emptyDump(), {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        appVersion: '1.0.0',
        exportedAt: '2026-09-10T00:00:00.000Z',
        exportedTz: 'UTC',
      }),
    );

  it('parses a well-formed bundle', () => {
    const bundle = parseJsonBundle(validBundle());
    expect(bundle.schema_version).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('throws on malformed JSON', () => {
    expect(() => parseJsonBundle('{not json')).toThrow();
  });

  it('throws on valid JSON that is not a bundle', () => {
    expect(() => parseJsonBundle('{"foo": "bar"}')).toThrow(/missing schema_version/);
  });

  it('throws when a required table array is missing', () => {
    const obj = JSON.parse(validBundle());
    delete obj.endings;
    expect(() => parseJsonBundle(JSON.stringify(obj))).toThrow(/endings/);
  });

  it('throws a clear error for a bundle from a newer schema version than this app supports', () => {
    const obj = JSON.parse(validBundle());
    obj.schema_version = CURRENT_SCHEMA_VERSION + 1;
    expect(() => parseJsonBundle(JSON.stringify(obj))).toThrow(/newer/);
  });

  it('accepts an older (but not newer) schema version — no column migration has ever touched the bundle tables', () => {
    const obj = JSON.parse(validBundle());
    obj.schema_version = 1;
    expect(() => parseJsonBundle(JSON.stringify(obj))).not.toThrow();
  });
});
