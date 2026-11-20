import { type RefObject, useEffect, useRef } from 'react'

/** open layers, oldest first; only the last one answers Escape */
const stack: symbol[] = []

/** Escape calls `onEscape` while this is the topmost open layer. */
export function useEscape(onEscape: () => void) {
  const latest = useRef(onEscape)
  useEffect(() => {
    latest.current = onEscape
  })
  useEffect(() => {
    const id = Symbol('layer')
    stack.push(id)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack.at(-1) !== id) return
      e.preventDefault()
      latest.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      stack.splice(stack.indexOf(id), 1)
    }
  }, [])
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * A modal layer: Escape (when on top), focus moved inside on open and back to
 * where it was on close, and Tab kept inside. The element needs tabIndex={-1}
 * so it can take focus when it has no controls.
 */
export function useModalLayer(
  ref: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  useEscape(onClose)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const items = () => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
    ;(items()[0] ?? el).focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = items()
      const first = list[0]
      const last = list.at(-1)
      if (!first || !last) {
        e.preventDefault()
        return
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [ref])
}
