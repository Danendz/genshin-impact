export const LOCALES = ['en', 'ru', 'zh-CN', 'zh-TW'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(x: unknown): x is Locale {
  return typeof x === 'string' && (LOCALES as readonly string[]).includes(x)
}

export type AmberLang = 'en' | 'ru' | 'chs' | 'cht'

const AMBER_LANG: Record<Locale, AmberLang> = {
  en: 'en',
  ru: 'ru',
  'zh-CN': 'chs',
  'zh-TW': 'cht',
}

export function toAmberLang(l: Locale): AmberLang {
  return AMBER_LANG[l]
}
