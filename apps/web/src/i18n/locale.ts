import { isLocale, type Locale } from '@gi/shared'
import { useSearch } from '@tanstack/react-router'
import { useSyncExternalStore } from 'react'
import { LOCALE_KEY, readStored, writeStored } from '../lib/storage'

/** ?locale= wins, then the saved choice, then the first supported browser language, then en. */
export function resolveLocale(
  search: string | undefined,
  saved: Locale | undefined,
  navigatorLanguages: readonly string[],
): Locale {
  if (isLocale(search)) return search
  if (saved) return saved
  for (const lang of navigatorLanguages) {
    const l = lang.toLowerCase()
    if (l.startsWith('zh')) {
      return /^zh-(tw|hk|mo|hant)/.test(l) ? 'zh-TW' : 'zh-CN'
    }
    if (l.startsWith('ru')) return 'ru'
    if (l.startsWith('en')) return 'en'
  }
  return 'en'
}

export function savedLocale(): Locale | undefined {
  return readStored(LOCALE_KEY, (v) =>
    typeof v === 'string' && isLocale(v) ? v : undefined,
  )
}

const listeners = new Set<() => void>()

/** Remembers the choice and re-renders every useLocale. */
export function saveLocale(locale: Locale): void {
  writeStored(LOCALE_KEY, locale)
  for (const l of listeners) l()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** resolveLocale against the saved choice and this browser's languages */
export function browserLocale(search: string | undefined): Locale {
  return resolveLocale(
    search,
    savedLocale(),
    typeof navigator === 'undefined' ? [] : navigator.languages,
  )
}

export function useLocale(): Locale {
  const search = useSearch({ strict: false }) as { locale?: string }
  const saved = useSyncExternalStore(subscribe, savedLocale, () => undefined)
  return resolveLocale(
    search.locale,
    saved,
    typeof navigator === 'undefined' ? [] : navigator.languages,
  )
}
