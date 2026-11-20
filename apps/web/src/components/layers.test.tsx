import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useEscape, useModalLayer } from './layers'

function Escapable({ onClose }: { onClose: () => void }) {
  useEscape(onClose)
  return null
}

function Dialog({ onClose, label }: { onClose: () => void; label: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useModalLayer(ref, onClose)
  return (
    <div ref={ref} role="dialog" aria-label={label} tabIndex={-1}>
      <button type="button">first</button>
      <button type="button">last</button>
    </div>
  )
}

const pressEscape = () => fireEvent.keyDown(window, { key: 'Escape' })

describe('layers', () => {
  it('Escape closes only the top layer', () => {
    const panel = vi.fn()
    const modal = vi.fn()
    const { rerender } = render(
      <>
        <Escapable onClose={panel} />
        <Dialog onClose={modal} label="m" />
      </>,
    )
    pressEscape()
    expect(modal).toHaveBeenCalledTimes(1)
    expect(panel).not.toHaveBeenCalled()
    rerender(<Escapable onClose={panel} />)
    pressEscape()
    expect(panel).toHaveBeenCalledTimes(1)
  })

  it('moves focus in on open and back to the opener on close', () => {
    const { rerender } = render(
      <button type="button" data-testid="opener">
        open
      </button>,
    )
    screen.getByTestId('opener').focus()
    rerender(
      <>
        <button type="button" data-testid="opener">
          open
        </button>
        <Dialog onClose={() => {}} label="m" />
      </>,
    )
    expect(screen.getByText('first')).toHaveFocus()
    rerender(
      <button type="button" data-testid="opener">
        open
      </button>,
    )
    expect(screen.getByTestId('opener')).toHaveFocus()
  })

  it('keeps Tab inside the dialog', () => {
    render(<Dialog onClose={() => {}} label="m" />)
    const first = screen.getByText('first')
    const last = screen.getByText('last')
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })
})
