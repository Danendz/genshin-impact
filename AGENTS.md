# Agent rules

Genshin Impact fan site: a pnpm monorepo with a React web app, a Hono API and Drizzle/Postgres, plus sync jobs that pull game data and 3D models into Postgres and Cloudflare R2. These rules apply to every coding agent. `CLAUDE.md` only imports this file.

## Guidelines: read before editing

Before you change files under a path below, read its guide. The guides record how the code already works. Follow them rather than inventing new patterns.

| Touching                            | Read first                       |
| ----------------------------------- | -------------------------------- |
| `apps/web/**`                       | `.ai/guidelines/web.md`          |
| `apps/api/**`                       | `.ai/guidelines/api.md`          |
| `packages/db/**`, any schema change | `.ai/guidelines/db.md`           |
| `packages/models/**`                | `.ai/guidelines/models.md`       |
| deploys, crons, env vars, infra     | `.ai/guidelines/architecture.md` |

The library versions are newer than most training data (TypeScript 7, Vite 8, Vitest 5, Biome 2.6, React 19, Zod 4). Look up current docs (with context7 when available) before you rely on an API from memory.

## Architecture

```
apps/web         React 19 + Vite + TanStack Router/Query, Tailwind 4 + CSS modules  → Vercel
apps/api         Hono API, plus CLIs: sync, models-sync, seed:site                  → Railway
packages/db      Drizzle schema, migrations, test DB helpers (@gi/db)
packages/models  model build pipeline: source containers → GLB + toon sidecar (@gi/models)
packages/shared  enums, locales, normalisers shared by web/api/db (@gi/shared)
```

Data flow:

```
Project Amber (gi.yatta.moe) ── sync (daily) ───────┐
models source ─────────────── models-sync (1st/16th) ┴→ Postgres + R2 (gi-media)
                                                          │
                       Hono API /v1/* (typed via AppType) ←┘ → web (hono/client `hc<AppType>`)
```

- The web app imports the API's `AppType` (`@gi/api/app`), so request and response types flow end to end. A change to a route's shape is a change to the web app's types.
- Media lives in R2. The DB stores keys, and the API turns them into public URLs with `store.publicUrl`.
- Deploys: `master` → Vercel (web). Railway runs `api` (pre-deploy migrations, `/health`) and the crons `sync` (`0 4 * * *`, `--details`) and `models-sync` (`0 5 1,16 * *`). Details are in `.ai/guidelines/architecture.md`.
- Local: `docker compose up -d` (Postgres :54329, SeaweedFS S3 :9000), `cp .env.example .env`, `pnpm --filter @gi/db db:migrate`, `pnpm --filter @gi/api dev` (:8787), `pnpm --filter @gi/web dev` (:5173).

## Commands

```sh
pnpm lint                  # biome check . (format + lint)
pnpm typecheck             # tsc in every package
pnpm test                  # vitest, all projects (needs docker compose up for Postgres)
pnpm vitest run --project web     # one package: web | api | db | models
pnpm exec biome check --write <files>   # fix formatting
```

## Definition of done

Don't say a task is done, fixed or passing until you have run these checks and seen them pass in this session:

1. `pnpm lint` and `pnpm typecheck` are clean.
2. The tests for the affected packages pass.
3. Every behavior change or bug fix comes with a test. For a bug, write the failing test first and watch it fail.
4. For UI changes, check the result in the running app (dev server plus a browser) when you can. Say so when you couldn't.

If something fails or you skipped a step, say that plainly and include the output.

## Git

- **Never commit, push or open a PR unless the user asks for that action in the current turn.** Approval for one commit doesn't carry over to the next one.
- `master` is the main and production branch. Never commit to it directly. Each task gets a branch off `master` named `<type>/<short-slug>` (for example `fix/side-icon-ring` or `feat/weapon-browser`).
- Never force-push, rewrite pushed history, use `--no-verify`, or delete branches you didn't create.
- PRs target `master` and are **squash-merged**, so the PR title becomes the commit on `master` and must follow the commit format below. Commits on the branch can be WIP.
- PR body: a short summary of what changed and why, then a **Test plan** with the commands you ran and what you checked by hand.
- Stage specific files. Don't `git add -A` over unrelated changes. Never commit `.env` files or secrets.

### Conventional commits

```
type(scope): subject

body: why, not what (optional)
```

- **type**: `feat` `fix` `refactor` `perf` `test` `docs` `chore` `ci` `build`
- **scope**: `web` `api` `db` `models` `shared` `infra` `deps`. Leave the scope out for changes across the repo.
- subject: imperative, lowercase, no trailing period, 72 characters or fewer.
- Breaking API or schema changes: `feat(api)!: …` or a `BREAKING CHANGE:` footer.

```
feat(web): fade in the first home background once it loads
fix(api): pad cropped side icons back to the 128px canvas
chore(deps): bump vite to 8.4
refactor: move locale helpers to shared
```

## Production safety

Read-only access to prod is fine: logs, deploy status, service config, the public API, the public R2 URLs.

**Ask the user and wait for a yes** before anything that writes to prod:

- running `sync`, `models-sync` or `seed:site` against prod, and `models-sync --gc --yes` (it deletes R2 objects)
- migrations against the prod DB
- changing Railway variables, start commands, crons or domains, adding TCP proxies, deploying or redeploying
- deleting or overwriting R2 objects, or calling `/admin/*` on the prod API

Run local commands against the local stack from `.env.example`. **Warning:** the user's own `.env` may point R2 at the prod bucket. Check `R2_ENDPOINT` and `MEDIA_PUBLIC_URL` before you run anything that writes media.
