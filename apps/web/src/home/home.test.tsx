import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeRouter } from '../router'

vi.mock('../api', () => ({
  api: {
    health: { $get: vi.fn() },
    v1: {
      characters: { $get: vi.fn(), ':id': { $get: vi.fn() } },
      site: { 'home-backgrounds': { $get: vi.fn() } },
    },
  },
}))

const listGet = vi.mocked(api.v1.characters.$get)
const bgGet = vi.mocked(api.v1.site['home-backgrounds'].$get)
const healthGet = vi.mocked(api.health.$get)

const respond = (status: number, body: unknown) =>
  ({ ok: status === 200, status, json: async () => body }) as never

const item = (id: string, name: string) => ({
  id,
  name,
  rarity: 5,
  element: 'cryo',
  weaponType: 'bow',
  region: 'MONDSTADT',
  media: {
    icon: `https://m/${id}/icon.webp`,
    namecard: `https://m/${id}/n.webp`,
  },
})

beforeEach(() => {
  listGet.mockReset().mockResolvedValue(
    respond(200, {
      items: [item('10000039', 'Diona'), item('10000052', 'Raiden Shogun')],
    }),
  )
  bgGet.mockReset().mockResolvedValue(
    respond(200, {
      items: [{ url: 'https://r2/bg.webp', width: 1, height: 1 }],
    }),
  )
  healthGet.mockReset()
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

async function renderHome(path = '/?locale=en') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const router = makeRouter(client)
  router.history.destroy()
  const history = createMemoryHistory({ initialEntries: [path] })
  router.update({ ...router.options, history })
  await act(() => router.load())
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('home page', () => {
  it('locks every option icon except Settings', async () => {
    await renderHome()
    expect(
      await screen.findByRole('button', { name: 'Settings' }),
    ).not.toHaveAttribute('aria-disabled')
    for (const name of ['Photo mode', 'Notices', 'Mail', 'Time'])
      expect(screen.getByRole('button', { name })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
  })

  it('hides the main section while Settings is open', async () => {
    await renderHome()
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }))
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('main', { hidden: true })).not.toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('main')).toBeVisible()
  })

  it('goes to the characters browser from the Character tile', async () => {
    const router = await renderHome()
    fireEvent.click(await screen.findByRole('link', { name: 'Character' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters'),
    )
    expect(router.state.location.search).toEqual({ locale: 'en' })
  })

  it('still shows the tiles when the API is down', async () => {
    listGet.mockRejectedValue(new Error('down'))
    bgGet.mockRejectedValue(new Error('down'))
    await renderHome()
    const nav = await screen.findByRole('navigation')
    expect(within(nav).getAllByRole('listitem')).toHaveLength(19)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Change avatar' }),
      ).toBeDisabled(),
    )
  })

  it('renders with storage blocked', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await renderHome()
    expect(await screen.findByText('57')).toBeInTheDocument()
  })

  it('no longer checks API health', async () => {
    await renderHome()
    await screen.findByRole('navigation')
    expect(healthGet).not.toHaveBeenCalled()
  })
})
