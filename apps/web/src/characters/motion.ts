import { type RefObject, useLayoutEffect, useRef } from 'react'

const reduced = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** plays `keyframes` on `el`, then calls `done`; at once without motion or WAAPI */
export function animateOut(
  el: HTMLElement | null,
  keyframes: Keyframe[],
  duration: number,
  done: () => void,
) {
  const a = reduced()
    ? undefined
    : el?.animate?.(keyframes, { duration, easing: 'ease', fill: 'forwards' })
  if (a) a.onfinish = done
  else done()
}

/**
 * Legacy TransitionGroup moves: after a render that reorders the list, each
 * child marked `data-flip` starts at its old spot and slides to the new one, and
 * new children fade in. Offsets inside the list ignore scrolling between renders.
 */
export function useFlip(list: RefObject<HTMLElement | null>) {
  const prev = useRef(new Map<string, [number, number]>())
  useLayoutEffect(() => {
    const el = list.current
    if (!el) return
    const animate = prev.current.size > 0 && !reduced()
    const next = new Map<string, [number, number]>()
    for (const child of el.children) {
      const key = child instanceof HTMLElement && child.dataset.flip
      if (!key) continue
      const at: [number, number] = [child.offsetLeft, child.offsetTop]
      next.set(key, at)
      const was = prev.current.get(key)
      if (!animate) continue
      const opts = { duration: 300, easing: 'ease' }
      if (!was) child.animate?.([{ opacity: 0 }, { opacity: 1 }], opts)
      else if (was[0] !== at[0] || was[1] !== at[1])
        child.animate?.(
          [
            {
              transform: `translate(${was[0] - at[0]}px, ${was[1] - at[1]}px)`,
            },
            { transform: 'none' },
          ],
          opts,
        )
    }
    prev.current = next
  })
}
