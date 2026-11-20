import type { Locale } from '@gi/shared'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { t } from '../i18n/strings'
import styles from './characters.module.css'
import type { CharacterListItem } from './queries'
import { useDragScroll } from './useDragScroll'

export function CharacterStrip({
  items,
  activeId,
  locale,
  className,
}: {
  items: CharacterListItem[]
  activeId: string | undefined
  locale: Locale
  className?: string
}) {
  const ref = useDragScroll<HTMLUListElement>()

  useEffect(() => {
    if (!activeId) return
    const active = ref.current?.querySelector('[data-status="active"]')
    active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeId, ref])

  if (items.length === 0)
    return (
      <p className={`p-4 text-sm text-white/80 ${className ?? ''}`}>
        {t(locale, 'filter.empty')}
      </p>
    )

  return (
    <nav aria-label={t(locale, 'nav.characters')} className={className}>
      <ul ref={ref} className={styles.strip}>
        {items.map((c) => (
          <li key={c.id}>
            <Link
              to="/characters/$id"
              params={{ id: c.id }}
              search={(prev) => prev}
              className={styles.icon}
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
