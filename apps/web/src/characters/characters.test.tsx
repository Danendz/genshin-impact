import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeRouter } from '../router'
import { parseCharacterDetails, talentKind } from './details'

vi.mock('../api', () => {
  const detail = { $get: vi.fn() }
  return {
    api: {
      health: { $get: vi.fn() },
      v1: { characters: { $get: vi.fn(), ':id': detail } },
    },
  }
})

const item = (
  id: string,
  name: string,
  element: string,
  weaponType: string,
  rarity: number,
) => ({
  id,
  name,
  rarity,
  element,
  weaponType,
  media: {
    icon: `https://m/${id}/icon.webp`,
    gacha_splash: `https://m/${id}/s.webp`,
  },
})
const items = [
  item('10000038', 'Albedo', 'geo', 'sword', 5),
  item('10000073', 'Nahida', 'dendro', 'catalyst', 5),
  item('10000067', 'Collei', 'dendro', 'bow', 4),
]
const respond = (status: number, body: unknown) =>
  ({ ok: status === 200, status, json: async () => body }) as never

const listGet = vi.mocked(api.v1.characters.$get)
const detailGet = vi.mocked(api.v1.characters[':id'].$get)

beforeEach(() => {
  listGet.mockReset().mockResolvedValue(respond(200, { items }))
  detailGet.mockReset().mockImplementation((async ({
    param,
  }: {
    param: { id: string }
  }) => {
    const c = items.find((i) => i.id === param.id)
    if (!c) return respond(404, { error: 'not_found' })
    return respond(200, {
      ...c,
      title: `${c.name} title`,
      region: 'MONDSTADT',
      birthday: [9, 13],
      releaseAt: null,
      locale: 'en',
      description: 'd',
      details: { talents: [], constellations: [] },
      skillIcons: {},
    })
  }) as never)
})

async function renderAt(path: string) {
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

describe('characters routes', () => {
  it('redirects /characters to the first character', async () => {
    const router = await renderAt('/characters?locale=en')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters/10000038'),
    )
    expect(
      await screen.findByRole('heading', { name: 'Albedo' }),
    ).toBeInTheDocument()
  })

  it('redirects to the first filtered character and keeps the filter', async () => {
    const router = await renderAt('/characters?element=dendro&locale=en')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters/10000073'),
    )
    expect(router.state.location.search).toMatchObject({ element: 'dendro' })
  })

  it('shows the empty message and stays put when nothing matches', async () => {
    const router = await renderAt('/characters?element=pyro&locale=en')
    expect(
      await screen.findByText('No characters match these filters'),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/characters')
  })

  it('shows not-found for an unknown id with the strip still usable', async () => {
    await renderAt('/characters/nope?locale=en')
    expect(await screen.findByText('Character not found')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Nahida' })).toBeInTheDocument()
  })

  it('switches character from the strip and keeps search params', async () => {
    const router = await renderAt(
      '/characters/10000038?element=dendro&locale=en',
    )
    // Albedo is not dendro, but a direct link still shows him; the strip is filtered
    expect(screen.queryByRole('link', { name: 'Albedo' })).toBeNull()
    fireEvent.click(await screen.findByRole('link', { name: 'Collei' }))
    expect(
      await screen.findByRole('heading', { name: 'Collei' }),
    ).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/characters/10000067')
    expect(router.state.location.search).toMatchObject({ element: 'dendro' })
  })

  it('toggles filters into the URL and closes on Escape', async () => {
    const router = await renderAt('/characters/10000038?locale=en')
    fireEvent.click(await screen.findByRole('button', { name: /Filter/ }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: /Bow/ }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ weaponType: 'bow' }),
    )
    expect(screen.queryByRole('link', { name: 'Albedo' })).toBeNull()
    expect(dialog).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('drops invalid search values instead of failing', async () => {
    const router = await renderAt(
      '/characters/10000038?element=lava&rarity=9&locale=en',
    )
    expect(
      await screen.findByRole('heading', { name: 'Albedo' }),
    ).toBeInTheDocument()
    // invalid values must not filter the strip down to nothing
    for (const name of ['Albedo', 'Nahida', 'Collei'])
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/characters/10000038')
  })
})

describe('details helpers', () => {
  it.each([
    [{ icon: 'Skill_A_01', type: 0 }, 'normal'],
    [{ icon: 'Skill_S_Albedo_01', type: 0 }, 'skill'],
    [{ icon: 'Skill_E_Albedo_01', type: 1 }, 'burst'],
    [{ icon: 'UI_Talent_S_Albedo_05', type: 2 }, 'passive'],
    [{ icon: 'UI_Talent_Other', type: 0 }, null],
  ])('talentKind %j -> %s', (t, kind) => {
    expect(talentKind(t)).toBe(kind)
  })

  it('drops malformed entries', () => {
    expect(parseCharacterDetails(null)).toEqual({
      talents: [],
      constellations: [],
    })
    expect(
      parseCharacterDetails({
        talents: [{}, 'x', { name: 'T', icon: 'Skill_A_01', type: 0 }],
        constellations: { not: 'an array' },
      }),
    ).toEqual({
      talents: [
        {
          name: 'T',
          icon: 'Skill_A_01',
          type: 0,
          description: '',
          promote: {},
        },
      ],
      constellations: [],
    })
  })
})
