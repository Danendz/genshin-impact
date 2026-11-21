# Models Asset Pipeline: Implementation Plan

## Context

The remake (`~/Projects/genshin-impact/genshin-impact-vue`, branch `remake`) currently gets character data and images from Amber only. The Python toolchain in `~/Projects/genshin-impact/models` can pull 3D models and extra art from the models source and build viewer-ready GLBs and toon sidecars. All 124 characters are already fetched locally (4.3 GB).

Goal:
1. Port the Python build pipeline to TypeScript, checked against Python output with golden tests.
2. Do a one-time bulk upload to R2 from the local folders.
3. Run a daily Railway cron that discovers new or changed source characters, fetches, builds and uploads only what changed, and records every asset in Postgres so the UI can connect them.

Decisions already made in the grilling session:
- Amber stays the source for splash, namecard and the existing icon/splash/namecard kinds; it is equal or better there (gacha splash 2048 vs source 1430).
- From source we take:
  - icons: `icon`, `side_icon`, `round_icon`, `wish_icon`, `outfit_icon`
  - character sheets and art
  - outfit splash
  - kit icons
- TCG art and source namecards are skipped.
- 3D upload: per variant (default plus each rigged outfit), the merged `<Name>.glb`, `-weapon.glb`, `-props.glb` and the toon sidecar. Raw `decoded/` files and `*-uncompressed.glb` are not uploaded.
- Backdrops (3 files) are uploaded once as site assets, byte-for-byte, because `palette.webp` is a data texture.
- Assets are linked to characters through `characters.model_slug`. It is nullable and not unique: all 7 Traveler element rows share `traveler-aether` or `traveler-lumine`.
- Models source rows are keyed by slug, not by an FK, so characters that source has before Amber are still stored.
- Encoding:
  - art and icons: WebP q90
  - toon textures: lossless WebP (lightmap alpha holds the material id)
  - GLBs: uploaded as built
- R2 keys are content-addressed and immutable. The cron never deletes; a manual `--gc` removes unreferenced objects.
- Auth: `MODELS_COOKIE` env. On 401, fall back to previews stored with `quality='preview'`; a later run with a working cookie upgrades them automatically. The run warns in logs and in `sync_runs`.
- Runtime: a separate Railway cron service `models-sync` at `0 5 * * *`, one hour after the Amber `sync` at `0 4`.

**Language: TypeScript, not Rust.** Measured: Python decodes Citlali's 8.2 MB of SKV in 1.6 s. Almost all of that is the pure-Python u32 xor/PRNG loop, which JS JIT-compiles to near-native speed with typed arrays and `Math.imul`. The other heavy steps are already native in Node: zlib (`node:zlib`), meshopt (WASM) and images (sharp/libvips). Rust would add a cargo/napi toolchain to the Railway build for maybe a 2× gain on the remaining ~tens of milliseconds. The cron also only rebuilds characters that changed. Fallback: if profiling ever shows `skv.ts` is hot, compile only the decoder to a Rust→WASM module behind the same `decodeSkv` signature.

## Global constraints

- Follow the monorepo conventions:
  - Biome
  - vitest, with DB tests using `inject('dbUrl')` and `resetDb`
  - Drizzle `casing: 'snake_case'`; migrations generated with `pnpm --filter @gi/db db:generate`
  - Hono RPC types flow to the web app through `@gi/api/app`
- Reuse:
  - `MediaStore`, `createS3Store` and `createMemoryStore` (`apps/api/src/media/`)
  - `processImage` and `mediaKey` (`media/process-image.ts`)
  - `parseCliEnv` (`apps/api/src/env.ts`)
  - `createDb` and `runMigrations` (`@gi/db`)
  - the advisory lock and `sync_runs` pattern from `apps/api/src/sync/run-sync.ts`
- Never commit game data such as SKV containers or decoded GLBs. Golden tests read them from `../models/characters` and are opt-in (`GOLDEN=1`).
- The Python toolchain stays untouched as the reference implementation.

## File structure

| Path | Responsibility |
|---|---|
| `packages/models/` (`@gi/models`, new) | Pure TS build library with no DB or network: SKV decode, GLB I/O, assembly, anim merge, toon sidecar, `buildCharacter` |
| `packages/models/src/skv.ts` | Port of `tools/skv_decode.py` (mix_c, PRNG, xor, directory, block unshuffle, zlib/adler sections → GLB) |
| `packages/models/src/glb.ts` | `parseGlb` / `writeGlb` / `imageBytes` (port of `tools/glb.py`) |
| `packages/models/src/assemble.ts` | Role classification, `isCharacterModel`, `characterName`, weapon ordering (from `build.py`) |
| `packages/models/src/merge-anim.ts` | Meshopt decompress in-process with `@gltf-transform` + `meshoptimizer`, then the `merge_anim.py` logic |
| `packages/models/src/toon.ts` | Port of `tools/toon_sidecar.py`; images via sharp, output as lossless WebP plus `toon.json` that references `.webp` names |
| `packages/models/src/build.ts` | `buildCharacter({main: Uint8Array[], extras: Record<label, Uint8Array[]>, name?, element?}) → BuildOutput` |
| `packages/models/scripts/golden.ts` | Compares TS output with the Python outputs for every character in `../models/characters` |
| `packages/db/src/schema.ts` | Schema changes (below), plus a new migration |
| `apps/api/src/models-sync/source-client.ts` | Port of the source API parts of `fetch_characters.py`: roster, character, weapons, `viewer/links`, `pack` download, `downloads.generate`, 429 retry/backoff and throttle |
| `apps/api/src/models-sync/source.ts` | `ModelsSource` interface with `SourceSource` and `LocalDirSource` (reads the `../models/characters/<Name>/{source,extras,media}` layout) |
| `apps/api/src/models-sync/media-roles.ts` | Allowlist mapping source `role` → `{kind, variant}` |
| `apps/api/src/models-sync/match.ts` | Fills `characters.model_slug` by normalized English name plus Traveler overrides |
| `apps/api/src/models-sync/run-models-sync.ts` | Lock, diff, build, upload, upsert, `sync_runs` |
| `apps/api/src/models-sync/gc.ts` | Lists `model_character/` and `model/` prefixes and deletes keys no row references |
| `apps/api/src/models-sync/cli.ts` | CLI entry point |
| `apps/api/src/routes/characters.ts`, `routes/media.ts` | Expose models and source media |
| `apps/web/src/characters/TopBar.tsx`, `characters.module.css` | Side-icon avatar that breaks out of its circle |

## Schema changes (`packages/db/src/schema.ts`)

- `characters.modelSlug`: `text()`, nullable, indexed.
- `mediaOwnerTypeEnum`: add `model_character`.
- `mediaKindEnum`: add `side_icon`, `round_icon`, `wish_icon`, `outfit_icon`, `sheet`, `art`, `outfit_splash`, `kit`.
- New enums:
  - `mediaSourceEnum`: `amber | source`
  - `mediaQualityEnum`: `original | preview`
- `media_assets` new columns:
  - `variant text not null default ''` (the outfit label or kit role; `''` for single-instance kinds)
  - `source` (default `amber`)
  - `quality` (default `original`)
- `media_assets` unique key changes to `(ownerType, ownerId, kind, variant)`. Update the `onConflictDoUpdate` target in `media/sync-media.ts` to match; Amber behaviour stays the same with `variant=''`.
- New table `character_models`:
  - `modelSlug text`
  - `variant text` (`default` or the outfit label)
  - `label text`
  - `glbKey text not null`, `weaponKey text`, `propsKey text`
  - `toonPrefix text`
  - `clips jsonb not null` (`string[]`)
  - `bytes integer`
  - `sourceHashes text[] not null` (sorted container hashes)
  - `contentHash text not null`
  - `updatedAt`
  - primary key `(modelSlug, variant)`
- `sync_runs.source`: enum `amber | source`, default `amber`.
- `site_assets.name`: nullable `text`, so backdrops can be looked up by file name.

R2 keys:
- Images: `model_character/<slug>/<kind>[-<variant>]-<hash12>.webp`. Extend `mediaKey` with an optional variant, slugified.
- Models: `model/<slug>/<variant>/<role>-<hash12>.glb`.
- Toon: `model/<slug>/<variant>/toon-<hash12>/{toon.json, *.webp}`, where the hash is taken over the sorted sidecar file hashes, so the whole prefix is immutable.

---

### Task 0: Memory

Write a feedback memory, `workflow-no-specs.md`, and add it to `MEMORY.md`:
> Skip writing spec docs. After grilling or brainstorming, go straight to an implementation plan.

Reason: the user asked to stop doing spec + plan. There is no existing memory to remove; the old two-step flow came from the superpowers brainstorming skill.

Copy this plan into the repo at `docs/superpowers/plans/2026-11-20-models-asset-pipeline.md`.

---

### Task 1: `@gi/models` scaffold and SKV decoder

- Scaffold the package (package.json, tsconfig, vitest project), with dependencies on `@gltf-transform/core`, `@gltf-transform/extensions`, `meshoptimizer` and `sharp`. Use the same versions as `models/.tools/package.json`, so the decompressed BIN matches Python's.
- Port `skv_decode.py` in `src/skv.ts`:
  - Use `Math.imul` / `>>> 0`.
  - Use `node:zlib` `inflateSync` on the stream without the 4-byte adler trailer, then verify the adler32 values against the directory.
  - Export `decodeSkv(bytes) → {role, version, glb}` and `isSkv(bytes)`.
- Unit tests:
  - `mixC` and the PRNG against vectors generated once from the Python functions (write the vectors into the test).
  - Header and directory validation errors on corrupted input.
- Golden test: every `characters/*/source/*` and `extras/*/*` file decodes byte-exactly to the matching `decoded/<role>.glb`.

### Task 2: GLB I/O and assembly

- `src/glb.ts`: `parseGlb`, `writeGlb`, `imageBytes`.
- `src/assemble.ts`:
  - `assemble(parts)` uses the same rules as `build.py`: exactly one `model` role with an `Avatar_` root; other models become weapons in decode order; first anim/toon/props wins.
  - `characterName(rootName)`.
  - Use the code-point sort that matches Python's `sorted(Path)`, so `weapon` vs `weapon-2` assignment matches.
- Unit tests on synthetic GLB docs.
- Golden test: the role → file assignment matches the Python `decoded/` names for every character and extra.

### Task 3: Anim merge

- `src/merge-anim.ts`:
  - Meshopt decompress through `NodeIO` with `MeshoptDecoder`, the same code as `.tools/decompress.mjs`.
  - Then port `merge_animations`: name remap, BIN append with 4-byte padding, shifted bufferViews/accessors, clip key order.
  - Returns `{glb, clips}`.
- Golden test against `viewer/models/<Name>/<Name>.glb`:
  - parsed JSON deep-equal (do not compare JSON bytes; Python float formatting differs);
  - BIN chunk byte-equal.

### Task 4: Toon sidecar

- `src/toon.ts`: port `build_sidecar`:
  - Image index order: model, then toon, then weapons.
  - Material slot rules, the face material pass, the `.alpha` merge, the 1×1 weapon lightmap, and first-name-wins dedup.
  - Decode with sharp (raw RGBA) and encode lossless WebP. Keep RGB for normal maps.
  - `toon.json` file names use `.webp`.
- Golden test against `viewer/toon/<Name>/`:
  - `toon.json` is equal after the `.png` → `.webp` swap;
  - every texture's decoded pixels equal Python's PNG pixels.
  - If sharp's libwebp lossy decode differs from `dwebp`, allow a max channel delta of ≤1 and report it.

### Task 5: `buildCharacter`

`src/build.ts` takes container bytes for main and extras, decodes them, assembles, merges, builds the sidecar, and returns:

```ts
BuildOutput = {
  name,
  variants: Array<{
    variant,
    label,
    glb,
    weapon?,
    props?,
    toon: { json, files: Record<string, Uint8Array> },
    clips,
    sourceHashes,
  }>,
  skipped: string[],
}
```

- Extras without a rigged `Avatar_` model are skipped, e.g. `Itzpapa Skill`.
- Add `scripts/golden.ts`, which runs Tasks 1–4 over all 124 characters and prints pass/fail per character (`pnpm --filter @gi/models golden`).

### Task 6: DB migration

Apply the schema changes above and generate the migration. Update `sync-media.ts` (conflict target, `variant: ''`, `source: 'amber'`) and its tests. Existing API tests must stay green.

### Task 7: Source client and media roles

- `source-client.ts`: port the tRPC calls, `viewer_hashes` (`format === 1`, 32-hex), `collect_hashes`, `extra_label`, default weapon, `viewer/links` with a single retry on 403, the `pack` download with a MAGIC check, `downloads.generate` with the cookie (401 → `AuthError`), and the 429 backoff and throttle. Inject `fetch` so it can be tested.
- Before writing `media-roles.ts`, dump the real `role` strings for 2–3 characters with a one-off read-only script. Then write the allowlist:
  - `icon.*` → `icon`, `side_icon`, `round_icon`, `wish_icon`, `outfit_icon`
  - `sheet.*` → `sheet`
  - main `art.*` → `art`
  - outfit art → `outfit_splash` with `variant`
  - `skill.*`, `constellation.*`, `passive.*` → `kit` with `variant = role`
  - everything else, including TCG, namecards, wish splash and character card, is ignored.
- Unit tests use a fake fetch with recorded JSON shapes.

### Task 8: Sources and matching

- `ModelsSource` methods:
  - `listCharacters() → {slug, name, element, hasModel}[]`
  - `getCharacter(slug) → {containers: {main: hash[], extras: Record<label, hash[]>}, media: {assetId, role, ext}[]}`
  - `fetchContainers(hashes)`
  - `fetchImage(asset, preferOriginal) → {bytes, quality}`
- `SourceSource` wraps the client. `LocalDirSource(dir)` reads the existing folders:
  - slug comes from the folder name (`folder_name` inverse via the roster file or lowercase-kebab)
  - containers come from `source/` and `extras/*/`
  - media comes from `media/<Group>/` with the file name mapped to a role
  - quality is `original` for `.png` and `preview` for `.webp`
- `match.ts`:
  - Normalize the English `character_i18n.name` and the source name (lowercase, alphanumerics only).
  - Override `10000005-*` → `traveler-aether` and `10000007-*` → `traveler-lumine`.
  - Write `model_slug` and return the slugs it could not match.
- DB tests for matching.

### Task 9: `runModelsSync`

- `runModelsSync(deps, opts: {only?: string[], force?, dryRun?})`:
  - Take its own advisory lock key; return `'busy'` if it is held.
  - Write a `sync_runs` row with `source='models'`.
  - Run matching first.
- Per character, 2 at a time (memory bound):
  1. **Models:**
     - Compare the sorted container hashes per variant with `character_models.sourceHashes`.
     - If they changed: fetch, `buildCharacter`, put every file under its content-addressed key (`store.exists` first), then upsert `character_models`.
  2. **Media:**
     - The source URL is `models:asset/<id>`. Skip if the row's source URL is unchanged and either the row is `quality='original'` or no cookie is configured.
     - Otherwise run `processImage` with q90 (add a `quality` param to `processImage`, default 85 so Amber is unchanged).
     - Upsert with `source='models'`, `owner model_character/<slug>`.
- Counts: `{models: {built, skipped, failed}, media: {uploaded, skipped, failed, previews}}`.
- If any `AuthError` occurs, set `error: 'source cookie expired; saved previews'` and status `partial`.
- Tests: memory store, fake source, and the real test DB. Cover:
  - first run builds;
  - second run skips everything;
  - a changed hash rebuilds only that variant;
  - a preview is upgraded once the cookie works;
  - an unmatched slug is still stored.
  - Stub `buildCharacter` in these tests; the build itself is covered in `@gi/models`.

### Task 10: CLI, GC, build entries

- `models-sync/cli.ts` flags: `--source-dir <path>` (`LocalDirSource`), `--only slug,...`, `--force`, `--dry-run`, `--gc [--yes]`. GC prints the orphans and deletes only with `--yes`.
- Add `deleteObject` and `list(prefix)` to `MediaStore`, `s3-store.ts` and `memory-store.ts`.
- Env: an optional `MODELS_COOKIE` in `parseCliEnv`.
- Add a `models-cli` entry in `apps/api/tsup.config.ts` and a `models:sync` script in `apps/api/package.json` (`tsx --env-file-if-exists=../../.env src/models-sync/cli.ts`).

### Task 11: Backdrops

- Add a `raw: true` option to `seedSiteAssets`: store the bytes unchanged, read the size via sharp metadata, keep the source extension in the key, and set `name`.
- Run `pnpm --filter @gi/api seed:site backdrop ../models/viewer/backdrops/** --raw`. Allow the seed CLI to walk subfolders and use `gi/sky` as the name.
- Add the route `GET /v1/site/backdrops` returning `{name → url}`.

### Task 12: API

- `routes/media.ts`: add `loadModelMedia(db, store, slugs) → Map<slug, Array<{kind, variant, url, width, height, quality}>>`.
- `routes/characters.ts`:
  - List: join `model_slug` and merge single-instance source kinds into `media` (`side_icon`, `round_icon`, `wish_icon`; Amber's `icon` stays).
  - Detail: add `models: [{variant, label, glb, weapon, props, toon, clips}]` (URLs built with `store.publicUrl`; `toon` = the prefix URL) and `assets` (the full source list).
- Extend the route tests.

### Task 13: Web top bar

In `TopBar.tsx` `AvatarStrip`, render `media.side_icon ?? media.icon`. Change the CSS:
- The ring stays a circle background (`--color-avatar-ring`).
- The image sits above it with `overflow: visible`.
- `clip-path` only cuts the bottom half of the circle (e.g. `clip-path: inset(-50% -50% 0 -50% round 0 0 50% 50%)` or a pseudo-element mask), so the head rises above the ring.
- Update the TopBar tests to cover the side_icon fallback.

### Task 14: Bulk upload (run from the user's machine)

- Run `pnpm --filter @gi/models golden` and require it to be all green first.
- Local dry run: `pnpm --filter @gi/api models:sync --source-dir ../../../models/characters --dry-run` against the local docker DB and SeaweedFS. Then a real local run; check the API output and the R2 objects.
- Production:
  - The local `.env` points R2 at prod.
  - Temporarily add a Postgres TCP proxy, run the migration and the bulk run, then remove the proxy.
  - **Confirm with the user before touching prod.**

### Task 15: Railway service

- Create the `models-sync` service in the `genshin-impact` Railway project with the same repo and build as `sync`.
- Start command: `node apps/api/dist/models-cli.js`. Cron: `0 5 * * *`. Restart policy: never. Pre-deploy: `db:migrate`.
- Variables: `DATABASE_URL`, `R2_*`, `MEDIA_PUBLIC_URL`, `MODELS_COOKIE`.
- Service settings are set directly on Railway (new services can't opt in to railway.json). Commit `apps/api/railway.models.json` as documentation only.
- Trigger one run manually and check the `sync_runs` row.

---

## Verification

- `pnpm test`: all unit and DB tests pass, including the existing Amber sync tests.
- `GOLDEN=1 pnpm --filter @gi/models golden`: all 124 characters plus their extras match Python. Decoded output is byte-exact; merged GLBs are equal as parsed JSON with byte-equal BIN; toon pixels are equal.
- Local end-to-end with `docker compose up`, migrate, `models:sync --source-dir … --only citlali,traveler-aether`:
  - `GET /v1/characters/10000107` returns `models[0].glb` and its toon URLs, which load (curl 200 from SeaweedFS);
  - `traveler-aether` assets appear on all `10000005-*` rows.
- A second run reports everything skipped.
- `--gc` with no `--yes` lists 0 orphans.
- Load a built GLB plus its toon prefix in the existing Python viewer (`serve.py`) to compare rendering visually.
- Web: `pnpm --filter web dev`; the top bar shows side icons breaking out of their rings.
- Prod: after the bulk upload and the first cron run, the `sync_runs` row with `source='models'` is `succeeded`, or `partial` with the cookie warning.
