import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { charactersListQuery } from '../characters/queries'
import { PROFILE_KEY } from '../lib/storage'
import { renderInRouter, testClient } from '../test/renderInRouter'
import { ProfileCard } from './ProfileCard'

vi.mock('../api', () => ({ api: { v1: { characters: { $get: vi.fn() } } } }))

const listGet = vi.mocked(api.v1.characters.$get)

const item = (id: string, name: string) => ({
  id,
  name,
  rarity: 5,
  element: 'cryo' as const,
  weaponType: 'bow' as const,
  region: 'MONDSTADT',
  media: {
    icon: `https://m/${id}/icon.webp`,
    namecard: `https://m/${id}/namecard.webp`,
  },
})
const items = [
  item('10000039', 'Diona'),
  item('10000052', 'Raiden Shogun'),
  item('10000073', 'Nahida'),
]

function renderCard(seeded = true) {
  const client = testClient()
  if (seeded) client.setQueryData(charactersListQuery('en').queryKey, items)
  return renderInRouter(() => <ProfileCard locale="en" />, {
    search: '?locale=en',
    client,
  })
}

const avatarSrc = () =>
  screen
    .getByRole('button', { name: 'Change avatar' })
    .querySelector('img')
    ?.getAttribute('src')

beforeEach(() => {
  listGet.mockReset()
})
afterEach(() => {
  vi.unstubAllGlobals()
  localStorage.clear()
})

describe('ProfileCard', () => {
  it('shows the legacy defaults', async () => {
    renderCard()
    expect(await screen.findByText('57')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('0 / 285750')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText(/^UID \d{9}$/)).toBeInTheDocument()
    expect(screen.getByTestId('namecard')).toHaveAttribute(
      'src',
      'https://m/10000039/namecard.webp',
    )
    expect(avatarSrc()).toBe('https://m/10000052/icon.webp')
  })

  it('copies the UID and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderCard()
    const uid = (await screen.findByText(/^UID \d{9}$/)).textContent?.slice(4)
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    expect(writeText).toHaveBeenCalledWith(uid)
    expect(await screen.findByRole('status')).toHaveTextContent('Copied!')
  })

  it('stays quiet when the clipboard refuses', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'))
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))
    await act(async () => {})
    expect(writeText).toHaveBeenCalled()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('stays quiet without a clipboard', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    renderCard()
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))
    await act(async () => {})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('changes the avatar through the picker and keeps it', async () => {
    const { unmount } = renderCard()
    fireEvent.click(
      await screen.findByRole('button', { name: 'Change avatar' }),
    )
    const dialog = screen.getByRole('dialog', { name: 'Change avatar' })
    const nahida = within(dialog).getByRole('button', { name: 'Nahida' })
    fireEvent.click(nahida)
    expect(nahida).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Use' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(avatarSrc()).toBe('https://m/10000073/icon.webp')
    unmount()
    renderCard()
    await screen.findByRole('button', { name: 'Change avatar' })
    expect(avatarSrc()).toBe('https://m/10000073/icon.webp')
  })

  it('falls back to Raiden for an avatar that no longer exists', async () => {
    localStorage.setItem(
      PROFILE_KEY,
      JSON.stringify({ uid: 123456789, avatarId: 'gone' }),
    )
    renderCard()
    await screen.findByRole('button', { name: 'Change avatar' })
    expect(avatarSrc()).toBe('https://m/10000052/icon.webp')
  })

  it('disables the picker when the character list fails', async () => {
    listGet.mockResolvedValue({ ok: false, status: 500 } as never)
    renderCard(false)
    await waitFor(() => expect(listGet).toHaveBeenCalled())
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Change avatar' }),
      ).toBeDisabled(),
    )
    expect(screen.queryByTestId('namecard')).toBeNull()
    expect(screen.getByText('57')).toBeInTheDocument()
  })
})
