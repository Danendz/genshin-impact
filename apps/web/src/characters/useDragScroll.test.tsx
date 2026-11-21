import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { useDragScroll } from './useDragScroll'

function Strip({ show }: { show: boolean }) {
  const [, ref] = useDragScroll<HTMLDivElement>()
  return show ? <div ref={ref} data-testid="strip" /> : null
}

function drag(el: HTMLElement, from: number, to: number) {
  const opts = { pointerType: 'mouse', button: 0, pointerId: 1, clientY: 0 }
  fireEvent.pointerDown(el, { ...opts, clientX: from })
  fireEvent.pointerMove(el, { ...opts, clientX: to })
  fireEvent.pointerUp(el, opts)
}

it('drags a strip that mounts after the hook first ran', () => {
  const { rerender } = render(<Strip show={false} />)
  rerender(<Strip show />)
  const el = screen.getByTestId('strip')
  Object.defineProperties(el, {
    scrollWidth: { value: 500 },
    clientWidth: { value: 100 },
    setPointerCapture: { value: () => {} },
  })
  drag(el, 100, 40)
  expect(el.scrollLeft).toBe(60)
})
