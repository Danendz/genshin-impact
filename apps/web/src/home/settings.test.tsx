import { fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useLocale } from '../i18n/locale'
import { LOCALE_KEY } from '../lib/storage'
import { renderInRouter } from '../test/renderInRouter'
import { Settings } from './Settings'

afterEach(() => localStorage.clear())

function renderSettings(onClose = vi.fn()) {
  const view = renderInRouter(
    () => <Settings locale={useLocale()} onClose={onClose} />,
    { search: '?locale=en' },
  )
  return { ...view, onClose }
}

it('switches and remembers the language, dropping ?locale=', async () => {
  const { router } = renderSettings()
  fireEvent.click(await screen.findByRole('button', { name: 'Русский' }))
  expect(localStorage.getItem(LOCALE_KEY)).toBe('"ru"')
  expect(
    (router.state.location.search as { locale?: string }).locale,
  ).toBeUndefined()
  expect(await screen.findByRole('heading', { level: 2 })).toHaveTextContent(
    'Настройки / Язык',
  )
})

it('marks the current language', async () => {
  renderSettings()
  expect(
    await screen.findByRole('button', { name: 'English' }),
  ).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '简体中文' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
})

it('closes on Escape and on the close button', async () => {
  const { onClose } = renderSettings()
  await screen.findByRole('dialog', { name: 'Settings' })
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})
