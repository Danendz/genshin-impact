import type { Locale } from '@gi/shared'
import { queryOptions } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '../api'
import { regionGroup } from './details'

const STALE = 5 * 60_000

export type CharacterListItem = InferResponseType<
  typeof api.v1.characters.$get,
  200
>['items'][number]
export type CharacterDetail = InferResponseType<
  (typeof api.v1.characters)[':id']['$get'],
  200
>

export const charactersListQuery = (locale: Locale) =>
  queryOptions({
    queryKey: ['characters', locale],
    staleTime: STALE,
    queryFn: async (): Promise<CharacterListItem[]> => {
      const res = await api.v1.characters.$get({ query: { locale } })
      if (!res.ok) throw new Error(`characters list: HTTP ${res.status}`)
      // filters and sorting work on nations, not upstream codes
      return (await res.json()).items.map((c) => ({
        ...c,
        region: regionGroup(c.region),
      }))
    },
  })

/** resolves to null when the API says the character does not exist */
export const characterDetailQuery = (id: string, locale: Locale) =>
  queryOptions({
    queryKey: ['character', id, locale],
    staleTime: STALE,
    queryFn: async (): Promise<CharacterDetail | null> => {
      const res = await api.v1.characters[':id'].$get({
        param: { id },
        query: { locale },
      })
      if (res.status === 404) return null
      if (!res.ok) throw new Error(`character ${id}: HTTP ${res.status}`)
      return (await res.json()) as CharacterDetail
    },
  })
