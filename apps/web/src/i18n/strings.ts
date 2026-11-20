import type { Locale } from '@gi/shared'
import { en } from './strings.en'
import { ru } from './strings.ru'
import { type Dictionary, type StringKey, zhCN } from './strings.zh-CN'
import { zhTW } from './strings.zh-TW'

export type { StringKey }

export const dictionaries: Record<Locale, Dictionary> = {
  en,
  ru,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
}

export function t(locale: Locale, key: StringKey): string {
  return dictionaries[locale][key]
}

/** Amber region ids are upper-case ("MONDSTADT"); unknown ones are title-cased. */
export function regionLabel(locale: Locale, raw: string | null): string {
  if (!raw) return ''
  const key = `region.${raw}`
  if (key in zhCN) return t(locale, key as StringKey)
  return raw.charAt(0) + raw.slice(1).toLowerCase()
}
