import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { homeIcons, navIcons, statsIcons } from '../assets/icons'
import { GenshinIcon } from '../components/GenshinIcon'
import { genshinIcons } from '../components/genshinIconGlyphs'

describe('icon maps', () => {
  it('resolves home, nav and stats icons to URLs', () => {
    expect(homeIcons.wish).toMatch(/wish.*\.webp/)
    expect(navIcons.character).toMatch(/character.*\.webp/)
    expect(statsIcons.pyro).toMatch(/pyro.*\.svg|^data:image\/svg/)
  })
})

describe('GenshinIcon', () => {
  it('maps exactly the 57 glyphs present in genshinicon.woff2', () => {
    expect(Object.keys(genshinIcons)).toHaveLength(57)
    expect(new Set(Object.values(genshinIcons)).size).toBe(57)
    expect(genshinIcons.mondstadt).toBe('u')
  })

  it('renders the glyph as aria-hidden by default', () => {
    const { container } = render(<GenshinIcon name="pyro" />)
    const el = container.firstElementChild
    expect(el).toHaveAttribute('aria-hidden', 'true')
    expect(el?.textContent).toBe('L')
  })

  it('exposes a label when given one', () => {
    render(<GenshinIcon name="search" label="Search" />)
    expect(screen.getByRole('img', { name: 'Search' })).toBeInTheDocument()
  })
})

describe('fonts.css', () => {
  it('has a latin-cyrillic face covering Cyrillic', () => {
    const fontsCss = readFileSync(
      resolve(import.meta.dirname, '../styles/fonts.css'),
      'utf8',
    )
    const face = fontsCss
      .split('@font-face')
      .find((b) => b.includes('latin-cyrillic'))
    expect(face).toBeDefined()
    expect(face).toMatch(/unicode-range:[^;]*U\+0400-04FF/)
  })
})
