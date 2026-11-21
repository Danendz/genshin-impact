# Genshin Impact Remake — Design

Status: approved 2026-11-19
Legacy Vue app: frozen on the `legacy` branch (not maintained; bugs are fixed only in the remake).

## Goal

Portfolio-quality remake of the 2022 Vue fan site: a game-style UI (character browser, inventory, wish simulator, profile) backed by our own data pipeline, built so that 3D character models can be added in phase 2.

## Architecture

```
            ┌──────────── Vercel ────────────┐
 browser ──▶│ apps/web  (Vite SPA, React)    │
            └───────────────┬────────────────┘
                            │ typed hono/client (JSON)
            ┌──────────── Railway ───────────┐        ┌── Cloudflare R2 ──┐
            │ apps/api  (Hono)               │        │ images, later GLB │◀── browser (CDN domain)
            │   ├─ read API  ──▶ PostgreSQL  │        └─────────▲─────────┘
            │   └─ sync job (cron + manual) ─┼──────────────────┘ upload
            └───────────────┬────────────────┘
                            ▼
                Project Amber (gi.yatta.moe/api/v2), genshin-db (gap filler)
```

User requests never reach upstream sources. Postgres is the source of truth for game data; R2 holds media.

## Repository

pnpm workspaces monorepo in `Danendz/genshin-impact` (renamed from `genshin-impact-vue`).

| Path | Purpose |
|---|---|
| `apps/web` | React + Vite + TanStack Router + TanStack Query + Zustand + react-three-fiber |
| `apps/api` | Hono HTTP API, sync job, Drizzle migrations |
| `packages/db` | Drizzle schema and client (shared by API and sync) |
| `packages/wish` | Pure-TS wish engine (no DOM, no IO) — runs in the browser now, on the server later |
| `packages/shared` | Shared domain types, enums (elements, weapon types, rarity), locale list |

Tooling: TypeScript strict, Biome (lint and format), Vitest.

## Data pipeline

- **Primary source:** Project Amber `https://gi.yatta.moe/api/v2/{lang}/{avatar|weapon|material}[/{id}]`, languages `en`, `ru`, `chs`, `cht`. Icons at `https://gi.yatta.moe/assets/UI/{icon}.png`.
- **Gap filler:** `genshin-db` (npm, actively maintained) for fields Amber lacks.
- **Sync job:** a Railway cron runs daily and can also be started with a protected admin endpoint or CLI on patch and banner days. Steps: fetch the list, then fetch details for new or changed items (compare a content hash), upsert into Postgres in one transaction per entity, then download any media not already present and upload it to R2. The job is idempotent and safe to re-run; each run's result goes to a `sync_runs` table.
- **Normalization:** upstream codes (`WEAPON_SWORD_ONE_HAND`, `Ice`, …) are mapped to our own enums in `packages/shared`, so the frontend never sees upstream naming.

### Storage model (initial)

- `characters` — id, rarity, element, weapon_type, region, birthday, release_at, source_hash
- `character_i18n` — character_id, locale, name, title, description, talents/constellations (jsonb)
- `weapons` / `weapon_i18n`, `materials` / `material_i18n` — same pattern
- `media_assets` — owner (type, id), kind (`icon`, `gacha_splash`, `card`, `side_icon`, … later `model_glb`), r2_key, width, height, content_hash
- `banners` / `banner_items` — see open question below
- `sync_runs` — started_at, finished_at, status, counts, error

Locales: `en`, `ru`, `zh-CN` (Amber `chs`), `zh-TW` (Amber `cht`).

## API

Read-only REST under `/v1`, typed end to end with `hono/client`:
`/v1/characters`, `/v1/characters/:id`, `/v1/weapons`, `/v1/weapons/:id`, `/v1/materials`, `/v1/banners/current`, with `?locale=` and list filters (element, weapon type, rarity). Responses are cacheable (`Cache-Control` + ETag). Media URLs are absolute R2/CDN URLs.

Admin: `POST /admin/sync`, protected with a bearer token stored in a Railway variable.

## Frontend

- Routes: `/` home/profile, `/characters`, `/characters/$id`, `/inventory` (weapons, materials), `/wish`.
- **Styling:** Tailwind v4 for layout and tokens (`@theme`: element colors, rarity gradients, fonts). CSS Modules for ornate components and animations (gacha effects, rhombus items, banner shadows). Both read the same CSS variables.
- **i18n:** en, ru, zh-CN, zh-TW. UI strings are written in zh-CN first, then converted to zh-TW with OpenCC and reviewed by hand. Game text comes from the API per locale.
- **State:** TanStack Query for server data; Zustand with persistence for user state (profile, primogems, pity, wish history).
- **Scrolling:** native scroll with `scroll-snap` and Pointer Events. No hand-rolled momentum (the legacy touch-scroll bugs came from that). Keep the legacy look: edge bounce and drag-to-scroll with a mouse.
- **3D-ready:** the character page has a viewport slot. R3F is code-split so v1 pages don't pay for three.js until a 3D view mounts.

## Wish engine (`packages/wish`)

A pure function or class: input is the banner definition, pool, pity state and RNG; output is the results plus the new pity state. Injectable RNG for deterministic tests. Must fix legacy issues:
- 5★ 50/50 is a real coin flip; losing gives a standard 5★, never the featured one picked by chance from the standard pool.
- Soft pity from pull 74 with a +6%/pull ramp, hard pity at 90 (character) and 80 (weapon); 4★ at 10. Model the weapon banner and Epitomized Path separately.
- Banner type checks compare values (the legacy code had `if (BannerTypes.EVENT)`, which is always true).
- Tests: statistical checks (average 5★ rate ≈ 1.6% with soft pity) plus deterministic sequences.

## Delivery order

1. Monorepo scaffold, CI (lint, typecheck, test), deploy skeletons (Vercel + Railway + Postgres + R2).
2. Data pipeline: schema, Amber adapter, sync job, media to R2.
3. Characters browser.
4. Weapons/Inventory.
5. Wish simulator (engine first, then UI and animations).
6. Home/profile.
7. Phase 2: 3D viewer. Convert official MMD models to Draco or meshopt-compressed GLB, store them as `media_assets.kind = model_glb`. Check miHoYo's model license on redistribution first.

## Deployment and cutover

Work happens on the `remake` branch. `master` keeps the legacy Vue app live on Vercel until the remake reaches step 3; then the remake merges to `master`, the Vercel project is reconfigured (root `apps/web`, pnpm), and the legacy site stays reachable from the `legacy` branch.

## Open questions

- **Banner data source.** Amber has no banner history. Options: a curated JSON file in the repo, updated each patch (simple and reliable), or pull from a community dataset (e.g. paimon.moe's banner data). To be decided before step 5.
- **R2 public domain.** Custom domain vs `r2.dev`; this needs a domain you own.
- **3D model licensing** (phase 2).
