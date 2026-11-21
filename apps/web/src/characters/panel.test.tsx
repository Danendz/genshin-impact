import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import albedo from './__fixtures__/albedo-en.json'
import type { Section } from './details'
import type { CharacterDetail } from './queries'
import { RightPanel } from './RightPanel'

const detail = albedo as unknown as CharacterDetail

const renderAt = (section: Section, d: CharacterDetail = detail) =>
  render(<RightPanel detail={d} section={section} locale="en" />)

const item = (name: string) =>
  screen
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(name)) as HTMLElement

describe('RightPanel', () => {
  it('shows the legacy attributes card with placeholders', () => {
    renderAt('attributes')
    expect(screen.getByRole('heading', { name: 'Albedo' })).toBeInTheDocument()
    expect(screen.getByText('Level 90 /')).toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(5)
    expect(screen.getByText('Stamina')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Wardrobe/ })).toBeDisabled()
    expect(screen.getByText('10')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens legacy details: full-height stat groups, no close button, backdrop closes', () => {
    renderAt('attributes')
    fireEvent.click(screen.getByRole('button', { name: 'Details' }))
    const dialog = screen.getByRole('dialog', { name: 'Details' })
    expect(
      within(dialog)
        .getAllByRole('heading', { level: 2 })
        .map((h) => h.textContent),
    ).toEqual(['Base Stats', 'Advanced Stats', 'Elemental Type'])
    expect(within(dialog).getByText('Shield Strength')).toBeInTheDocument()
    expect(within(dialog).getByText('Physical RES')).toBeInTheDocument()
    expect(within(dialog).getAllByText('—')).toHaveLength(28)
    expect(within(dialog).queryByRole('button')).toBeNull()
    // a press inside the column keeps it open; the backdrop closes it
    fireEvent.mouseDown(within(dialog).getByText('Base Stats'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.mouseDown(dialog.parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it.each(['weapon', 'artifacts'] as const)('%s is a placeholder', (s) => {
    renderAt(s)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
  })

  it('lists talents with kinds and opens one with readable text and scaling', () => {
    renderAt('talents')
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(
      within(item('Abiogenesis: Solar Isotoma')).getByText('Elemental Skill'),
    ).toBeInTheDocument()
    expect(
      within(item('Calcite Might')).getByText('Passive Talent'),
    ).toBeInTheDocument()

    fireEvent.click(
      within(screen.getAllByRole('listitem')[0] as HTMLElement).getByRole(
        'button',
      ),
    )
    const dialog = screen.getByRole('dialog')
    expect(
      within(dialog).getByText('Normal Attack', { selector: 'p' }),
    ).toBeInTheDocument()
    expect(dialog.textContent).not.toContain('<color')
    expect(dialog.textContent).not.toContain('{param')
    const hit1 = () =>
      within(dialog).getByText('1-Hit DMG').nextElementSibling?.textContent
    expect(hit1()).toBe('36.7%')
    fireEvent.change(within(dialog).getByRole('combobox', { name: 'Level' }), {
      target: { value: '2' },
    })
    expect(hit1()).toBe('39.7%')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('uses synced skill icons and a placeholder when one is missing', () => {
    renderAt('talents')
    const [first, second] = screen.getAllByRole('listitem') as HTMLElement[]
    expect(first?.querySelector('img')?.getAttribute('src')).toBe(
      'https://m/skill_icon/Skill_A_01/icon.webp',
    )
    expect(second?.querySelector('[data-icon-missing]')).not.toBeNull()
  })

  it('lists six constellations and opens one', () => {
    renderAt('constellation')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    fireEvent.click(
      within(item('Flower of Eden')).getByRole('button', {
        name: /Flower of Eden/,
      }),
    )
    expect(
      within(screen.getByRole('dialog')).getByText('Flower of Eden'),
    ).toBeInTheDocument()
  })

  it('shows region and a localized birthday on the profile', () => {
    renderAt('profile')
    expect(screen.getByText('Mondstadt')).toBeInTheDocument()
    expect(screen.getByText(/13/)).toBeInTheDocument()
  })

  it('renders empty details without throwing', () => {
    const empty = {
      ...detail,
      details: { talents: [], constellations: [] },
      region: null,
      birthday: null,
      releaseAt: null,
    } as CharacterDetail
    const { rerender } = renderAt('talents', empty)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    rerender(<RightPanel detail={empty} section="constellation" locale="en" />)
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    rerender(<RightPanel detail={empty} section="profile" locale="en" />)
    expect(screen.queryByText('Mondstadt')).toBeNull()
  })

  it.each([
    ['10000005-anemo', 'He travels'],
    ['10000007-anemo', 'She travels'],
  ])('resolves gendered Traveler text for %s', (id, text) => {
    renderAt('profile', {
      ...detail,
      id,
      description: '#{M#He}{F#She} travels',
    })
    expect(screen.getByText(text)).toBeInTheDocument()
  })
})
