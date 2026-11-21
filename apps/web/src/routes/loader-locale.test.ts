import { afterEach, expect, it, vi } from 'vitest'
import { saveLocale } from '../i18n/locale'
import { Route as Characters } from './characters'
import { Route as Detail } from './characters.$id'
import { Route as List } from './characters.index'

vi.mock('../api', () => ({ api: {} }))

afterEach(() => localStorage.clear())

// a preload cached under the old language must not be reused after a pick
it.each([
  ['characters', Characters],
  ['characters.$id', Detail],
  ['characters.index', List],
])('%s keys its loader on the saved language', (_, route) => {
  const deps = route.options.loaderDeps as (o: { search: object }) => {
    locale?: string
  }
  saveLocale('ru')
  expect(deps({ search: {} }).locale).toBe('ru')
  expect(deps({ search: { locale: 'en' } }).locale).toBe('en')
})
