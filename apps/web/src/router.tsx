import { QueryClient } from '@tanstack/react-query'
import { createRouter, stringifySearchWith } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const queryClient = new QueryClient()

export function makeRouter(client: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient: client },
    defaultPreload: 'intent',
    // loaders read through TanStack Query, which owns caching
    defaultPreloadStaleTime: 0,
    // lists read as ?element=pyro,hydro rather than JSON. Every route gets
    // this, and a list comes back as one string that its validator splits on
    // commas, so a list whose values can contain commas needs another encoding.
    stringifySearch: stringifySearchWith(
      (v) => (Array.isArray(v) ? v.join(',') : JSON.stringify(v)),
      JSON.parse,
    ),
  })
}

export const router = makeRouter(queryClient)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
