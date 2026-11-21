# Architecture

## Packages

| Package      | Role                                                    | Depends on               |
| ------------ | ------------------------------------------------------- | ------------------------ |
| `@gi/shared` | enums (elements, weapon types, locales), normalisers    | none                     |
| `@gi/db`     | Drizzle schema, migrations, `createDb`, test DB helpers | shared                   |
| `@gi/models` | model build pipeline (source containers → GLB + toon)   | none                     |
| `@gi/api`    | Hono API + sync CLIs                                    | db, models, shared       |
| `@gi/web`    | React SPA                                               | shared, api (types only) |

Workspace packages export TypeScript source (`exports: ./src/*.ts`) with no build step between them. Only `apps/api` (tsup → `dist/`) and `apps/web` (Vite → `dist/`) build.

## Data pipeline

1. **Amber sync** (`apps/api/src/sync`, CLI `sync`): Project Amber (gi.yatta.moe) lists and details for characters, weapons and materials in en, ru, zh-CN and zh-TW → normalise → upsert into `characters` / `*_i18n` / `weapons` / `materials` → download media → WebP → R2 → `media_assets`. Hash-gated, advisory-locked, and recorded in `sync_runs` (`source = 'amber'`). Can also be triggered with `POST /admin/sync?full=1|details=1`.
2. **Models sync** (`apps/api/src/models-sync`, CLI `models-sync`): the models source roster → match to Amber characters (`characters.model_slug`) → build GLBs with `@gi/models` → R2 `model/<slug>/<variant>/…` → `character_models`. Also pulls icons, side icons and kit art into `media_assets` (`source = 'models'`). Without `MODELS_COOKIE` it stores previews (`quality = 'preview'`) and upgrades them on a later run. `--gc` lists R2 objects no row references, and `--gc --yes` deletes them.
3. **Site assets** (`apps/api/src/site`, CLI `seed:site`): home backgrounds and viewer backdrops → `site_assets`.
4. **API** (`/v1/characters`, `/v1/weapons`, `/v1/materials`, `/v1/site`) reads Postgres, falls back to `en` for missing translations, and returns public R2 URLs.
5. **Web** calls the API through `hc<AppType>` and caches with TanStack Query.

R2 keys are content-addressed (`<owner>/<id>/<kind>-<hash12>.webp`), so objects are immutable and cacheable forever. Changing an image means a new key, and the old key becomes an orphan.

## Deploy

| Piece       | Where                                             | Config / notes                                                                                      |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| web         | Vercel, prod branch `master`, root `apps/web`     | `apps/web/vercel.json` (SPA rewrite). PRs get preview deploys.                                      |
| api         | Railway service `api`, https://api-gi.danendz.com | `apps/api/railway.json`: pre-deploy migrate, `/health` check                                        |
| sync        | Railway cron `0 4 * * *` UTC                      | `node apps/api/dist/cli.js --details`                                                               |
| models-sync | Railway cron `0 5 1,16 * *` UTC                   | `node apps/api/dist/models-cli.js`                                                                  |
| Postgres    | Railway plugin, private network only              | No public proxy. Add a TCP proxy temporarily for local runs against prod, and remove it afterwards. |
| media       | Cloudflare R2 bucket `gi-media`                   | public at https://gi-bucket.danendz.com                                                             |

- Railway service settings (start commands, crons) are set in the Railway dashboard. The `railway*.json` files are **not applied** (Railway ignores them for these services), so they're documentation only. Change settings in the dashboard, and update the matching json in the same PR so it stays accurate. After a one-off run with a custom start command, restore the original.
- `CORS_ORIGIN` on the api lists the allowed web origins (prod plus Vercel previews). Localhost isn't included.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck and tests with Postgres and SeaweedFS on pushes to `master` and on every pull request. A PR must be green before merging.
- Every env var is listed in the README env table. Add new ones there and in `.env.example`.

## Local stack

- `docker compose up -d`: Postgres 17 on :54329 (`gi`/`gi`, DBs `gi` and `gi_test_*`) and SeaweedFS S3 on :9000 (bucket `gi-media`, anonymous read).
- `.env.example` is wired to that stack. The user's real `.env` may point at prod R2, so check before running writes.
- To run the web app against the prod API: prod CORS blocks localhost, so use a Vite proxy config (kept out of git) that sends `/v1` to https://api-gi.danendz.com, with `VITE_API_URL=http://localhost:5173`.
