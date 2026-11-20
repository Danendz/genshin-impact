import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { homeIcons, navIcons, statsIcons } from '../assets/icons'
import { GenshinIcon } from '../components/GenshinIcon'
import { Route } from './index'

vi.mock('../api', () => ({ api: { health: { $get: vi.fn() } } }))

const healthGet = vi.mocked(api.health.$get)

function renderIndex() {
  const Page = Route.options.component as () => React.ReactNode
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  )
}

describe('icon maps', () => {
  it('resolves home, nav and stats icons to URLs', () => {
    expect(homeIcons.wish).toMatch(/wish.*\.webp/)
    expect(navIcons.character).toMatch(/character.*\.webp/)
    expect(statsIcons.pyro).toMatch(/pyro.*\.svg|^data:image\/svg/)
  })
})

describe('GenshinIcon', () => {
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

describe('index route', () => {
  beforeEach(() => {
    healthGet.mockReset()
  })

  it('shows API online when health resolves ok', async () => {
    healthGet.mockResolvedValue({ json: async () => ({ ok: true }) } as never)
    renderIndex()
    expect(await screen.findByText('API online')).toBeInTheDocument()
  })

  it('shows API offline when health rejects', async () => {
    healthGet.mockRejectedValue(new Error('down'))
    renderIndex()
    expect(await screen.findByText('API offline')).toBeInTheDocument()
  })
})
