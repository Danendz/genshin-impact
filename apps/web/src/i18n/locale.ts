import { isLocale, type Locale } from '@gi/shared'
import { useSearch } from '@tanstack/react-router'

/** ?locale= wins, then the first supported browser language, then en. */
export function resolveLocale(
  search: string | undefined,
  navigatorLanguages: readonly string[],
): Locale {
  if (isLocale(search)) return search
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

/** resolveLocale against this browser's languages */
export function browserLocale(search: string | undefined): Locale {
  return resolveLocale(
    search,
    typeof navigator === 'undefined' ? [] : navigator.languages,
  )
}

export function useLocale(): Locale {
  const search = useSearch({ strict: false }) as { locale?: string }
  return browserLocale(search.locale)
}
