# apps/api

Node 24, Hono 4, Drizzle (postgres.js), Zod 4, sharp, the AWS S3 SDK (R2), built with tsup. This one package holds the HTTP API and three CLIs (`sync`, `models-sync`, `seed:site`).

## Layout

```
src/
  app.ts            createApp(deps): the Hono app; exports AppType (consumed by web)
  index.ts          server entry: env → db → store → sync controller → serve; graceful shutdown
  env.ts            Zod env schemas: parseEnv (server), parseCliEnv (CLIs)
  routes/           one file per resource: `<x>Route(deps)` returning a Hono sub-app
  media/            MediaStore interface, s3-store, memory-store, image processing
  sync/             Amber sync: source interface, amber/ adapter, upsert, run-sync, cli
  models-sync/      models + art sync: source-client, match, media-roles, gc, cli
  site/             site assets (home backgrounds, backdrops) seeding
test/fixtures/      recorded upstream JSON
```

## Dependency injection

- No module-level singletons. Everything takes `deps` explicitly: `createApp({ db, env, store, sync })`, `charactersRoute({ db, store })`, `runSync({ db, sql, source, store, … })`.
- Outside systems sit behind interfaces: `MediaStore` (S3, or in memory in tests), `GameDataSource` / `SourceClient` (fakes in tests), and an injectable `fetch` and `log`. A new external dependency gets an interface and a fake.
- Read env once at the entry point (`parseEnv` / `parseCliEnv`) and pass it down. Never read `process.env` inside modules. Add new vars to the Zod schema, `.env.example`, the CI env and the README env table.

## Routes

- Pattern: `export function xRoute(deps) { return new Hono().get(...) }`, mounted in `app.ts` under `/v1/<x>`. Keep the chain unbroken (no `app.get(...)` statements on a variable), or `AppType` loses the route.
- Validate input with `validate('query' | 'param' | 'json', zodSchema)` from `routes/validate.ts`. It answers `400 { error }`. Read input with `c.req.valid(...)`.
- The locale query uses `localeParam` (defaults to `en`). Translated fields fall back to `en` in SQL (`coalesce(req.x, fb.x)` with two aliased i18n joins).
- Responses: lists are `{ items: [...] }`, errors are `{ error: string }` with the right status (404 for a missing entity), and media is returned as public URLs via `store.publicUrl(key)`. Never return raw R2 keys.
- `/v1/*` gets ETag and a default `Cache-Control` from `app.ts`. Override per route with `c.header('Cache-Control', …)` when the data changes more slowly.
- Response shapes are a contract with `apps/web` through `AppType`. After changing one, run `pnpm typecheck` across the repo and update the web code.
- `/admin/*` is guarded by a bearer `ADMIN_TOKEN`. New admin endpoints go there.

## Sync jobs

- Only one run of each job at a time, guarded by `pg_try_advisory_lock` on a dedicated connection (keys in `run-sync.ts` and `run-models-sync.ts`, which must be distinct). A run that's already in progress returns `'busy'`.
- Every run records a `sync_runs` row whose status is `running`, then `succeeded`, `partial` or `failed`, with counts and failures. One entity failing makes the run `partial`, not a crash.
- Runs are incremental by content hash (`sourceHash`, `listHash`, `sourceHashes`): unchanged entities are skipped. `--full` / `--force` override this. Keep new work hash-gated so the crons stay cheap.
- Media: download, then `processImage` (WebP), then key `mediaKey(ownerType, ownerId, kind, contentHash)`. Keys are content-addressed, so re-uploads never overwrite and old objects become orphans that `--gc` cleans up. Image normalisation (for example `squareSideIcon`) happens before `processImage`.
- Support `--dry-run` for anything that writes, and make sure a dry run writes nothing (there's a test for this).
- Give the models source neutral names in code and logs (`models`, `MODELS_SOURCE_URL`). Don't hardcode its brand or domain.

## Database access

- Import tables and the `Db` type from `@gi/db`. Use the Drizzle query builder. Raw SQL is fine through `` sql`...` `` with interpolated values, never string concatenation.
- Upserts use `onConflictDoUpdate` on the natural key. Write a run's rows in a transaction when they must land together.
- Schema changes are covered in `db.md`.

## Errors and logging

- `app.onError` logs `[api] METHOD path failed:` and returns `500 { error: 'internal_error' }`. Don't leak messages to clients.
- Log with a bracketed prefix (`[sync]`, `[models-sync]`) through the injected `log`.
- CLIs return an exit code from `main()` and always close the DB in `finally`.

## Tests

- Vitest against **real Postgres** (from docker compose locally, a service container in CI). `vitest.global-setup.ts` creates and migrates `gi_test_api`. Tests use `inject('dbUrl')` and call `resetDb(db)` in `beforeEach`. `fileParallelism: false`, so don't rely on parallel isolation.
- Hit routes through `app.request(...)`. Seed with Drizzle inserts. Use `createMemoryStore()` for media and fake sources and clients (see `run-models-sync.test.ts`).
- Build images in tests with `sharp({ create })`. Assert on pixels or metadata, not bytes.
- `*.int.test.ts` hit real S3 (SeaweedFS) and only run with `S3_INTEGRATION=1`.
- Run: `pnpm vitest run --project api` (needs `docker compose up -d`).

## Build and deploy

- `tsup` bundles `index.ts`, `cli.ts`, `models-cli.ts` and the seed CLI into `dist/`. A new CLI needs a tsup entry and a `package.json` script.
- Railway runs `pnpm --filter @gi/db db:migrate` before each deploy. See `architecture.md` for services and crons, and AGENTS.md before touching prod.

## Don'ts

- Don't call `process.env` outside `env.ts` and the entry points.
- Don't put business logic in route handlers that a sync also needs. Share it through a module.
- Don't write to R2 or the DB in a code path that `--dry-run` reaches.
- Don't add an ORM, validation library or HTTP framework beside the existing ones.
