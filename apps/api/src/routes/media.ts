import { characterModels, type Db, mediaAssets } from '@gi/db'
import { and, asc, eq, inArray } from 'drizzle-orm'
import type { MediaStore } from '../media/store'

export type MediaKind = (typeof mediaAssets.$inferSelect)['kind']
export type MediaMap = Partial<Record<MediaKind, string>>
export type MediaOwnerType = (typeof mediaAssets.$inferSelect)['ownerType']

export async function loadMedia(
  db: Db,
  store: MediaStore,
  ownerType: MediaOwnerType,
  ids: string[],
): Promise<Map<string, MediaMap>> {
  const out = new Map<string, MediaMap>()
  if (ids.length === 0) return out
  const rows = await db
    .select({
      ownerId: mediaAssets.ownerId,
      kind: mediaAssets.kind,
      r2Key: mediaAssets.r2Key,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerType, ownerType),
        inArray(mediaAssets.ownerId, ids),
        eq(mediaAssets.variant, ''),
      ),
    )
  for (const r of rows) {
    const m = out.get(r.ownerId) ?? {}
    m[r.kind] = store.publicUrl(r.r2Key)
    out.set(r.ownerId, m)
  }
  return out
}

/** source images that exist once per character, merged into `media` */
const MODEL_SINGLE: MediaKind[] = ['side_icon', 'round_icon', 'wish_icon']

/** `media` for characters: Amber's kinds plus the source's single icons. */
export async function loadCharacterMedia(
  db: Db,
  store: MediaStore,
  rows: { id: string; modelSlug: string | null }[],
): Promise<Map<string, MediaMap>> {
  const amber = await loadMedia(
    db,
    store,
    'character',
    rows.map((r) => r.id),
  )
  const slugs = [...new Set(rows.flatMap((r) => r.modelSlug ?? []))]
  const extras = await loadMedia(db, store, 'model_character', slugs)
  const out = new Map<string, MediaMap>()
  for (const r of rows) {
    const m: MediaMap = { ...amber.get(r.id) }
    const extra = r.modelSlug ? extras.get(r.modelSlug) : undefined
    for (const kind of MODEL_SINGLE) if (extra?.[kind]) m[kind] = extra[kind]
    out.set(r.id, m)
  }
  return out
}

export type ModelAssetItem = {
  kind: MediaKind
  variant: string
  label: string | null
  url: string
  width: number
  height: number
  quality: 'original' | 'preview'
}

/** Every source image of a character (icons, outfits, sheets, art, kit). */
export async function loadModelAssets(
  db: Db,
  store: MediaStore,
  slug: string,
): Promise<ModelAssetItem[]> {
  const rows = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerType, 'model_character'),
        eq(mediaAssets.ownerId, slug),
      ),
    )
    .orderBy(asc(mediaAssets.kind), asc(mediaAssets.variant))
  return rows.map((r) => ({
    kind: r.kind,
    variant: r.variant,
    label: r.label,
    url: store.publicUrl(r.r2Key),
    width: r.width,
    height: r.height,
    quality: r.quality,
  }))
}

export type CharacterModel = {
  variant: string
  glb: string
  weapon: string | null
  props: string | null
  /** base URL of toon.json and its textures */
  toon: string
  clips: string[]
}

/** Built 3D variants, `default` first; skill-prop extras are left out. */
export async function loadModels(
  db: Db,
  store: MediaStore,
  slug: string,
): Promise<CharacterModel[]> {
  const rows = await db
    .select()
    .from(characterModels)
    .where(eq(characterModels.modelSlug, slug))
    .orderBy(asc(characterModels.variant))
  const url = (k: string | null) => (k ? store.publicUrl(k) : null)
  return rows
    .filter((r) => r.glbKey && r.toonPrefix)
    .sort(
      (a, b) =>
        Number(b.variant === 'default') - Number(a.variant === 'default'),
    )
    .map((r) => ({
      variant: r.variant,
      glb: store.publicUrl(r.glbKey as string),
      weapon: url(r.weaponKey),
      props: url(r.propsKey),
      toon: store.publicUrl(r.toonPrefix as string),
      clips: r.clips,
    }))
}
