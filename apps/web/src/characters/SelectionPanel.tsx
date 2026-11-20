import { ELEMENTS, type Element, type Locale, WEAPON_TYPES } from '@gi/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { GenshinIcon } from '../components/GenshinIcon'
import { type StringKey, t } from '../i18n/strings'
import styles from './characters.module.css'
import type { CharacterSearch } from './details'
import { Icon } from './icons'
import { animateOut, useFlip } from './motion'
import type { CharacterListItem } from './queries'
import { SortToggle } from './SortToggle'

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

/** Legacy CharacterSelection: the character grid on the left, with filters below. */
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
  const grid = useRef<HTMLUListElement>(null)
  const drawer = useRef<HTMLFieldSetElement>(null)
  useFlip(grid)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // legacy fade-left on the way out too
  const closeFilter = () =>
    animateOut(
      drawer.current,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateX(-100px)' },
      ],
      400,
      () => setFilterOpen(false),
    )
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
  // legacy FilterContainer: a titled two-column list of radio-style options
  const group = (
    key: Key,
    title: StringKey,
    values: readonly (string | number)[],
  ) => (
    <fieldset className={styles.filterGroup}>
      <legend>{t(locale, title)}</legend>
      <div className={styles.filterOptions}>
        {values.map((v) => (
          <button
            key={v}
            type="button"
            className={styles.filterOption}
            aria-pressed={search[key] === v}
            onClick={() => set(key, search[key] === v ? undefined : v)}
          >
            <span className={styles.radio} />
            {label(key, v)}
          </button>
        ))}
      </div>
    </fieldset>
  )

  return (
    <section
      role="dialog"
      aria-label={t(locale, 'selection.title')}
      className={styles.selection}
    >
      <h2 className={styles.selectionTitle}>{t(locale, 'selection.title')}</h2>
      {items.length === 0 ? (
        <p className="py-6 text-white/80">{t(locale, 'filter.empty')}</p>
      ) : (
        <ul ref={grid} className={styles.grid}>
          {sorted(items, sort, reverse, locale).map((c) => (
            <li key={c.id} data-flip={c.id}>
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
      <div className={styles.filters}>
        <button
          type="button"
          className={styles.filterBtn}
          aria-label={t(locale, 'filter.title')}
          aria-expanded={filterOpen}
          onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}
        >
          <Icon name="filter" className="size-5" />
        </button>
        <SortToggle
          label={t(locale, 'sort.label')}
          value={sort}
          options={SORTS}
          optionLabel={(o) => t(locale, `sort.${o || 'default'}` as StringKey)}
          onChange={setSort}
        />
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
      {filterOpen && (
        <fieldset
          ref={drawer}
          aria-label={t(locale, 'filter.title')}
          className={styles.filterDrawer}
        >
          <div className={styles.filterScroll}>
            <h3 className={styles.filterTitle}>{t(locale, 'filter.title')}</h3>
            {group('element', 'filter.element', ELEMENTS)}
            {group('weaponType', 'filter.weapon', WEAPON_TYPES)}
            {group('rarity', 'filter.rarity', [4, 5])}
          </div>
          <button
            type="button"
            className={styles.confirm}
            onClick={closeFilter}
          >
            <GenshinIcon name="circle-o" className={styles.confirmIcon} />
            <span>{t(locale, 'filter.confirm')}</span>
          </button>
        </fieldset>
      )}
    </section>
  )
}
