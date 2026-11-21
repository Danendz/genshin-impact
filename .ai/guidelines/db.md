# packages/db (@gi/db)

Drizzle ORM 0.45 on postgres.js, drizzle-kit for migrations, Postgres 17. Exports the schema, `createDb`, and `@gi/db/test-utils`.

## Schema (`src/schema.ts`)

- The schema lives in one file. Columns are camelCase in TypeScript and snake_case in SQL (`casing: 'snake_case'` in drizzle.config). Don't pass explicit column names.
- Enums for game values come from `@gi/shared` (`ELEMENTS`, `WEAPON_TYPES`, `LOCALES`), so the DB, API and web share one list. Add a value in shared first, then generate a migration.
- Translations live in `<entity>_i18n` tables keyed by `(entityId, locale)`, with `onDelete: 'cascade'`. Flexible game payloads go in a `details jsonb`.
- Media goes in `media_assets`, keyed by `(ownerType, ownerId, kind, variant)`. `variant` is `''` for one-per-owner kinds. Store R2 keys and content hashes, never URLs.
- Every mutable table gets `updatedAt: updatedAt()`. Hash columns (`sourceHash`, `detailHash`, `sourceHashes`) drive incremental sync.
- Give non-obvious columns a short `/** doc comment */` explaining meaning and null semantics, as the existing ones do.

## Migrations

1. Edit `src/schema.ts`.
2. Run `pnpm --filter @gi/db db:generate`. drizzle-kit writes `migrations/NNNN_<name>.sql` plus `meta/`. Commit both.
3. Read the generated SQL. Drizzle sometimes produces destructive renames: a drop plus an add where you meant a rename. Fix the SQL or split the change.
4. Run `pnpm --filter @gi/db db:migrate` against the local DB, then run the tests.

- Never edit a migration that is already on `master`. Add a new one.
- Migrations run automatically before each Railway deploy (api, sync and models-sync), so they must be safe while the old code is still running. Add nullable or defaulted columns first and tighten later. No long locks on big tables.
- Adding a value to a Postgres enum is fine. Removing or renaming one needs a planned migration, so ask first.
- Never run migrations against the prod DB yourself (see AGENTS.md).

## Tests

- `setupTestDatabase(suffix)` creates and migrates `gi_test_<suffix>`, and `resetDb(db)` truncates every table. Each package's `vitest.global-setup.ts` provides `dbUrl`.
- Schema tests (`schema.test.ts`) cover constraints: uniqueness, cascades, defaults. Add one for each new constraint.
- Run: `pnpm vitest run --project db`.
