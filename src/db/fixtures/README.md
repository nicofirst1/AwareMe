# Migration fixtures

One committed SQLite file per shipped schema version: `schema-vN.db`. Each is a real database at exactly that version, produced by applying migrations `1..N` and nothing past that — never hand-edited.

`src/db/__tests__/migrate.test.ts` is the source of truth for these files: it regenerates any fixture that's missing (`schema-v${CURRENT_SCHEMA_VERSION}.db` must always exist) and then asserts that running `migrate()` against every committed fixture reaches `CURRENT_SCHEMA_VERSION` cleanly. When you add migration N+1, run the test suite once — it writes `schema-v(N+1).db` — then `git add` the new file. Older fixtures stay as they are; they're what proves the new migration upgrades real prior-version data.
