# Genshin Impact

A fan site for Genshin Impact, remade as a pnpm monorepo (React web, Hono API, Drizzle/Postgres). See the design spec in [`docs/`](docs/). The original 2022 Vue app lives on the [`legacy`](../../tree/legacy) branch.

## Local development

Requires Node 24 (see `.nvmrc`) and pnpm via corepack (`corepack enable`).

```sh
cp .env.example .env
docker compose up -d        # Postgres (:54329) + SeaweedFS S3 (:9000)
pnpm install
pnpm --filter @gi/db db:migrate
pnpm --filter @gi/api dev   # API on :8787
pnpm --filter @gi/web dev   # web on :5173
```

`pnpm lint`, `pnpm typecheck` and `pnpm test` run across the whole workspace.

## Deploy

| Service  | Where                                              | Config                                                                                                   |
| -------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| web      | Vercel, project root `apps/web`                    | [`apps/web/vercel.json`](apps/web/vercel.json)                                                           |
| api      | Railway                                            | [`apps/api/railway.json`](apps/api/railway.json) (runs migrations as pre-deploy, health check `/health`) |
| sync     | Railway cron, daily 04:00 UTC                      | [`apps/api/railway.sync.json`](apps/api/railway.sync.json)                                               |
| Postgres | Railway plugin                                     |                                                                                                          |
| media    | Cloudflare R2 bucket `gi-media` with public access |                                                                                                          |

Environment variables:

| Variable                                                               | Used by   | Notes                                                         |
| ---------------------------------------------------------------------- | --------- | ------------------------------------------------------------- |
| `DATABASE_URL`                                                         | api, sync | Railway Postgres reference variable                           |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | api, sync | R2 S3 credentials, bucket `gi-media`                          |
| `MEDIA_PUBLIC_URL`                                                     | api, sync | public base URL of the bucket                                 |
| `ADMIN_TOKEN`                                                          | api       | bearer token for `/admin/*`, at least 32 characters           |
| `CORS_ORIGIN`                                                          | api       | allowed web origin(s), comma-separated (Vercel URL, previews) |
| `PORT`                                                                 | api       | injected by Railway                                           |
| `VITE_API_URL`                                                         | web       | the API's public URL, set in Vercel                           |

### Railway setup

- Each Railway service (api, sync) must have its config-file path set to `/apps/api/railway.json` (api) or `/apps/api/railway.sync.json` (sync), with the root directory set to the repo root (not `apps/api`).
- The sync cron runs `node apps/api/dist/cli.js --details`: it refetches every character/weapon detail but only re-uploads media when the data changed. Use `--full` to force media re-upload too.

### Manual sync

```sh
# full re-sync through the API
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "https://<api-domain>/admin/sync?full=1"
```

### Running against production from your machine

`railway run` injects the service variables, including the private `*.railway.internal` `DATABASE_URL`, which is not reachable from outside Railway. Override it with the Postgres public proxy URL (`DATABASE_PUBLIC_URL` on the Postgres service) and build locally first (Node 24, corepack/pnpm):

```sh
pnpm install --frozen-lockfile && pnpm --filter @gi/api... build
railway run --service sync sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node apps/api/dist/cli.js --details'
```

(If `DATABASE_PUBLIC_URL` is not on the service, copy it from the Postgres service variables.)

### Seed home backgrounds

With production `DATABASE_URL` (public proxy URL, see above) and R2 variables in the environment, run locally with Node 24 and pnpm:

```sh
railway run --service api sh -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm --filter @gi/api seed:site home-background /absolute/path/to/legacy/backgrounds'
```

Arguments are `<group> <dir>`: group `home-background`, and the directory holding the images (extensionless webp is fine; hidden and non-image files are skipped).
