import type { Locale } from '@gi/shared'
import { Link } from '@tanstack/react-router'
import { type HomeIconName, homeIcons } from '../assets/icons'
import { type StringKey, t } from '../i18n/strings'
import styles from './home.module.css'
import { Locked } from './Locked'

/** legacy home_menu.json, in order; only the character tiles have a page yet */
export const TILES: { key: string; icon: HomeIconName; to?: '/characters' }[] =
  [
    { key: 'shop', icon: 'shop' },
    { key: 'party-setup', icon: 'party' },
    { key: 'friends', icon: 'friends' },
    { key: 'achievements', icon: 'achievements' },
    { key: 'archive', icon: 'archive' },
    { key: 'character-archive', icon: 'character-archive', to: '/characters' },
    { key: 'character', icon: 'character-lumine', to: '/characters' },
    { key: 'inventory', icon: 'inventory' },
    { key: 'quests', icon: 'quests' },
    { key: 'map', icon: 'map' },
    { key: 'events', icon: 'events' },
    { key: 'adventurer-handbook', icon: 'handbook' },
    { key: 'wish', icon: 'wish' },
    { key: 'battle-pass', icon: 'bp' },
    { key: 'coop-mode', icon: 'coop' },
    { key: 'special-event', icon: 'special-event' },
    { key: 'community', icon: 'community' },
    { key: 'feedback', icon: 'feedback' },
    { key: 'survey', icon: 'survey' },
  ]

export function Tiles({ locale }: { locale: Locale }) {
  return (
    <nav className={styles.tilesWrap}>
      <ul className={styles.tiles}>
        {TILES.map((tile) => {
          const caption = t(locale, `home.nav.${tile.key}` as StringKey)
          const style = { backgroundImage: `url(${homeIcons[tile.icon]})` }
          return (
            <li key={tile.key}>
              {tile.to ? (
                <Link
                  to={tile.to}
                  search={(s) => (s.locale ? { locale: s.locale } : {})}
                  className={styles.tile}
                >
                  <span className={styles.tileArt} style={style} />
                  <span className={styles.caption}>{caption}</span>
                </Link>
              ) : (
                <Locked label={caption} className={styles.tile}>
                  <span className={styles.tileArt} style={style} />
                  <span className={styles.caption}>{caption}</span>
                </Locked>
              )}
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
