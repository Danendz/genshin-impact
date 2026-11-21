import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api } from '../api'
import { Background } from './Background'
import { homeBackgroundsQuery } from './queries'
import { pickNext, ROTATE_MS } from './rotation'

vi.mock('../api', () => ({
  api: { v1: { site: { 'home-backgrounds': { $get: vi.fn() } } } },
}))

const bgGet = vi.mocked(api.v1.site['home-backgrounds'].$get)

describe('pickNext', () => {
  it('never repeats the current image', () => {
    for (const r of [0, 0.5, 0.999]) expect(pickNext(3, 1, () => r)).not.toBe(1)
  })

  it('handles one image and a first pick', () => {
    expect(pickNext(1, 0, Math.random)).toBe(0)
    expect(pickNext(3, undefined, () => 0)).toBe(0)
  })
})

/** an Image whose load finishes as soon as src is set */
const loaded: string[] = []
class InstantImage {
  onload: (() => void) | null = null
  set src(url: string) {
    loaded.push(url)
    this.onload?.()
  }
}

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    url: `https://r2/bg-${i}.webp`,
    width: 1920,
    height: 1080,
  }))

function renderWith(data?: ReturnType<typeof items>) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (data) client.setQueryData(homeBackgroundsQuery.queryKey, data)
  return render(
    <QueryClientProvider client={client}>
      <Background />
    </QueryClientProvider>,
  )
}

/** fire the first layer's load event, as the browser does once the file arrives */
const loadFirst = () =>
  fireEvent.load(screen.getAllByTestId('home-bg')[0] as HTMLElement)

const visible = () =>
  screen
    .getAllByTestId('home-bg')
    .find((img) => img.dataset.visible === 'true')
    ?.getAttribute('src')

describe('Background', () => {
  beforeEach(() => {
    loaded.length = 0
    vi.stubGlobal('Image', InstantImage)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('fades the first image in only once it has loaded', () => {
    renderWith(items(3))
    expect(visible()).toBeUndefined()
    loadFirst()
    expect(items(3).map((i) => i.url)).toContain(visible())
  })

  it(`crossfades to another image every ${ROTATE_MS} ms`, () => {
    renderWith(items(3))
    loadFirst()
    const first = visible()
    expect(items(3).map((i) => i.url)).toContain(first)
    act(() => vi.advanceTimersByTime(ROTATE_MS))
    expect(loaded).toHaveLength(1)
    expect(visible()).toBe(loaded[0])
    expect(visible()).not.toBe(first)
  })

  it('keeps rotating after an image fails to load', () => {
    class BrokenImage {
      onerror: (() => void) | null = null
      set src(url: string) {
        loaded.push(url)
        this.onerror?.()
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    renderWith(items(3))
    act(() => vi.advanceTimersByTime(ROTATE_MS))
    act(() => vi.advanceTimersByTime(ROTATE_MS))
    expect(loaded).toHaveLength(2)
  })

  it('keeps a single image without rotating', () => {
    renderWith(items(1))
    loadFirst()
    act(() => vi.advanceTimersByTime(ROTATE_MS * 3))
    expect(loaded).toHaveLength(0)
    expect(visible()).toBe('https://r2/bg-0.webp')
  })
})

it('shows only the dark fallback when the list fails', async () => {
  bgGet.mockResolvedValue(new Response('{}', { status: 500 }) as never)
  const { container } = renderWith()
  await vi.waitFor(() => expect(bgGet).toHaveBeenCalled())
  await act(async () => {})
  expect(container.querySelector('img')).toBeNull()
  expect(screen.getByTestId('home-bg-fallback')).toBeInTheDocument()
})
