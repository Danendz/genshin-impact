# Genshin Impact

A fan site for Genshin Impact, remade as a pnpm monorepo (React web, Hono API, Drizzle/Postgres). See the design spec in [`docs/`](docs/). The original 2022 Vue app lives on the [`legacy`](../../tree/legacy) branch.

## Local development

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

| Variable                                                               | Used by   | Notes                                |
| ---------------------------------------------------------------------- | --------- | ------------------------------------ |
| `DATABASE_URL`                                                         | api, sync | Railway Postgres reference variable  |
| `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | api, sync | R2 S3 credentials, bucket `gi-media` |
| `MEDIA_PUBLIC_URL`                                                     | api, sync | public base URL of the bucket        |
| `ADMIN_TOKEN`                                                          | api       | bearer token for `/admin/*`          |
| `CORS_ORIGIN`                                                          | api       | the web origin (Vercel URL)          |
| `PORT`                                                                 | api       | injected by Railway                  |
| `VITE_API_URL`                                                         | web       | the API's public URL, set in Vercel  |

### Manual sync

```sh
# full re-sync through the API
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "https://<api-domain>/admin/sync?full=1"

# or run the CLI with the production environment
railway run --service sync node apps/api/dist/cli.js
```

### Seed home backgrounds

With production `DATABASE_URL` and R2 variables in the environment:

```sh
railway run --service api pnpm --filter @gi/api seed:site
```
