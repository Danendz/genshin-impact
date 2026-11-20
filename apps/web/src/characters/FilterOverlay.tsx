import {
  ELEMENTS,
  type Element,
  type Locale,
  WEAPON_TYPES,
  type WeaponType,
} from '@gi/shared'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { GenshinIcon } from '../components/GenshinIcon'
import { type StringKey, t } from '../i18n/strings'
import styles from './characters.module.css'
import type { CharacterSearch } from './details'

type Key = 'element' | 'weaponType' | 'rarity'

export function FilterOverlay({
  search,
  locale,
}: {
  search: CharacterSearch
  locale: Locale
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const set = (key: Key, value: string | number | undefined) =>
    navigate({
      to: '.',
      search: (prev: CharacterSearch) => ({ ...prev, [key]: value }),
    })
  const toggle = (key: Key, value: string | number) =>
    set(key, search[key] === value ? undefined : value)

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
    <fieldset className="flex flex-wrap items-center gap-2">
      <legend className="mb-2 text-sm text-white/70">{t(locale, title)}</legend>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          className={styles.chip}
          aria-pressed={search[key] === v}
          onClick={() => toggle(key, v)}
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
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className={styles.chip}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <GenshinIcon name="search" className="mr-1" />
        {t(locale, 'filter.open')}
      </button>
      {active.map((k) => (
        <button
          key={k}
          type="button"
          className={`${styles.chip} bg-white/10`}
          onClick={() => set(k, undefined)}
          aria-label={`${t(locale, 'filter.clear')}: ${label(k, search[k] as string)}`}
        >
          {label(k, search[k] as string)}{' '}
          <GenshinIcon name="close" className="ml-1 text-xs" />
        </button>
      ))}
      {open && (
        // biome-ignore lint/a11y/noStaticElementInteractions: click-outside scrim; Escape closes too
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-label={t(locale, 'filter.open')}
            className="absolute top-16 left-4 flex max-w-[min(32rem,calc(100vw-2rem))] flex-col gap-4 rounded-2xl bg-[#3b4255]/95 p-5 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            {group('element', 'filter.element', ELEMENTS)}
            {group('weaponType', 'filter.weapon', WEAPON_TYPES)}
            {group('rarity', 'filter.rarity', [5, 4])}
            {active.length > 0 && (
              <button
                type="button"
                className={`${styles.chip} self-start`}
                onClick={() =>
                  navigate({
                    to: '.',
                    search: (prev: CharacterSearch) => ({
                      locale: prev.locale,
                    }),
                  })
                }
              >
                {t(locale, 'filter.clear')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
