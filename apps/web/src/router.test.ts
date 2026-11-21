import { QueryClient } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { makeRouter } from './router'

it('writes search arrays as comma lists and everything else as JSON', () => {
  const router = makeRouter(new QueryClient())
  router.history.destroy()
  const stringify = router.options.stringifySearch
  expect(stringify({ element: ['pyro', 'hydro'], rarity: [4, 5] })).toBe(
    '?element=pyro%2Chydro&rarity=4%2C5',
  )
  expect(stringify({ section: 'talents' })).toBe('?section=talents')
})
