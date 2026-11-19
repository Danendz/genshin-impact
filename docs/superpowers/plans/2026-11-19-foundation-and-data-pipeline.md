# Foundation & Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pnpm monorepo on the `remake` branch with a running React shell, a Hono API serving characters/weapons/materials from Postgres in 4 locales, a sync job that fills Postgres from Project Amber and media into R2, CI, and deployed skeletons.

**Architecture:** `packages/shared` (domain enums and normalizers), `packages/db` (Drizzle schema and client), `apps/api` (Hono read API, admin trigger, sync job with Amber adapter and media pipeline), `apps/web` (Vite + React + TanStack Router + Tailwind v4 calling the API through `hono/client`). The sync job is the only code that talks to upstream.

**Tech Stack:** Node 24, pnpm 11 workspaces, TypeScript (strict), Biome, Vitest, React 19, Vite, TanStack Router + Query, Tailwind v4, Hono 4, Drizzle ORM + drizzle-kit, PostgreSQL 17, zod, sharp, `@aws-sdk/client-s3` (R2/MinIO), Docker Compose (local Postgres + MinIO), GitHub Actions, Railway, Vercel, Cloudflare R2.

**Spec:** `docs/specs/2026-11-19-remake-design.md`

## Global Constraints

- All work on branch `remake`; never commit to `master` or `legacy`.
- Package names: `@gi/shared`, `@gi/db`, `@gi/api`, `@gi/web`.
- Locales are exactly `en`, `ru`, `zh-CN`, `zh-TW` → Amber `en`, `ru`, `chs`, `cht`. Default/fallback locale `en`.
- Upstream base `https://gi.yatta.moe/api/v2/{lang}/{avatar|weapon|material}[/{id}]`; images `https://gi.yatta.moe/assets/UI/{name}.png`.
- Frontend never sees upstream naming: codes are normalized in `@gi/shared`.
- User requests never call upstream; only the sync job does.
- Entity ids are `text` everywhere (Traveler ids look like `10000005-pyro`).
- Media is stored as webp; keys are immutable (contain a content hash) and served with long cache.
- Secrets only from env, validated at startup with zod: `DATABASE_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `MEDIA_PUBLIC_URL`, `ADMIN_TOKEN`, `CORS_ORIGIN`, `PORT`.
- Outward-facing steps (creating Railway/Vercel/R2 resources, pushing) need the user's go-ahead at that moment.
- `genshin-db` gap-filling is deferred: no field gap has been identified for this plan's scope (YAGNI). Banners are deferred to the wish-simulator plan (spec open question).

## Review Focus

1. **Traveler / suffixed ids** (`10000005-pyro`): sync, DB, and `GET /v1/characters/10000005-pyro` must work end to end. Tests in Tasks 6 and 9.
2. **Unknown or null upstream enum** (a new element, `element: null`, an unseen weapon type): that entity is skipped and counted as `failed` with a reason; the rest of the sync continues. Tests in Tasks 1 and 8.
3. **Upstream partial failure** (timeout or 500 on one detail, 404 on one image): previously stored data for that entity stays intact, the run ends `partial`, and a missing image never fails its entity. Tests in Tasks 7 and 8.
4. **Concurrent syncs** (cron fires while a manual sync runs): the second run doesn't start; admin returns 409. Tests in Tasks 8 and 9.
5. **Missing translation** (an entity has `en` but no `ru` row): the API returns `en` text for that entity rather than 404 or empty. Test in Task 9.

---

### Task 1: Monorepo root + `@gi/shared`

**Files:**
- Delete: all legacy Vue files on `remake` (everything except `docs/`, `.gitignore`); they live on `legacy`.
- Create: `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `tsconfig.base.json`, `biome.json`, `vitest.workspace.ts`, `.nvmrc` (`24`), `.gitignore` (node_modules, dist, .env*, !.env.example), `README.md` (one paragraph + link to spec and `legacy` branch)
- Create: `packages/shared/{package.json,tsconfig.json,src/index.ts,src/locale.ts,src/enums.ts,src/normalize.ts}`
- Test: `packages/shared/src/normalize.test.ts`

**Interfaces:**
- Produces:
  - `type Locale = 'en' | 'ru' | 'zh-CN' | 'zh-TW'`; `LOCALES: readonly Locale[]`; `DEFAULT_LOCALE: Locale = 'en'`; `isLocale(x: unknown): x is Locale`
  - `toAmberLang(l: Locale): 'en' | 'ru' | 'chs' | 'cht'`
  - `type Element = 'pyro'|'hydro'|'anemo'|'electro'|'dendro'|'cryo'|'geo'`, `ELEMENTS`
  - `type WeaponType = 'sword'|'claymore'|'polearm'|'bow'|'catalyst'`, `WEAPON_TYPES`
  - `type Rarity = 1|2|3|4|5`
  - `normalizeElement(raw: string | null | undefined): Element | null`
  - `normalizeWeaponType(raw: string): WeaponType | null`
  - `normalizeRarity(raw: number): Rarity | null`
- Root scripts: `lint` (biome check), `typecheck` (`pnpm -r typecheck`), `test` (vitest run).

- [ ] **Step 1: Remove legacy files, add root config and `packages/shared` package skeleton**, then run `pnpm install`. Expected: install succeeds; `pnpm lint` passes on an empty tree.

- [ ] **Step 2: Write failing tests** in `normalize.test.ts`:

```ts
test.each([
  ['Fire','pyro'],['Water','hydro'],['Wind','anemo'],['Electric','electro'],
  ['Grass','dendro'],['Ice','cryo'],['Rock','geo'],
])('normalizeElement(%s)', (raw, want) => expect(normalizeElement(raw)).toBe(want))
test('unknown/null element', () => {
  expect(normalizeElement('Void')).toBeNull(); expect(normalizeElement(null)).toBeNull()
})
test.each([
  ['WEAPON_SWORD_ONE_HAND','sword'],['WEAPON_CLAYMORE','claymore'],['WEAPON_POLE','polearm'],
  ['WEAPON_BOW','bow'],['WEAPON_CATALYST','catalyst'],
  ['Sword','sword'],['Claymore','claymore'],['Polearm','polearm'],['Bow','bow'],['Catalyst','catalyst'],
])('normalizeWeaponType(%s)', (raw, want) => expect(normalizeWeaponType(raw)).toBe(want))
test('unknown weapon type', () => expect(normalizeWeaponType('WEAPON_GUN')).toBeNull())
test('rarity', () => { expect(normalizeRarity(5)).toBe(5); expect(normalizeRarity(105)).toBeNull() })
test('amber lang', () => expect(LOCALES.map(toAmberLang)).toEqual(['en','ru','chs','cht']))
```

- [ ] **Step 3: Run** `pnpm test packages/shared`. Expected: FAIL (functions not exported).
- [ ] **Step 4: Implement** `locale.ts`, `enums.ts`, `normalize.ts` as lookup tables. Amber 5★ "special" rarity 105 (aloy-style) is not a valid `Rarity`; callers decide (Task 6 maps `105 → 5`).
- [ ] **Step 5: Run** `pnpm test && pnpm typecheck && pnpm lint`. Expected: all pass.
- [ ] **Step 6: Commit** `chore: scaffold monorepo and @gi/shared normalizers`

---

### Task 2: Local infra + `@gi/db` schema

**Files:**
- Create: `docker-compose.yml` — `postgres:17` on host port `54329` (db/user/pass `gi`), `minio/minio` on `9000`/`9001` with bucket `gi-media` created by an `mc` init container
- Create: `.env.example` with every var from Global Constraints (local values pointing at compose)
- Create: `packages/db/{package.json,tsconfig.json,drizzle.config.ts,src/schema.ts,src/client.ts,src/index.ts,src/test-utils.ts,migrations/}`
- Test: `packages/db/src/schema.test.ts` (vitest config for this package: `fileParallelism: false`, globalSetup runs migrations against `TEST_DATABASE_URL`)

**Interfaces:**
- Consumes: `Locale`, `Element`, `WeaponType` from `@gi/shared` (pg enums built from `ELEMENTS`, `WEAPON_TYPES`, `LOCALES`).
- Produces (`@gi/db`):
  - Tables (Drizzle names): `characters` (id text pk, rarity smallint, element nullable, weaponType, region text null, birthdayMonth/birthdayDay smallint null, releaseAt timestamptz null, sourceHash text, updatedAt), `characterI18n` (characterId fk cascade, locale, name, title null, description null, details jsonb; pk `(characterId, locale)`), `weapons` (id, rarity, weaponType, sourceHash, updatedAt), `weaponI18n` (weaponId, locale, name, description null, details jsonb), `materials` (id, rarity, category text, sourceHash, updatedAt), `materialI18n` (materialId, locale, name, description null), `mediaAssets` (id serial, ownerType enum `character|weapon|material`, ownerId text, kind enum `icon|gacha_splash|gacha_icon|model_glb`, sourceUrl text, r2Key, width int, height int, contentHash, updatedAt; unique `(ownerType, ownerId, kind)`), `syncRuns` (id serial, startedAt, finishedAt null, status enum `running|succeeded|partial|failed`, counts jsonb, error text null), `siteAssets` (id serial, group text — e.g. `home-background`, r2Key, width int, height int, contentHash unique, sortOrder int, createdAt) for hand-curated site media that does not come from upstream
  - `createDb(url: string): { db: Db; close(): Promise<void> }`, `type Db`
  - `resetDb(db: Db): Promise<void>` (truncate all tables, restart identities). Test-only export from `@gi/db/test-utils`.
  - Scripts: `db:generate` (drizzle-kit generate), `db:migrate` (programmatic `migrate()` runner, `src/migrate.ts`)

- [ ] **Step 1: Add compose + `.env.example`; run** `docker compose up -d`. Expected: `docker compose ps` shows postgres healthy and minio running.
- [ ] **Step 2: Write failing tests**: insert character `10000005-pyro` with `en` and `ru` i18n rows → select joins both; inserting a duplicate `(characterId, locale)` throws; deleting the character cascades its i18n rows; inserting two `mediaAssets` with the same `(ownerType, ownerId, kind)` throws.
- [ ] **Step 3: Run** `pnpm test packages/db`. Expected: FAIL (schema missing).
- [ ] **Step 4: Implement schema/client, generate the first migration** with `pnpm --filter @gi/db db:generate`; commit the SQL.
- [ ] **Step 5: Run** `pnpm test packages/db`. Expected: PASS.
- [ ] **Step 6: Commit** `feat(db): drizzle schema, migrations, local compose`

---

### Task 3: `@gi/api` skeleton + env

**Files:**
- Create: `apps/api/{package.json,tsconfig.json,src/env.ts,src/app.ts,src/index.ts}`
- Test: `apps/api/src/app.test.ts`

**Interfaces:**
- Produces:
  - `parseEnv(source: Record<string, string | undefined>): Env` (zod; throws listing every missing/invalid var)
  - `createApp(deps: AppDeps): Hono` where `AppDeps = { db: Db; env: Env; sync: SyncController }`; `SyncController` is defined in Task 8 and stubbed here as `{ trigger(): Promise<{ runId: number } | 'busy'> }`
  - `export type AppType = ReturnType<typeof createApp>` (later tasks chain routes so the RPC type stays complete)
  - `GET /health → 200 { ok: true }`; CORS restricted to `env.CORS_ORIGIN`
  - `index.ts` starts `@hono/node-server` on `PORT`; build with `tsup` → `dist/index.js`

- [ ] **Step 1: Write failing tests**: `GET /health` returns `{ ok: true }`; a request with `Origin: https://evil.example` gets no `access-control-allow-origin`; `parseEnv({})` throws and the message names `DATABASE_URL` and `ADMIN_TOKEN`.
- [ ] **Step 2: Run** `pnpm test apps/api`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test apps/api`, then `pnpm --filter @gi/api dev` and `curl localhost:$PORT/health`. Expected: PASS; curl prints `{"ok":true}`.
- [ ] **Step 5: Commit** `feat(api): hono skeleton with validated env`

---

### Task 4: `@gi/web` shell

**Files:**
- Create: `apps/web/{package.json,tsconfig.json,vite.config.ts,index.html,src/main.tsx,src/router.tsx,src/routes/__root.tsx,src/routes/index.tsx,src/api.ts,src/styles/theme.css,public/fonts/}`
- Test: `apps/web/src/routes/index.test.tsx` (Vitest + jsdom + Testing Library)

**Interfaces:**
- Consumes: `AppType` from `@gi/api` (type-only import).
- Produces:
  - `api = hc<AppType>(import.meta.env.VITE_API_URL)` in `src/api.ts`
  - `queryClient` and file-based TanStack Router (plugin `@tanstack/router-plugin/vite`)
  - Tailwind v4 via `@tailwindcss/vite`; `theme.css` declares `@theme` tokens: `--color-pyro … --color-geo` and `--color-rarity-1 … --color-rarity-5`, values copied from the `legacy` branch `src/assets/Styles/_vision_colors.scss` and `_rarity_colors.scss`; `--font-genshin` and `--font-genshin-icon` (see fonts below)
  - **Fonts** (from `legacy:public/fonts/`; woff2 only, drop eot/svg/ttf/woff):
    - `HYWenHei-HEW` text font (3.6 MB woff2, full CJK) is split into `unicode-range` subsets by a committed script `apps/web/scripts/subset-fonts.py` (fontTools `pyftsubset`, run with `uvx --from fonttools[woff]`): one `latin-cyrillic` file (U+0000-024F, U+0400-04FF, U+2000-206F, U+20AC) and CJK chunks of about 300 code points ordered by frequency (common zh-CN/zh-TW characters first, then the rest of U+4E00-9FFF, U+3000-303F, U+FF00-FFEF). The script writes `src/assets/fonts/hywenhei/*.woff2` and `src/styles/fonts.css` (one `@font-face` per subset, family `Genshin`, `font-display: swap`). The source font stays out of the repo; the script reads it from a path argument (e.g. `git show legacy:public/fonts/genshin-text/HYWenHei-HEW.woff2 > /tmp/...`).
    - `genshinicon` icon font (61 glyphs, 14 KB woff2) is copied whole to `src/assets/fonts/genshinicon.woff2`. Codepoints from `legacy:public/css/genshinIcons.css` go into a typed map `genshinIcons: Record<GenshinIconName, string>`, with a `<GenshinIcon name="…" />` component (`aria-hidden` unless it has a `label`).
    - `index.html` preloads only the `latin-cyrillic` subset.
  - Site UI icons bundled from the legacy API's `assets/images/genshin-site/` (`git -C ../api show` or the local clone): `home-icons/*` → `src/assets/icons/home/`, `nav-icons/*` → `src/assets/icons/nav/`, `stats-icons/*` → `src/assets/icons/stats/`, `placeholder-icons/*` → `src/assets/icons/placeholder/`. Add the missing `.webp` extension to extensionless files and rename to kebab-case (`Icon_Wish` → `wish.webp`). `src/assets/icons/index.ts` exports typed maps (`homeIcons: Record<HomeIconName, string>` etc.) built with `import.meta.glob(..., { eager: true, query: '?url', import: 'default' })`
  - Index route renders a placeholder home with the API status (`useQuery` → `api.health.$get()`), showing "API online" or "API offline"

- [ ] **Step 1: Write failing tests**: `homeIcons.wish`, `navIcons.character`, `statsIcons.pyro` are defined strings (so a missing or misnamed icon fails the build/test); `genshinIcons` has 61 entries and `<GenshinIcon name=… />` renders its codepoint with `aria-hidden="true"`; `fonts.css` contains a `latin-cyrillic` face whose `unicode-range` includes `U+0400-04FF`; render the index route with a mocked `api.health.$get` resolving `{ ok: true }` → text "API online"; mocked rejection → "API offline".
- [ ] **Step 2: Run** `pnpm test apps/web`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test apps/web && pnpm --filter @gi/web build`. Expected: PASS; build emits `apps/web/dist/index.html`; the `latin-cyrillic` subset is under 150 KB and no single CJK chunk is over 200 KB (`du -k apps/web/dist/assets/*.woff2`); in the dev server, English and Russian text renders in HYWenHei and the Network tab shows no CJK chunk loaded on an `en` page. With the API running locally, `pnpm --filter @gi/web dev` shows "API online".
- [ ] **Step 5: Commit** `feat(web): vite react shell with typed api client and theme tokens`

---

### Task 5: CI

**Files:**
- Create: `.github/workflows/ci.yml`

Runs on push and PR to `remake` and `master`: pnpm setup from `packageManager`, Node from `.nvmrc`, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, migrate then `pnpm test` with service containers `postgres:17` (env `TEST_DATABASE_URL`) and MinIO (env for Task 7's integration test).

- [ ] **Step 1: Add workflow; run the same commands locally** in the listed order. Expected: all green.
- [ ] **Step 2: Commit** `ci: lint, typecheck, test with postgres and minio`
- [ ] **Step 3: With the user's go-ahead, push `remake`** and check `gh run watch`. Expected: workflow succeeds.

---

### Task 6: Amber source adapter

**Files:**
- Create: `apps/api/src/sync/source.ts` (domain record types + `GameDataSource` interface)
- Create: `apps/api/src/sync/amber/{http.ts,schemas.ts,amber-source.ts}`
- Create: `apps/api/test/fixtures/amber/` — trimmed real responses (avatar list, `10000073` and `10000005-pyro` details in en+ru, weapon list, `11509` detail, material list with ~5 items). Record with a one-off `curl`; keep each file under ~50 KB.
- Test: `apps/api/src/sync/amber/amber-source.test.ts`

**Interfaces:**
- Consumes: normalizers, `LOCALES`, `toAmberLang` from `@gi/shared`.
- Produces (`source.ts`):

```ts
type MediaKind = 'icon' | 'gacha_splash' | 'gacha_icon'
type MediaRef = { kind: MediaKind; url: string }
type ListEntry = { id: string; listHash: string }        // hash of the list item across all locales
type CharacterRecord = {
  id: string; rarity: Rarity; element: Element | null; weaponType: WeaponType
  region: string | null; birthday: [month: number, day: number] | null; releaseAt: Date | null
  i18n: Partial<Record<Locale, { name: string; title: string | null; description: string | null
    details: { talents: unknown[]; constellations: unknown[] } }>>
  media: MediaRef[]
}
type WeaponRecord = { id: string; rarity: Rarity; weaponType: WeaponType
  i18n: Partial<Record<Locale, { name: string; description: string | null; details: { affix: unknown } }>>; media: MediaRef[] }
type MaterialRecord = { id: string; rarity: Rarity; category: string
  i18n: Partial<Record<Locale, { name: string; description: null }>>; media: MediaRef[] }
class SourceEntityError extends Error { constructor(public entityId: string, reason: string) }
interface GameDataSource {
  listCharacters(): Promise<ListEntry[]>
  getCharacter(id: string): Promise<CharacterRecord>   // throws SourceEntityError on unmappable data
  listWeapons(): Promise<ListEntry[]>
  getWeapon(id: string): Promise<WeaponRecord>
  listMaterials(): Promise<MaterialRecord[]>             // materials come from the list only (832 items; no per-item detail)
}
```

- `createAmberSource(opts: { fetch?: typeof fetch; baseUrl?: string; concurrency?: number; timeoutMs?: number; retries?: number }): GameDataSource`. Defaults: concurrency 4, timeout 15000 ms, retries 2 with backoff on network errors and 5xx (never on 4xx).
- Media URL rules: character `icon` = `UI_AvatarIcon_X`, `gacha_splash` = `UI_Gacha_AvatarImg_X` (X = icon minus `UI_AvatarIcon_`); weapon `icon` = its `icon`, `gacha_icon` = `UI_Gacha_EquipIcon_…` (icon with `UI_EquipIcon_` → `UI_Gacha_EquipIcon_`); material `icon` = its `icon`. All via `https://gi.yatta.moe/assets/UI/{name}.png`.
- `rarity: 105` maps to `5`. A locale fetch that 404s leaves that locale absent from `i18n` (not an error); `en` missing is a `SourceEntityError`.

- [ ] **Step 1: Record fixtures** (trim long arrays). Commit nothing yet.
- [ ] **Step 2: Write failing tests** with a fake `fetch` that serves fixtures by URL:
  - `getCharacter('10000073')` → `element 'dendro'`, `weaponType 'catalyst'`, `rarity 5`, `birthday [10, 27]`, `i18n.en.name 'Nahida'`, `i18n.ru` present, media urls end with `UI_AvatarIcon_Nahida.png` and `UI_Gacha_AvatarImg_Nahida.png`
  - `getCharacter('10000005-pyro')` → `id '10000005-pyro'`, `element 'pyro'`
  - detail with `element: 'Void'` → rejects with `SourceEntityError`
  - `getWeapon('11509')` → `weaponType 'sword'` (detail says `"Sword"`), gacha url ends `UI_Gacha_EquipIcon_Sword_Narukami.png`
  - `listCharacters()` ids include `'10000005-pyro'`; `listHash` changes when one locale's list item changes
  - fake returns 503 twice then 200 → succeeds with 3 calls; 404 → no retry; hanging response → rejects after `timeoutMs`
- [ ] **Step 3: Run** `pnpm test apps/api/src/sync/amber`. Expected: FAIL.
- [ ] **Step 4: Implement** with zod schemas validating only the fields we read (`.passthrough()` elsewhere so upstream additions don't break us).
- [ ] **Step 5: Run tests.** Expected: PASS.
- [ ] **Step 6: Commit** `feat(sync): project amber source adapter`

---

### Task 7: Media pipeline

**Files:**
- Create: `apps/api/src/media/{store.ts,s3-store.ts,memory-store.ts,process-image.ts,sync-media.ts}`
- Test: `apps/api/src/media/sync-media.test.ts`, `apps/api/src/media/s3-store.int.test.ts` (skips unless `S3_INTEGRATION=1`; CI sets it)

**Interfaces:**
- Consumes: `MediaRef` (Task 6), `Db`, `mediaAssets` (Task 2).
- Produces:
  - `interface MediaStore { exists(key: string): Promise<boolean>; put(key: string, body: Uint8Array, contentType: string): Promise<void>; publicUrl(key: string): string }`
  - `createS3Store(env: Pick<Env,'R2_ENDPOINT'|'R2_ACCESS_KEY_ID'|'R2_SECRET_ACCESS_KEY'|'R2_BUCKET'|'MEDIA_PUBLIC_URL'>): MediaStore` (`forcePathStyle: true` so MinIO works; puts set `Cache-Control: public, max-age=31536000, immutable`)
  - `createMemoryStore(publicBase?: string): MediaStore & { keys(): string[] }`
  - `processImage(input: Uint8Array): Promise<{ body: Uint8Array; width: number; height: number; contentHash: string }>`: sharp → webp quality 85; hash = sha256 hex of the output
  - `mediaKey(ownerType, ownerId, kind, contentHash): string` = `${ownerType}/${ownerId}/${kind}-${contentHash.slice(0,12)}.webp`
  - `syncMedia(deps: { db: Db; store: MediaStore; fetch: typeof fetch }, owner: { type: 'character'|'weapon'|'material'; id: string }, refs: MediaRef[], opts: { force: boolean }): Promise<{ uploaded: number; skipped: number; missing: number }>`: skip a ref when a row exists with the same `sourceUrl` and `!force`; 404 counts as `missing` and never throws; other errors throw.

- [ ] **Step 1: Write failing tests** (memory store, fake fetch serving a small generated PNG):
  - first run uploads 2 refs and inserts 2 `mediaAssets` rows with webp keys matching `/^character\/10000073\/icon-[0-9a-f]{12}\.webp$/`
  - second run (same urls) → `skipped 2`, no new puts
  - `force: true` with same image bytes → same key, row updated, still one row per kind
  - one ref 404 → `missing 1`, other ref still uploaded, no throw
  - integration: `createS3Store` put → `exists` true against MinIO
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test apps/api/src/media` (and with `S3_INTEGRATION=1` while compose is up). Expected: PASS.
- [ ] **Step 5: Commit** `feat(media): webp processing and r2/s3 media sync`

---

### Task 8: Sync orchestrator + CLI

**Files:**
- Create: `apps/api/src/sync/run-sync.ts`, `apps/api/src/sync/upsert.ts`, `apps/api/src/sync/controller.ts`, `apps/api/src/sync/cli.ts`
- Test: `apps/api/src/sync/run-sync.test.ts`

**Interfaces:**
- Consumes: `GameDataSource`, `SourceEntityError` (Task 6); `syncMedia`, `MediaStore` (Task 7); `Db` (Task 2).
- Produces:
  - `type EntityCounts = { upserted: number; skipped: number; failed: number }`
  - `type SyncResult = { runId: number; status: 'succeeded'|'partial'|'failed'; counts: { characters: EntityCounts; weapons: EntityCounts; materials: EntityCounts }; failures: { entity: string; id: string; reason: string }[] }`
  - `runSync(deps: { db: Db; source: GameDataSource; store: MediaStore; fetch: typeof fetch; log?: (msg: string) => void }, opts?: { full?: boolean }): Promise<SyncResult | 'busy'>`
  - `createSyncController(deps): SyncController`: `trigger()` starts `runSync` in the background and returns `{ runId }`, or `'busy'`
  - CLI: `pnpm --filter @gi/api sync [--full]` exits 0 on succeeded/partial, 1 on failed or busy

Behaviour:
- Take `pg_try_advisory_lock(<constant>)`; if not acquired, return `'busy'` without inserting a run.
- Insert a `syncRuns` row `running` and update it at the end with counts, status, and the first error.
- Characters/weapons: list → for each entry, skip unless `full`, the row is missing, or `sourceHash !== listHash`; otherwise fetch the detail and upsert entity + all present i18n rows in one transaction (delete i18n locales no longer present), then `syncMedia` (`force: full`). For materials, upsert from the list (hash per item).
- A per-entity error (`SourceEntityError`, fetch failure) → `failed++`, record it, continue. A list fetch failure → status `failed`, nothing deleted.
- Status: `failed` if any list failed, else `partial` if any entity failed, else `succeeded`.
- Never delete entities that disappeared upstream (log them).

- [ ] **Step 1: Write failing tests** against the real test DB with an in-memory fake `GameDataSource` and memory store:
  - empty DB, 2 characters (one `10000005-pyro`), 1 weapon, 2 materials → status `succeeded`, counts upserted 2/1/2, i18n rows for every locale the fake provides
  - second run, nothing changed → all `skipped`, `getCharacter` not called
  - change one `listHash` → only that character is refetched
  - fake throws `SourceEntityError` for one character → status `partial`, other character upserted, and the failing character's previously stored row and i18n stay unchanged
  - `listWeapons` throws → status `failed`, existing weapons untouched
  - two `runSync` calls started concurrently → exactly one returns `'busy'`
  - a `syncRuns` row is finished with matching counts
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests**, then a real local sync: `docker compose up -d && pnpm --filter @gi/db db:migrate && pnpm --filter @gi/api sync`. Expected: tests PASS; the CLI ends `succeeded` or `partial` with counts matching the upstream lists (≈138 characters incl. Traveler variants, ≈830 materials); MinIO console shows webp files.
- [ ] **Step 5: Commit** `feat(sync): idempotent sync job with advisory lock and cli`

---

### Task 9: Read API + admin trigger

**Files:**
- Create: `apps/api/src/routes/{characters.ts,weapons.ts,materials.ts,admin.ts}`, `apps/api/src/routes/locale.ts`
- Modify: `apps/api/src/app.ts` (mount routes under `/v1` and `/admin`; keep the chained type for `AppType`)
- Test: `apps/api/src/routes/*.test.ts` (seeded test DB)

**Interfaces:**
- Consumes: `Db`, tables (Task 2); `SyncController` (Task 8); `isLocale`, `DEFAULT_LOCALE` (Task 1); `MediaStore.publicUrl` (to turn `r2Key` into URLs).
- Produces (all JSON; query validated with `@hono/zod-validator`):
  - `GET /v1/characters?locale&element&weaponType&rarity` → `{ items: { id, name, rarity, element, weaponType, media: Partial<Record<MediaKind,string>> }[] }` sorted by rarity desc, then name
  - `GET /v1/characters/:id?locale` → `{ id, rarity, element, weaponType, region, birthday, releaseAt, locale, name, title, description, details, media }`; `locale` is the locale actually served
  - `GET /v1/weapons?locale&weaponType&rarity`, `GET /v1/weapons/:id?locale`; `GET /v1/materials?locale&category`
  - Locale fallback: per entity, the requested locale's row, else `en`
  - Errors: invalid query → 400 `{ error }`; unknown id → 404 `{ error: 'not_found' }`
  - Caching: `etag()` middleware, `Cache-Control: public, max-age=300, s-maxage=3600`
  - `POST /admin/sync` with `Authorization: Bearer <ADMIN_TOKEN>` (constant-time compare) → 202 `{ runId }`; busy → 409 `{ error: 'sync_running' }`; bad/missing token → 401. `?full=1` passes `full`.

- [ ] **Step 1: Write failing tests:**
  - `GET /v1/characters/10000005-pyro?locale=en` → 200, `element 'pyro'`
  - character with only `en` i18n requested `?locale=ru` → 200, `locale: 'en'`, English name
  - list `?locale=zh-CN&element=dendro` returns only dendro items with zh-CN names
  - `?locale=jp` → 400; `?rarity=9` → 400; `/v1/characters/nope` → 404
  - second request with `If-None-Match` → 304
  - media values are absolute URLs starting with `MEDIA_PUBLIC_URL`
  - admin: no token → 401; wrong token → 401; right token → 202; controller returning `'busy'` → 409
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm test apps/api` and manually `curl 'localhost:$PORT/v1/characters?locale=ru' | head -c 400` after the Task 8 local sync. Expected: PASS; real Russian names.
- [ ] **Step 5: Commit** `feat(api): v1 read endpoints with locale fallback and admin sync`

---

### Task 10: Home backgrounds (site assets in R2)

The 40 hand-picked home screenshots (1918×1059 webp, 5.2 MB) are curated content, not game data: the sync job never touches them, and they are not committed to the repo.

**Files:**
- Create: `apps/api/src/site/seed-site-assets.ts` (CLI `pnpm --filter @gi/api seed:site <group> <dir>`), `apps/api/src/routes/site.ts`
- Modify: `apps/api/src/app.ts` (mount `/v1/site`)
- Test: `apps/api/src/site/seed-site-assets.test.ts`, `apps/api/src/routes/site.test.ts`

**Interfaces:**
- Consumes: `processImage`, `MediaStore` (Task 7); `siteAssets` (Task 2).
- Produces:
  - `seedSiteAssets(deps: { db: Db; store: MediaStore }, group: string, files: { name: string; bytes: Uint8Array }[]): Promise<{ uploaded: number; skipped: number }>`: processes each file (webp q85), key `site/${group}/${contentHash.slice(0,12)}.webp`, skips files whose `contentHash` already exists, and sets `sortOrder` from the numeric file name (`0`, `1`, … `39`), falling back to alphabetical order. Never deletes.
  - `GET /v1/site/home-backgrounds` → `{ items: { url, width, height }[] }` ordered by `sortOrder`; `Cache-Control: public, max-age=3600`

- [ ] **Step 1: Write failing tests**: seeding 3 generated images → 3 rows, 3 keys under `site/home-background/`; re-seeding the same files → `skipped 3`; files named `10`, `2`, `1` get sortOrder 1, 2, 10 (numeric, not lexical); the endpoint returns absolute `MEDIA_PUBLIC_URL` URLs in that order, and an empty table returns `{ items: [] }`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests, then seed locally** from the legacy clone: `pnpm --filter @gi/api seed:site home-background ../../../api/assets/images/genshin-site/home-backgrounds` (path relative to `apps/api`). Expected: `uploaded 40`; `curl localhost:$PORT/v1/site/home-backgrounds` lists 40 URLs that load from MinIO.
- [ ] **Step 5: Commit** `feat(site): curated home backgrounds in r2 with manifest endpoint`

---

### Task 11: Deploy skeletons

Every step here creates external resources; confirm each with the user before running it.

**Files:**
- Create: `apps/api/railway.json` (build `pnpm install --frozen-lockfile && pnpm --filter @gi/api... build`, pre-deploy `pnpm --filter @gi/db db:migrate`, start `node apps/api/dist/index.js`, healthcheck `/health`)
- Create: `apps/api/railway.sync.json` (same build; start `pnpm --filter @gi/api sync`; cron `0 4 * * *`; restart policy never)
- Create: `apps/web/vercel.json` (SPA rewrite `/(.*) → /index.html`)
- Modify: `README.md` (deploy section: services, env vars, how to run a manual sync)

- [ ] **Step 1: Cloudflare R2**: user creates bucket `gi-media`, an API token (object read/write on that bucket), and public access (custom domain if they have one, else `r2.dev`). Expected: `MEDIA_PUBLIC_URL/<test-object>` serves over HTTPS.
- [ ] **Step 2: Railway** (via the Railway MCP/CLI): project `genshin-impact` with Postgres, service `api` (repo branch `remake`, config `apps/api/railway.json`), service `sync` (config `apps/api/railway.sync.json`), shared variables from Global Constraints; `CORS_ORIGIN` = the Vercel URL from Step 3. Generate a domain for `api`. Expected: `curl https://<api-domain>/health` → `{"ok":true}`.
- [ ] **Step 3: Vercel**: a **new** project `genshin-impact-remake` from branch `remake`, root `apps/web`, env `VITE_API_URL=https://<api-domain>`. The existing project keeps serving `master` (legacy) until cutover. Expected: the deployed page shows "API online".
- [ ] **Step 4: First production sync**: `curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" https://<api-domain>/admin/sync?full=1`, then follow the `sync` logs. Expected: run ends `succeeded`/`partial`; `GET /v1/characters?locale=zh-TW` returns ~138 items whose media URLs load from R2. Then run the Task 10 seed against production (`DATABASE_URL`/R2 env from Railway via `railway run`), and `GET /v1/site/home-backgrounds` returns 40 R2 URLs.
- [ ] **Step 5: Commit** `chore: railway and vercel deploy config` and push (with go-ahead).
