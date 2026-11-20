// Which skowt images we keep, and how they're stored. Amber stays the source for
// the wish splash, namecards and the small icon (it's equal or sharper there).
import type { SkowtAsset } from './skowt-client'

export type SkowtMediaKind =
  | 'icon'
  | 'side_icon'
  | 'round_icon'
  | 'wish_icon'
  | 'outfit_icon'
  | 'outfit_splash'
  | 'sheet'
  | 'art'
  | 'kit'

export interface MediaSlot {
  kind: SkowtMediaKind
  /**
   * '' for one-per-character kinds; the outfit label (`Outfit 1`, matching the
   * model variant) for outfit art; the role (`constellation.2`) for kit icons;
   * the asset id for sheets and art.
   */
  variant: string
  label: string | null
}

const SINGLE: Record<string, SkowtMediaKind> = {
  'icon.avatar': 'icon',
  'icon.side': 'side_icon',
  'icon.round': 'round_icon',
  'icon.wish': 'wish_icon',
}

export function mediaSlot(
  characterName: string,
  asset: SkowtAsset,
): MediaSlot | undefined {
  if (asset.extension === 'glb' || asset.hidden || !asset.id) return undefined
  const role = asset.role ?? ''
  const name = (asset.name ?? '').trim()
  const prefix = `${characterName} · `
  const official = name.startsWith(prefix)
  const short = official ? name.slice(prefix.length) : name

  const single = SINGLE[role]
  if (single)
    return official ? { kind: single, variant: '', label: null } : undefined

  if (role.startsWith('icon.outfit') || role.startsWith('art.outfit')) {
    // `Outfit 1 icon` / `Outfit 1 splash art` -> `Outfit 1`, the model's label.
    if (!official) return undefined
    const kind = role.startsWith('icon.') ? 'outfit_icon' : 'outfit_splash'
    const variant =
      short.replace(/\s+(icon|splash art)$/i, '').trim() || 'Outfit'
    return { kind, variant, label: short }
  }
  if (/^(skill|constellation|passive)\./.test(role)) {
    return { kind: 'kit', variant: role, label: short }
  }
  if (role.startsWith('sheet.'))
    return { kind: 'sheet', variant: asset.id, label: short || null }
  // Uploaded art (official renders, no-background cut-outs); the prefixed
  // `art.splash` is the wish splash, which Amber serves larger.
  if ((role === 'art.splash' && !official) || role === 'community.nobg') {
    return { kind: 'art', variant: asset.id, label: short || null }
  }
  return undefined
}
