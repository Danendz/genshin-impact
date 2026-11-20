import type { Element, Locale } from '@gi/shared'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { GenshinIcon } from '../components/GenshinIcon'
import { type StringKey, t } from '../i18n/strings'
import { CloseButton } from './CloseButton'
import styles from './characters.module.css'
import type { CharacterListItem } from './queries'
import { useDragScroll } from './useDragScroll'

/** Legacy CharactersPanel: element and name, the avatar strip, and the close button. */
export function TopBar({
  items,
  current,
  locale,
}: {
  items: CharacterListItem[]
  current: CharacterListItem | undefined
  locale: Locale
}) {
  const element = current?.element as Element | null | undefined
  return (
    <header className={styles.topBar}>
      <div className={styles.topBarInner}>
        <p className={styles.info}>
          {element && (
            <span style={{ color: `var(--color-${element})` }}>
              <GenshinIcon name={element} className={styles.infoGlyph} />
            </span>
          )}
          {current && (
            <span className="truncate">
              {element ? t(locale, `element.${element}` as StringKey) : ''}/
              {current.name}
            </span>
          )}
        </p>
        <AvatarStrip items={items} activeId={current?.id} locale={locale} />
        <CloseButton label={t(locale, 'close')} to="/" className="ml-auto" />
      </div>
    </header>
  )
}

function AvatarStrip({
  items,
  activeId,
  locale,
}: {
  items: CharacterListItem[]
  activeId: string | undefined
  locale: Locale
}) {
  const ref = useDragScroll<HTMLUListElement>()
  useEffect(() => {
    if (!activeId) return
    const active = ref.current?.querySelector('[data-status="active"]')
    active?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [activeId, ref])
  if (items.length === 0)
    return (
      <p className="min-w-0 flex-1 truncate px-4 text-sm text-white/80">
        {t(locale, 'filter.empty')}
      </p>
    )
  return (
    <nav aria-label={t(locale, 'nav.characters')} className="min-w-0 flex-1">
      <ul ref={ref} className={styles.strip}>
        {items.map((c) => (
          <li key={c.id}>
            <Link
              to="/characters/$id"
              params={{ id: c.id }}
              search={(prev) => prev}
              className={styles.avatar}
              aria-label={c.name}
              title={c.name}
              draggable={false}
            >
              {c.media.icon && (
                <img
                  src={c.media.icon}
                  alt=""
                  loading="lazy"
                  draggable={false}
                />
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
