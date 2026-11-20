import type { Locale } from '@gi/shared'
import { Link } from '@tanstack/react-router'
import { t } from '../i18n/strings'
import styles from './characters.module.css'
import { type CharacterSearch, SECTIONS, type Section } from './details'

/** Legacy ContentOptions: the rhombus list; the section lives in the URL. */
export function SectionMenu({
  active,
  locale,
}: {
  active: Section
  locale: Locale
}) {
  return (
    <nav aria-label={t(locale, 'nav.sections')} className={styles.menu}>
      <ul>
        {SECTIONS.map((s) => (
          <li key={s}>
            <Link
              to="."
              search={(prev: CharacterSearch) => ({
                ...prev,
                // explicit even for the default: TanStack marks a link active
                // (aria-current) when its search is a subset of the URL's
                section: s,
              })}
              aria-current={s === active ? 'page' : undefined}
              className={styles.rhombus}
            >
              {t(locale, `section.${s}`)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
