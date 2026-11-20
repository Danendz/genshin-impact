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
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { makeRouter } from '../router'
import {
  characterSearch,
  parseCharacterDetails,
  regionGroup,
  talentKind,
} from './details'

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
  region: string | null,
) => ({
  id,
  name,
  rarity,
  element,
  weaponType,
  region,
  media: {
    icon: `https://m/${id}/icon.webp`,
    gacha_splash: `https://m/${id}/s.webp`,
  },
})
const items = [
  item('10000038', 'Albedo', 'geo', 'sword', 5, 'MONDSTADT'),
  item('10000073', 'Nahida', 'dendro', 'catalyst', 5, 'SUMERU'),
  item('10000067', 'Collei', 'dendro', 'bow', 4, 'SUMERU'),
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

  it('redirects without adding a language the URL did not have', async () => {
    const router = await renderAt('/characters')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters/10000038'),
    )
    expect(router.state.location.search).toEqual({})
  })

  it('redirects to the first filtered character and keeps the filter', async () => {
    const router = await renderAt('/characters?element=dendro&locale=en')
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters/10000073'),
    )
    expect(characterSearch(router.state.location.search)).toMatchObject({
      element: ['dendro'],
    })
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
    expect(characterSearch(router.state.location.search)).toMatchObject({
      element: ['dendro'],
    })
  })

  it('applies the chosen filters on Confirm and closes on Escape', async () => {
    const router = await renderAt('/characters/10000038?locale=en')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle characters' }),
    )
    const panel = screen.getByRole('dialog', { name: 'Character Selection' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Filter' }))
    const filter = within(panel).getByRole('group', { name: 'Filter' })
    const bow = within(filter).getByRole('button', { name: 'Bow' })
    expect(bow).toHaveAttribute('aria-pressed', 'false')
    // legacy: several options per group, nothing applies until Confirm
    fireEvent.click(bow)
    fireEvent.click(within(filter).getByRole('button', { name: 'Catalyst' }))
    expect(bow).toHaveAttribute('aria-pressed', 'true')
    expect(router.state.location.search).not.toHaveProperty('weaponType')
    expect(within(panel).getByRole('link', { name: 'Albedo' })).toBeTruthy()
    fireEvent.click(within(filter).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(characterSearch(router.state.location.search)).toMatchObject({
        weaponType: ['bow', 'catalyst'],
      }),
    )
    expect(router.state.location.href).toContain('weaponType=bow%2Ccatalyst')
    expect(within(panel).queryByRole('link', { name: 'Albedo' })).toBeNull()
    expect(within(panel).getAllByRole('link')).toHaveLength(2)
    expect(within(panel).queryByRole('group', { name: 'Filter' })).toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('filters by region and lists the chosen filters over the grid', async () => {
    const router = await renderAt(
      '/characters/10000067?weaponType=sword,bow&region=SUMERU&locale=en',
    )
    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle characters' }),
    )
    const panel = screen.getByRole('dialog', { name: 'Character Selection' })
    expect(
      within(panel)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Collei'])
    const chosen = within(panel).getByRole('group', {
      name: 'Selected filters',
    })
    for (const name of ['Sword', 'Bow', 'Sumeru'])
      expect(within(chosen).getByText(name)).toBeInTheDocument()
    // the drawer offers only regions some character comes from
    fireEvent.click(within(panel).getByRole('button', { name: 'Filter' }))
    const filter = within(panel).getByRole('group', { name: 'Filter' })
    const region = within(filter).getByRole('group', { name: 'Region' })
    expect(
      within(region)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Mondstadt', 'Sumeru'])
    expect(
      within(region).getByRole('button', { name: 'Sumeru' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(chosen).getByRole('button', { name: 'Clear' }))
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty('region'),
    )
    expect(router.state.location.search).not.toHaveProperty('weaponType')
    expect(
      within(panel).queryByRole('group', { name: 'Selected filters' }),
    ).toBeNull()
    // the open drawer follows the cleared filters
    expect(
      within(region).getByRole('button', { name: 'Sumeru' }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('groups upstream region codes into nations and Teyvat', async () => {
    listGet.mockResolvedValue(
      respond(200, {
        items: [
          ...items,
          item('10000033', 'Tartaglia', 'hydro', 'bow', 5, 'FATUI'),
          item('10000005', 'Traveler', 'anemo', 'sword', 5, 'MAINACTOR'),
          item('10000119', 'Lauma', 'dendro', 'catalyst', 5, 'NODKRAI'),
          item('10000062', 'Aloy', 'cryo', 'bow', 5, null),
        ],
      }),
    )
    const router = await renderAt('/characters/10000067?locale=en')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle characters' }),
    )
    const panel = screen.getByRole('dialog', { name: 'Character Selection' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Filter' }))
    const filter = within(panel).getByRole('group', { name: 'Filter' })
    const region = within(filter).getByRole('group', { name: 'Region' })
    expect(
      within(region)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['Mondstadt', 'Sumeru', 'Nod-Krai', 'Snezhnaya', 'Teyvat'])
    fireEvent.click(within(region).getByRole('button', { name: 'Teyvat' }))
    fireEvent.click(within(filter).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(characterSearch(router.state.location.search)).toMatchObject({
        region: ['TEYVAT'],
      }),
    )
    expect(
      within(panel)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual(['Traveler', 'Aloy'])
  })

  it('hides the top bar while selecting and closes with the legacy back button', async () => {
    await renderAt('/characters/10000038?locale=en')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle characters' }),
    )
    const panel = screen.getByRole('dialog', { name: 'Character Selection' })
    expect(screen.queryByRole('navigation', { name: 'Characters' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Close' })).toBeNull()
    expect(within(panel).queryByRole('button', { name: 'Close' })).toBeNull()
    // the right card stays, the back button sits above it
    expect(screen.getByRole('heading', { name: 'Albedo' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(
      screen.getByRole('navigation', { name: 'Characters' }),
    ).toBeInTheDocument()
  })

  it('shows legacy cards and sorts and reverses the selection grid', async () => {
    await renderAt('/characters/10000038?locale=en')
    fireEvent.click(
      await screen.findByRole('button', { name: 'Toggle characters' }),
    )
    const panel = screen.getByRole('dialog', { name: 'Character Selection' })
    const names = () =>
      within(panel)
        .getAllByRole('link')
        .map((a) => a.getAttribute('aria-label'))
    expect(names()).toEqual(['Albedo', 'Nahida', 'Collei'])
    expect(within(panel).getAllByText('Lv. 90')).toHaveLength(3)
    // legacy TogglerWithList: shows the current sort, opens a list of options
    const sort = within(panel).getByRole('button', { name: 'Sort: All' })
    expect(sort).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(sort)
    const options = within(panel).getByRole('list', { name: 'Sort' })
    expect(
      within(options).getByRole('button', { name: 'All' }),
    ).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(options).getByRole('button', { name: 'Rarity' }))
    expect(within(panel).queryByRole('list', { name: 'Sort' })).toBeNull()
    expect(
      within(panel).getByRole('button', { name: 'Sort: Rarity' }),
    ).toBeInTheDocument()
    expect(names()).toEqual(['Collei', 'Albedo', 'Nahida'])
    fireEvent.click(
      within(panel).getByRole('button', { name: 'Reverse order' }),
    )
    expect(names()).toEqual(['Nahida', 'Albedo', 'Collei'])
  })

  it('slides cards to their new places when the order changes', async () => {
    // jsdom has no layout: place each grid cell by its index, one per row
    const top = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      'offsetTop',
    )
    Object.defineProperty(HTMLElement.prototype, 'offsetTop', {
      configurable: true,
      get(this: HTMLElement) {
        return this.parentElement
          ? [...this.parentElement.children].indexOf(this) * 150
          : 0
      },
    })
    const animate = vi.fn()
    HTMLElement.prototype.animate = animate
    try {
      await renderAt('/characters/10000038?locale=en')
      fireEvent.click(
        await screen.findByRole('button', { name: 'Toggle characters' }),
      )
      const panel = screen.getByRole('dialog', { name: 'Character Selection' })
      animate.mockClear()
      fireEvent.click(
        within(panel).getByRole('button', { name: 'Reverse order' }),
      )
      // Albedo moved from row 0 to row 2: it starts 300px up and slides down
      const albedo = within(panel)
        .getByRole('link', { name: 'Albedo' })
        .closest('li')
      const call = animate.mock.contexts.indexOf(albedo)
      expect(call).toBeGreaterThanOrEqual(0)
      expect(animate.mock.calls[call]?.[0]).toEqual([
        { transform: 'translate(0px, -300px)' },
        { transform: 'none' },
      ])
      // Nahida stayed in the middle: nothing to animate
      const nahida = within(panel)
        .getByRole('link', { name: 'Nahida' })
        .closest('li')
      expect(animate.mock.contexts).not.toContain(nahida)
    } finally {
      if (top) Object.defineProperty(HTMLElement.prototype, 'offsetTop', top)
      Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    }
  })

  it('scrolls only the avatar strip, never the page, when switching', async () => {
    const intoView = vi.fn()
    Element.prototype.scrollIntoView = intoView
    await renderAt('/characters/10000038?locale=en')
    fireEvent.click(await screen.findByRole('link', { name: 'Nahida' }))
    await screen.findByRole('heading', { name: 'Nahida' })
    expect(intoView).not.toHaveBeenCalled()
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('shows element/name in the top bar and links close to home', async () => {
    await renderAt('/characters/10000038?locale=en')
    expect(await screen.findByText('Geo/Albedo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Close' })).toHaveAttribute(
      'href',
      '/',
    )
  })

  it('keeps the menu section in the URL across character switches', async () => {
    const router = await renderAt('/characters/10000038?locale=en')
    const menu = await screen.findByRole('navigation', { name: 'Sections' })
    expect(
      within(menu).getByRole('link', { name: 'Attributes' }),
    ).toHaveAttribute('aria-current', 'page')
    fireEvent.click(within(menu).getByRole('link', { name: 'Talents' }))
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        section: 'talents',
      }),
    )
    // only the chosen section is current, never the default one too
    await waitFor(() =>
      expect(
        within(menu).getByRole('link', { name: 'Attributes' }),
      ).not.toHaveAttribute('aria-current'),
    )
    expect(within(menu).getByRole('link', { name: 'Talents' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    fireEvent.click(screen.getByRole('link', { name: 'Nahida' }))
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/characters/10000073'),
    )
    expect(router.state.location.search).toMatchObject({ section: 'talents' })
  })

  it('hides the interface and restores it', async () => {
    await renderAt('/characters/10000038?locale=en')
    await screen.findByRole('heading', { name: 'Albedo' })
    fireEvent.click(screen.getByRole('button', { name: 'Hide interface' }))
    expect(screen.queryByRole('navigation', { name: 'Sections' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Albedo' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show interface' }))
    expect(
      screen.getByRole('navigation', { name: 'Sections' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Albedo' })).toBeInTheDocument()
  })

  it('drops invalid search values instead of failing', async () => {
    const router = await renderAt(
      '/characters/10000038?element=lava&rarity=9&section=bogus&locale=en',
    )
    expect(
      await screen.findByRole('heading', { name: 'Albedo' }),
    ).toBeInTheDocument()
    // invalid values must not filter the strip down to nothing
    for (const name of ['Albedo', 'Nahida', 'Collei'])
      expect(screen.getByRole('link', { name })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/characters/10000038')
    expect(
      within(screen.getByRole('navigation', { name: 'Sections' })).getByRole(
        'link',
        { name: 'Attributes' },
      ),
    ).toHaveAttribute('aria-current', 'page')
  })
})

describe('details helpers', () => {
  it('reads several values per filter and drops unknown ones', () => {
    expect(
      characterSearch({
        element: 'pyro,lava,hydro',
        weaponType: ['bow'],
        rarity: '4,5,9',
        region: 'SUMERU,bad value',
      }),
    ).toEqual({
      element: ['pyro', 'hydro'],
      weaponType: ['bow'],
      rarity: [4, 5],
      region: ['SUMERU'],
    })
    // old links carry upstream codes; they fold into nations like the list does
    expect(characterSearch({ region: 'FATUI,SNEZHNAYA,MAINACTOR' })).toEqual({
      region: ['SNEZHNAYA', 'TEYVAT'],
    })
    // a single value arrives from the URL as a plain string or number
    expect(characterSearch({ element: 'geo', rarity: 5 })).toEqual({
      element: ['geo'],
      rarity: [5],
    })
  })

  it.each([
    ['MONDSTADT', 'MONDSTADT'],
    ['FATUI', 'SNEZHNAYA'],
    ['SNEZHNAYA_STAR', 'SNEZHNAYA'],
    ['NODKRAI_ZIBAI', 'NODKRAI'],
    ['MAINACTOR', 'TEYVAT'],
    ['OMNI_SCOURGE', 'TEYVAT'],
    [null, 'TEYVAT'],
  ])('regionGroup %s -> %s', (raw, group) => {
    expect(regionGroup(raw)).toBe(group)
  })

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
