import { ELEMENTS, type Element, type Locale, WEAPON_TYPES } from '@gi/shared'
import { Link, useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { GenshinIcon } from '../components/GenshinIcon'
import { useEscape } from '../components/layers'
import { regionLabel, type StringKey, t } from '../i18n/strings'
import styles from './characters.module.css'
import { type CharacterSearch, FILTER_KEYS, type FilterKey } from './details'
import { Icon } from './icons'
import { animateOut, useFlip } from './motion'
import type { CharacterListItem } from './queries'
import { SortToggle } from './SortToggle'

type Picks = Partial<Record<FilterKey, (string | number)[]>>

/** legacy sort options; '' keeps the list's order */
const SORTS = ['', 'name', 'region', 'rarity', 'element', 'weaponType'] as const
type Sort = (typeof SORTS)[number]

function sorted(
  items: CharacterListItem[],
  sort: Sort,
  reverse: boolean,
  locale: Locale,
  regions: readonly string[],
) {
  const rank = (list: readonly string[], v: string | null) =>
    v === null ? list.length : list.indexOf(v)
  const by: Record<
    Sort,
    (a: CharacterListItem, b: CharacterListItem) => number
  > = {
    '': () => 0,
    name: (a, b) => a.name.localeCompare(b.name, locale),
    region: (a, b) => rank(regions, a.region) - rank(regions, b.region),
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
  regions,
  activeId,
  search,
  locale,
  onClose,
}: {
  items: CharacterListItem[]
  /** region options, taken from the whole roster */
  regions: string[]
  activeId: string | undefined
  search: CharacterSearch
  locale: Locale
  onClose: () => void
}) {
  const navigate = useNavigate()
  // the open drawer edits a draft; legacy applies it on Confirm
  const [draft, setDraft] = useState<Picks | null>(null)
  const filterOpen = draft !== null
  const [sort, setSort] = useState<Sort>('')
  const [reverse, setReverse] = useState(false)
  const grid = useRef<HTMLUListElement>(null)
  const drawer = useRef<HTMLFieldSetElement>(null)
  useFlip(grid)
  useEscape(onClose)

  const picked = (from: Picks | CharacterSearch, key: FilterKey) =>
    (from[key] ?? []) as (string | number)[]
  const apply = (picks: Picks) =>
    navigate({
      to: '.',
      search: (prev: CharacterSearch) => {
        const next: Record<string, unknown> = { ...prev }
        for (const [k, v] of Object.entries(picks))
          next[k] = v.length ? v : undefined
        return next as CharacterSearch
      },
    })
  // legacy fade-left on the way out too; closing applies the draft
  const closeFilter = () => {
    if (draft) apply(draft)
    animateOut(
      drawer.current,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'translateX(-100px)' },
      ],
      400,
      () => setDraft(null),
    )
  }
  const openFilter = () =>
    setDraft(Object.fromEntries(FILTER_KEYS.map((k) => [k, picked(search, k)])))
  const toggle = (key: FilterKey, v: string | number) =>
    setDraft((d) => {
      const now = picked(d ?? {}, key)
      return {
        ...d,
        [key]: now.includes(v) ? now.filter((x) => x !== v) : [...now, v],
      }
    })
  const clear = () => {
    const none = Object.fromEntries(FILTER_KEYS.map((k) => [k, []]))
    apply(none)
    setDraft((d) => (d ? none : d))
  }
  const label = (key: FilterKey, v: string | number) =>
    key === 'region'
      ? regionLabel(locale, String(v))
      : t(locale, `${key === 'weaponType' ? 'weapon' : key}.${v}` as StringKey)
  const chosen = FILTER_KEYS.flatMap((k) =>
    picked(search, k).map((v) => [k, v] as const),
  )
  // legacy FilterContainer: a titled two-column list of radio-style options
  const group = (
    key: FilterKey,
    title: StringKey,
    values: readonly (string | number)[],
  ) =>
    values.length > 0 && (
      <fieldset className={styles.filterGroup}>
        <legend>{t(locale, title)}</legend>
        <div className={styles.filterOptions}>
          {values.map((v) => (
            <button
              key={v}
              type="button"
              className={styles.filterOption}
              aria-pressed={picked(draft ?? {}, key).includes(v)}
              onClick={() => toggle(key, v)}
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
          {sorted(items, sort, reverse, locale, regions).map((c) => (
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
          onClick={filterOpen ? closeFilter : openFilter}
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
      {chosen.length > 0 && (
        // legacy CharacterSelectedFilters: a strip over the grid's bottom edge
        <fieldset
          aria-label={t(locale, 'filter.selected')}
          className={styles.chosen}
        >
          <div className={styles.chosenList}>
            {chosen.map(([k, v]) => (
              <button
                key={`${k}.${v}`}
                type="button"
                className={styles.chip}
                aria-label={`${t(locale, 'filter.clear')}: ${label(k, v)}`}
                onClick={() =>
                  apply({ [k]: picked(search, k).filter((x) => x !== v) })
                }
              >
                {label(k, v)}
              </button>
            ))}
          </div>
          <button type="button" className={styles.chosenClear} onClick={clear}>
            {t(locale, 'filter.clear')}
          </button>
        </fieldset>
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
            {group('rarity', 'filter.rarity', [5, 4])}
            {group('region', 'filter.region', regions)}
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
