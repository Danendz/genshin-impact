import * as OpenCC from 'opencc-js'
import { describe, expect, it } from 'vitest'
import { resolveLocale } from './locale'
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
    expect(resolveLocale(search, langs)).toBe(expected)
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
