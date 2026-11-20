import { characterI18n, characters, type Db } from '@gi/db'
import { and, eq } from 'drizzle-orm'
import type { SkowtCharacter } from './skowt-client'

/** Amber splits the Travelers by element; skowt has one entry per twin. */
const OVERRIDES: [RegExp, string][] = [
  [/^10000005(-|$)/, 'traveler-aether'],
  [/^10000007(-|$)/, 'traveler-lumine'],
]

export const normalizeName = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Fill `characters.skowt_slug` from the English name. Returns the skowt slugs
 * no Amber character matched (assets are still stored; they link up once
 * Amber has the character).
 */
export async function matchCharacters(
  db: Db,
  roster: SkowtCharacter[],
): Promise<{ updated: number; unmatched: string[] }> {
  const bySlug = new Set(roster.map((c) => c.slug))
  const byName = new Map(roster.map((c) => [normalizeName(c.name), c.slug]))
  const rows = await db
    .select({
      id: characters.id,
      slug: characters.skowtSlug,
      name: characterI18n.name,
    })
    .from(characters)
    .innerJoin(
      characterI18n,
      and(
        eq(characterI18n.characterId, characters.id),
        eq(characterI18n.locale, 'en'),
      ),
    )
  const matched = new Set<string>()
  let updated = 0
  for (const row of rows) {
    const override = OVERRIDES.find(([re]) => re.test(row.id))?.[1]
    const slug =
      (override && bySlug.has(override) ? override : undefined) ??
      byName.get(normalizeName(row.name)) ??
      null
    if (slug) matched.add(slug)
    if (slug !== row.slug) {
      await db
        .update(characters)
        .set({ skowtSlug: slug })
        .where(eq(characters.id, row.id))
      updated++
    }
  }
  return {
    updated,
    unmatched: roster.map((c) => c.slug).filter((s) => !matched.has(s)),
  }
}
