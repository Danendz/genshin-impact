import { z } from 'zod'

// Only fields the adapter reads are validated; looseObject keeps upstream additions harmless.
const envelope = <T extends z.ZodType>(data: T) => z.looseObject({ data })

export const avatarListItem = z.looseObject({
  id: z.union([z.string(), z.number()]),
  rank: z.number(),
  name: z.string(),
  element: z.string().nullish(),
  weaponType: z.string(),
  region: z.string().nullish(),
  icon: z.string(),
  birthday: z.array(z.number()).nullish(),
  release: z.number().nullish(),
})
export const avatarListResponse = envelope(
  z.looseObject({ items: z.record(z.string(), avatarListItem) }),
)

export const avatarDetailResponse = envelope(
  z.looseObject({
    id: z.union([z.string(), z.number()]),
    rank: z.number(),
    name: z.string(),
    element: z.string().nullish(),
    weaponType: z.string(),
    region: z.string().nullish(),
    icon: z.string(),
    birthday: z.array(z.number()).nullish(),
    release: z.number().nullish(),
    fetter: z
      .looseObject({
        title: z.string().nullish(),
        detail: z.string().nullish(),
      })
      .nullish(),
    talent: z.record(z.string(), z.unknown()).nullish(),
    constellation: z.record(z.string(), z.unknown()).nullish(),
  }),
)

export const weaponListItem = z.looseObject({
  id: z.union([z.string(), z.number()]),
  rank: z.number(),
  type: z.string(),
  name: z.string(),
  icon: z.string(),
  isWeaponSkin: z.boolean().optional(),
})
export const weaponListResponse = envelope(
  z.looseObject({ items: z.record(z.string(), weaponListItem) }),
)

export const weaponDetailResponse = envelope(
  z.looseObject({
    id: z.union([z.string(), z.number()]),
    rank: z.number(),
    type: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    icon: z.string(),
    affix: z.unknown(),
  }),
)

export const materialListItem = z.looseObject({
  id: z.union([z.string(), z.number()]),
  rank: z.number(),
  type: z.string(),
  name: z.string(),
  icon: z.string(),
})
export const materialListResponse = envelope(
  z.looseObject({ items: z.record(z.string(), z.unknown()) }),
)
