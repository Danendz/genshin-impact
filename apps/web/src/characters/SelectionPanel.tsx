import {
  ELEMENTS,
  type Element,
  type Locale,
  WEAPON_TYPES,
  type WeaponType,
} from '@gi/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { GenshinIcon } from '../components/GenshinIcon'
import { type StringKey, t } from '../i18n/strings'
import { CloseButton } from './CloseButton'
import styles from './characters.module.css'
import type { CharacterSearch } from './details'
import { Icon } from './icons'
import type { CharacterListItem } from './queries'

type Key = 'element' | 'weaponType' | 'rarity'

/** legacy sort options; '' keeps the list's order */
const SORTS = ['', 'name', 'rarity', 'element', 'weaponType'] as const
type Sort = (typeof SORTS)[number]

function sorted(
  items: CharacterListItem[],
  sort: Sort,
  reverse: boolean,
  locale: Locale,
) {
  const rank = (list: readonly string[], v: string | null) =>
    v === null ? list.length : list.indexOf(v)
  const by: Record<
    Sort,
    (a: CharacterListItem, b: CharacterListItem) => number
  > = {
    '': () => 0,
    name: (a, b) => a.name.localeCompare(b.name, locale),
    rarity: (a, b) => a.rarity - b.rarity,
    element: (a, b) => rank(ELEMENTS, a.element) - rank(ELEMENTS, b.element),
    weaponType: (a, b) =>
      rank(WEAPON_TYPES, a.weaponType) - rank(WEAPON_TYPES, b.weaponType),
  }
  const out = [...items].sort(by[sort])
  return reverse ? out.reverse() : out
}

/** Legacy CharacterSelection: a left panel with every character and the filters. */
export function SelectionPanel({
  items,
  activeId,
  search,
  locale,
  onClose,
}: {
  items: CharacterListItem[]
  activeId: string | undefined
  search: CharacterSearch
  locale: Locale
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [filterOpen, setFilterOpen] = useState(false)
  const [sort, setSort] = useState<Sort>('')
  const [reverse, setReverse] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const set = (key: Key, value: string | number | undefined) =>
    navigate({
      to: '.',
      search: (prev: CharacterSearch) => ({ ...prev, [key]: value }),
    })
  const label = (key: Key, v: string | number) =>
    key === 'rarity'
      ? `${v}★`
      : t(
          locale,
          `${key === 'element' ? 'element' : 'weapon'}.${v}` as StringKey,
        )
  const active = (['element', 'weaponType', 'rarity'] as const).filter(
    (k) => search[k] !== undefined,
  )
  const group = (
    key: Key,
    title: StringKey,
    values: readonly (string | number)[],
  ) => (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="mb-1.5 text-sm text-white/70">
        {t(locale, title)}
      </legend>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={styles.chip}
          aria-pressed={search[key] === v}
          onClick={() => set(key, search[key] === v ? undefined : v)}
        >
          {key === 'element' && (
            <GenshinIcon name={v as Element} className="mr-1" />
          )}
          {key === 'weaponType' && (
            <GenshinIcon name={v as WeaponType} className="mr-1" />
          )}
          {label(key, v)}
        </button>
      ))}
    </fieldset>
  )

  return (
    <section
      role="dialog"
      aria-label={t(locale, 'selection.title')}
      className={styles.selection}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-2xl text-[#dfdcd1]">
          {t(locale, 'selection.title')}
        </h2>
        <CloseButton label={t(locale, 'close')} onClick={onClose} />
      </header>
      {items.length === 0 ? (
        <p className="py-6 text-white/80">{t(locale, 'filter.empty')}</p>
      ) : (
        <ul className={styles.grid}>
          {sorted(items, sort, reverse, locale).map((c) => (
            <li key={c.id}>
              <Link
                to="/characters/$id"
                params={{ id: c.id }}
                search={(prev) => prev}
                className={styles.pickCard}
                data-rarity={c.rarity}
                aria-label={c.name}
                title={c.name}
                aria-current={c.id === activeId ? 'page' : undefined}
              >
                <span className={styles.cardTop}>
                  {c.media.icon && (
                    <img
                      src={c.media.icon}
                      alt=""
                      loading="lazy"
                      className={styles.cardImg}
                    />
                  )}
                  {c.element && (
                    <span
                      className={styles.cardElement}
                      style={{ color: `var(--color-${c.element})` }}
                    >
                      <GenshinIcon name={c.element as Element} />
                    </span>
                  )}
                </span>
                <span className={styles.cardLvl}>
                  {t(locale, 'level.short')} 90
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {active.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {active.map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.chip} bg-white/10`}
              aria-label={`${t(locale, 'filter.clear')}: ${label(k, search[k] as string | number)}`}
              onClick={() => set(k, undefined)}
            >
              {label(k, search[k] as string | number)}
              <GenshinIcon name="close" className="ml-1 text-xs" />
            </button>
          ))}
          <button
            type="button"
            className={styles.chip}
            onClick={() =>
              navigate({
                to: '.',
                search: (prev: CharacterSearch) => ({
                  section: prev.section,
                  locale: prev.locale,
                }),
              })
            }
          >
            {t(locale, 'filter.clear')}
          </button>
        </div>
      )}
      <div className={styles.filters}>
        <button
          type="button"
          className={styles.filterBtn}
          aria-label={t(locale, 'filter.title')}
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((o) => !o)}
        >
          <Icon name="filter" className="size-5" />
        </button>
        <select
          aria-label={t(locale, 'sort.label')}
          className={styles.sortSelect}
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
        >
          {SORTS.map((o) => (
            <option key={o} value={o}>
              {t(locale, `sort.${o || 'default'}` as StringKey)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.filterBtn}
          aria-label={t(locale, 'sort.reverse')}
          aria-pressed={reverse}
          onClick={() => setReverse((r) => !r)}
        >
          <Icon name="sort" className="size-5" />
        </button>
      </div>
      {filterOpen && (
        <fieldset
          aria-label={t(locale, 'filter.title')}
          className={styles.filterSheet}
        >
          <h3 className="text-2xl text-[#c9c2a6]">
            {t(locale, 'filter.title')}
          </h3>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {group('element', 'filter.element', ELEMENTS)}
            {group('weaponType', 'filter.weapon', WEAPON_TYPES)}
            {group('rarity', 'filter.rarity', [5, 4])}
          </div>
          <button
            type="button"
            className={styles.confirm}
            onClick={() => setFilterOpen(false)}
          >
            {t(locale, 'filter.confirm')}
          </button>
        </fieldset>
      )}
    </section>
  )
}
