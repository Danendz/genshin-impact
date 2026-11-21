import { ELEMENTS, LOCALES, WEAPON_TYPES } from '@gi/shared'
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core'

export const elementEnum = pgEnum('element', ELEMENTS)
export const weaponTypeEnum = pgEnum('weapon_type', WEAPON_TYPES)
export const localeEnum = pgEnum('locale', LOCALES)
export const mediaOwnerTypeEnum = pgEnum('media_owner_type', [
  'character',
  'weapon',
  'material',
  'skill_icon',
  'model_character',
])
export const mediaKindEnum = pgEnum('media_kind', [
  'icon',
  'gacha_splash',
  'gacha_icon',
  'model_glb',
  'namecard',
  'side_icon',
  'round_icon',
  'wish_icon',
  'outfit_icon',
  'outfit_splash',
  'sheet',
  'art',
  'kit',
])
export const mediaSourceEnum = pgEnum('media_source', ['amber', 'models'])
export const mediaQualityEnum = pgEnum('media_quality', ['original', 'preview'])
export const syncStatusEnum = pgEnum('sync_status', [
  'running',
  'succeeded',
  'partial',
  'failed',
])
export const syncSourceEnum = pgEnum('sync_source', ['amber', 'models'])

const updatedAt = () => timestamp({ withTimezone: true }).notNull().defaultNow()

export const characters = pgTable(
  'characters',
  {
    id: text().primaryKey(),
    rarity: smallint().notNull(),
    element: elementEnum(),
    weaponType: weaponTypeEnum().notNull(),
    region: text(),
    birthdayMonth: smallint(),
    birthdayDay: smallint(),
    releaseAt: timestamp({ withTimezone: true }),
    sourceHash: text().notNull(),
    /** sha256 of the normalized detail record; null until a sync computed it */
    detailHash: text(),
    /** models source character slug; shared by the Traveler's element rows */
    modelSlug: text(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.modelSlug)],
)

export const characterI18n = pgTable(
  'character_i18n',
  {
    characterId: text()
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    title: text(),
    description: text(),
    details: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.characterId, t.locale] })],
)

export const weapons = pgTable('weapons', {
  id: text().primaryKey(),
  rarity: smallint().notNull(),
  weaponType: weaponTypeEnum().notNull(),
  sourceHash: text().notNull(),
  detailHash: text(),
  updatedAt: updatedAt(),
})

export const weaponI18n = pgTable(
  'weapon_i18n',
  {
    weaponId: text()
      .notNull()
      .references(() => weapons.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    description: text(),
    details: jsonb().notNull(),
  },
  (t) => [primaryKey({ columns: [t.weaponId, t.locale] })],
)

export const materials = pgTable('materials', {
  id: text().primaryKey(),
  rarity: smallint().notNull(),
  category: text().notNull(),
  sourceHash: text().notNull(),
  updatedAt: updatedAt(),
})

export const materialI18n = pgTable(
  'material_i18n',
  {
    materialId: text()
      .notNull()
      .references(() => materials.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    name: text().notNull(),
    description: text(),
  },
  (t) => [primaryKey({ columns: [t.materialId, t.locale] })],
)

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: serial().primaryKey(),
    ownerType: mediaOwnerTypeEnum().notNull(),
    ownerId: text().notNull(),
    kind: mediaKindEnum().notNull(),
    /** '' for one-per-owner kinds; outfit label, kit role or asset id otherwise */
    variant: text().notNull().default(''),
    label: text(),
    source: mediaSourceEnum().notNull().default('amber'),
    quality: mediaQualityEnum().notNull().default('original'),
    sourceUrl: text().notNull(),
    r2Key: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    contentHash: text().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [unique().on(t.ownerType, t.ownerId, t.kind, t.variant)],
)

/** One built 3D model per models source character variant (`default`, `Outfit 1`, ...). */
export const characterModels = pgTable(
  'character_models',
  {
    modelSlug: text().notNull(),
    variant: text().notNull(),
    /** null: the variant isn't a rigged character (skill props); kept so it isn't refetched */
    glbKey: text(),
    weaponKey: text(),
    propsKey: text(),
    /** R2 prefix holding toon.json and its textures */
    toonPrefix: text(),
    clips: jsonb().$type<string[]>().notNull(),
    bytes: integer().notNull(),
    /** sorted SKV container hashes the build came from */
    sourceHashes: text().array().notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.modelSlug, t.variant] })],
)

export const syncRuns = pgTable('sync_runs', {
  id: serial().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp({ withTimezone: true }),
  source: syncSourceEnum().notNull().default('amber'),
  status: syncStatusEnum().notNull(),
  counts: jsonb().notNull(),
  error: text(),
})

export const siteAssets = pgTable(
  'site_assets',
  {
    id: serial().primaryKey(),
    group: text().notNull(),
    /** source file name, for assets looked up by name (backdrops) */
    name: text(),
    r2Key: text().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    contentHash: text().notNull().unique(),
    sortOrder: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.group, t.sortOrder)],
)
