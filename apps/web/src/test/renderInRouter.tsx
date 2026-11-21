import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

/** Renders `ui` at `/` (with `search`) in a throwaway router that also has a /characters page. */
export function renderInRouter(
  ui: () => ReactNode,
  { search = '', client = testClient() } = {},
) {
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: ui,
  })
  const characters = createRoute({
    getParentRoute: () => root,
    path: '/characters',
    component: () => <p>characters</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([index, characters]),
    history: createMemoryHistory({ initialEntries: [`/${search}`] }),
  })
  const view = render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...view, router, client }
}

export const testClient = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } })
