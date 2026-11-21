import type { Element } from '@gi/shared'

function load(modules: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [path, url] of Object.entries(modules)) {
    const name = path
      .split('/')
      .pop()
      ?.replace(/\.\w+$/, '')
    if (name) out[name] = url
  }
  return out
}

const glob = <T extends string>(modules: Record<string, string>) =>
  load(modules) as Record<T, string>

export type HomeIconName =
  | 'achievements'
  | 'adventure'
  | 'archive'
  | 'bp'
  | 'character-aether'
  | 'character-archive'
  | 'character-lumine'
  | 'community'
  | 'coop'
  | 'events'
  | 'feedback'
  | 'friends'
  | 'handbook'
  | 'inventory'
  | 'map'
  | 'party'
  | 'quests'
  | 'shop'
  | 'special-event'
  | 'survey'
  | 'wish'

export type NavIconName = 'character' | 'event' | 'inventory' | 'wish'

export type StatsIconName =
  | Element
  | 'physical'
  | 'atk'
  | 'cd-reduction'
  | 'crit'
  | 'def'
  | 'dressing-room'
  | 'em'
  | 'empty'
  | 'er'
  | 'friendship'
  | 'healing-bonus'
  | 'hp'
  | 'shield-strength'
  | 'stamina'

export type PlaceholderIconName =
  | 'icon-big-placeholder'
  | 'icon-side-placeholder'

export const homeIcons = glob<HomeIconName>(
  import.meta.glob('./home/*', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
export const navIcons = glob<NavIconName>(
  import.meta.glob('./nav/*', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
export const statsIcons = glob<StatsIconName>(
  import.meta.glob('./stats/*', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
export const placeholderIcons = glob<PlaceholderIconName>(
  import.meta.glob('./placeholder/*', {
    eager: true,
    query: '?url',
    import: 'default',
  }),
)
