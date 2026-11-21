# packages/models (@gi/models)

A TypeScript port of the Python model build pipeline (`../models/build.py`, outside this repo, is the reference implementation). It turns a character's source containers (SKV) into viewer-ready files: a merged GLB with animations, meshopt-compressed weapon and props GLBs, and a toon sidecar (`toon.json` plus WebP textures). It depends on `@gltf-transform/*`, `meshoptimizer` (pinned versions) and `sharp`.

## Layout

```
src/
  skv.ts          decode SKV containers (decodeSkv, isSkv)
  assemble.ts     containers → parts; ModelKind (avatar | npc | monster); BuildError
  merge-anim.ts   meshopt decompress + merge the animation library into the model
  glb.ts          parse/write GLB, rebrand the generator string
  toon.ts         toon material sidecar + texture conversion
  build.ts        buildCharacter / buildVariantFrom: the one-step entry used by apps/api
scripts/golden.ts parity check against the Python outputs
```

## Rules

- **Output must stay byte-identical to the reference** for GLB binary chunks, weapons and props, and pixel-identical for textures. Any change to build output must pass `pnpm --filter @gi/models golden [Name ...]` (it needs the `../models` checkout or `MODELS_DIR`). If golden can't run, say so. Don't claim parity without it.
- `@gltf-transform/*` and `meshoptimizer` are pinned exactly because output bytes depend on them. Don't bump them without running golden.
- Pure functions in, bytes out: no network, DB or R2 here. Fetching and storage belong to `apps/api/src/models-sync`.
- `buildVariantFrom` returns `undefined` for variants that aren't rigged characters (skill props). Callers record those rows so the variant isn't refetched.
- Use neutral naming. Don't put the upstream source's brand in identifiers, generator strings or logs (`BRAND` in `glb.ts` is the generator name).
- Tests use small synthetic fixtures (`*.test.ts`). Run: `pnpm vitest run --project models`.
