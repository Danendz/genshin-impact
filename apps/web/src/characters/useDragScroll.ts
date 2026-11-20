import { useEffect, useRef } from 'react'

const BOUNCE_MAX = 24

/**
 * Mouse drag-to-scroll for a native scroll container, with an edge bounce.
 * Touch and pen keep the browser's own scrolling; there is no momentum code.
 * Sets `data-dragging` while dragging (CSS turns scroll-snap off) and
 * `--bounce` to how far the drag overshoots an end (CSS translates by it).
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number; left: number; top: number } | null = null
    let dragged = false

    const down = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return
      start = {
        x: e.clientX,
        y: e.clientY,
        left: el.scrollLeft,
        top: el.scrollTop,
      }
      dragged = false
    }
    const move = (e: PointerEvent) => {
      if (!start) return
      const dx = e.clientX - start.x
      const dy = e.clientY - start.y
      if (!dragged) {
        if (Math.hypot(dx, dy) < 4) return
        dragged = true
        el.setPointerCapture(e.pointerId)
        el.dataset.dragging = ''
      }
      const vertical = el.scrollHeight > el.clientHeight
      const want = vertical ? start.top - dy : start.left - dx
      const max = vertical
        ? el.scrollHeight - el.clientHeight
        : el.scrollWidth - el.clientWidth
      const pos = Math.min(max, Math.max(0, want))
      if (vertical) el.scrollTop = pos
      else el.scrollLeft = pos
      const over = (pos - want) / 3
      el.style.setProperty(
        '--bounce',
        `${Math.max(-BOUNCE_MAX, Math.min(BOUNCE_MAX, over))}px`,
      )
    }
    const up = () => {
      if (!start) return
      start = null
      delete el.dataset.dragging
      el.style.setProperty('--bounce', '0px')
    }
    // a drag must not also count as a click on the link under the pointer
    const click = (e: MouseEvent) => {
      if (!dragged) return
      dragged = false
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('pointerdown', down)
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
    el.addEventListener('click', click, true)
    return () => {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
      el.removeEventListener('click', click, true)
    }
  }, [])
  return ref
}
