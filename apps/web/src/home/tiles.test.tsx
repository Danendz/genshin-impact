import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { t } from '../i18n/strings'
import { TILES, Tiles } from './Tiles'

function renderTiles() {
  const root = createRootRoute({ component: Outlet })
  const index = createRoute({
    getParentRoute: () => root,
    path: '/',
    component: () => <Tiles locale="ru" />,
  })
  const characters = createRoute({
    getParentRoute: () => root,
    path: '/characters',
    component: () => <p>characters</p>,
  })
  const router = createRouter({
    routeTree: root.addChildren([index, characters]),
    history: createMemoryHistory({ initialEntries: ['/?locale=ru'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

it('has the 19 legacy tiles in order', () => {
  expect(TILES.map((tile) => tile.key)).toEqual([
    'shop',
    'party-setup',
    'friends',
    'achievements',
    'archive',
    'character-archive',
    'character',
    'inventory',
    'quests',
    'map',
    'events',
    'adventurer-handbook',
    'wish',
    'battle-pass',
    'coop-mode',
    'special-event',
    'community',
    'feedback',
    'survey',
  ])
})

it('links the two character tiles to /characters, keeping the locale', async () => {
  renderTiles()
  for (const name of ['Галерея персонажей', 'Персонаж'])
    expect(await screen.findByRole('link', { name })).toHaveAttribute(
      'href',
      '/characters?locale=ru',
    )
})

it('locks every other tile', async () => {
  const router = renderTiles()
  await screen.findByRole('link', { name: 'Персонаж' })
  const locked = screen.getAllByRole('button')
  expect(locked).toHaveLength(17)
  for (const tile of locked) {
    expect(tile).toHaveAttribute('aria-disabled', 'true')
    expect(tile).toHaveAttribute('title', t('ru', 'home.comingSoon'))
  }
  fireEvent.click(screen.getByRole('button', { name: 'Молитва' }))
  expect(router.state.location.pathname).toBe('/')
})
