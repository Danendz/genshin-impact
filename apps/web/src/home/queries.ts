import { queryOptions } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '../api'

export type HomeBackground = InferResponseType<
  (typeof api.v1.site)['home-backgrounds']['$get'],
  200
>['items'][number]

export const homeBackgroundsQuery = queryOptions({
  queryKey: ['home-backgrounds'],
  staleTime: 5 * 60_000,
  queryFn: async (): Promise<HomeBackground[]> => {
    const res = await api.v1.site['home-backgrounds'].$get()
    if (!res.ok) throw new Error(`home backgrounds: HTTP ${res.status}`)
    return (await res.json()).items
  },
})
