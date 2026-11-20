import * as OpenCC from 'opencc-js'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveLocale, saveLocale, savedLocale } from './locale'
import { dictionaries, regionLabel, t } from './strings'
import { zhCN } from './strings.zh-CN'
import { zhTW } from './strings.zh-TW'

describe('resolveLocale', () => {
  it.each([
    ['ru', [], 'ru'],
    [undefined, ['zh-HK'], 'zh-TW'],
    [undefined, ['zh'], 'zh-CN'],
    [undefined, ['ru-RU', 'en'], 'ru'],
    ['xx', ['de'], 'en'],
  ] as const)('%s %j -> %s', (search, langs, expected) => {
    expect(resolveLocale(search, undefined, langs)).toBe(expected)
  })

  it('puts the saved locale between ?locale= and the browser', () => {
    expect(resolveLocale('ru', 'en', ['zh-CN'])).toBe('ru')
    expect(resolveLocale(undefined, 'zh-TW', ['ru'])).toBe('zh-TW')
    expect(resolveLocale(undefined, undefined, ['ru-RU'])).toBe('ru')
    expect(resolveLocale(undefined, undefined, [])).toBe('en')
  })
})

describe('saved locale', () => {
  afterEach(() => localStorage.clear())

  it('ignores a stored value that is not a locale', () => {
    localStorage.setItem('gi.locale', '"de"')
    expect(savedLocale()).toBeUndefined()
  })

  it('saves and reads back a locale', () => {
    saveLocale('ru')
    expect(savedLocale()).toBe('ru')
  })
})

describe('dictionaries', () => {
  it('every locale has exactly the zh-CN keys', () => {
    const keys = Object.keys(zhCN).sort()
    for (const d of Object.values(dictionaries))
      expect(Object.keys(d).sort()).toEqual(keys)
  })

  it('zh-TW is the OpenCC conversion of zh-CN', () => {
    const toTW = OpenCC.Converter({ from: 'cn', to: 'tw' })
    expect(zhTW['section.talents']).toBe(toTW(zhCN['section.talents']))
  })

  it('looks strings up by locale', () => {
    expect(t('en', 'section.talents')).toBe('Talents')
  })
})

describe('regionLabel', () => {
  it('localizes known regions and title-cases unknown ones', () => {
    expect(regionLabel('en', 'MONDSTADT')).toBe('Mondstadt')
    expect(regionLabel('en', 'UNKNOWNLAND')).toBe('Unknownland')
    expect(regionLabel('en', null)).toBe('')
  })
})
