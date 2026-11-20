import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import albedo from './__fixtures__/albedo-en.json'
import { DetailPanel } from './DetailPanel'
import type { CharacterDetail } from './queries'

const detail = albedo as unknown as CharacterDetail

const openTab = (name: string) =>
  fireEvent.click(screen.getByRole('tab', { name }))

describe('DetailPanel', () => {
  it('shows the attributes placeholder first', () => {
    render(<DetailPanel detail={detail} locale="en" />)
    expect(screen.getByRole('tab', { name: 'Attributes' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getAllByText('No data yet').length).toBeGreaterThan(0)
  })

  it('lists talents with kinds, readable text and level scaling', () => {
    render(<DetailPanel detail={detail} locale="en" />)
    openTab('Talents')
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(7)
    expect(
      within(items[0] as HTMLElement).getByText('Normal Attack', {
        selector: 'p',
      }),
    ).toBeInTheDocument()
    const skill = items.find((li) =>
      li.textContent?.includes('Abiogenesis: Solar Isotoma'),
    )
    expect(
      within(skill as HTMLElement).getByText('Elemental Skill', {
        selector: 'p',
      }),
    ).toBeInTheDocument()
    const passive = items.find((li) =>
      li.textContent?.includes('Calcite Might'),
    )
    expect(
      within(passive as HTMLElement).getByText('Passive Talent', {
        selector: 'p',
      }),
    ).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('<color')
    expect(document.body.textContent).not.toContain('{param')

    const first = items[0] as HTMLElement
    const hit1 = () =>
      within(first).getByText('1-Hit DMG').nextElementSibling?.textContent
    expect(hit1()).toBe('36.7%')
    fireEvent.change(within(first).getByRole('combobox', { name: 'Level' }), {
      target: { value: '2' },
    })
    expect(hit1()).toBe('39.7%')
  })

  it('uses synced skill icons and a placeholder when one is missing', () => {
    render(<DetailPanel detail={detail} locale="en" />)
    openTab('Talents')
    const first = screen.getAllByRole('listitem')[0] as HTMLElement
    expect(first.querySelector('img')?.getAttribute('src')).toBe(
      'https://m/skill_icon/Skill_A_01/icon.webp',
    )
    const second = screen.getAllByRole('listitem')[1] as HTMLElement
    expect(second.querySelector('[data-icon-missing]')).not.toBeNull()
  })

  it('lists six constellations', () => {
    render(<DetailPanel detail={detail} locale="en" />)
    openTab('Constellation')
    expect(screen.getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByText('Flower of Eden')).toBeInTheDocument()
  })

  it('shows region and a localized birthday on the profile', () => {
    render(<DetailPanel detail={detail} locale="en" />)
    openTab('Profile')
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
    render(<DetailPanel detail={empty} locale="en" />)
    openTab('Talents')
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    openTab('Constellation')
    expect(screen.getByText('No data yet')).toBeInTheDocument()
    openTab('Profile')
    expect(screen.queryByText('Mondstadt')).toBeNull()
  })
})
