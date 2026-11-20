import { useMemo } from 'react'
import { tokenizeGameText } from '../lib/game-text'

/** Renders Amber game text as React nodes (never as raw HTML). */
export function GameText({
  text,
  className,
}: {
  text: string | null | undefined
  className?: string
}) {
  const tokens = useMemo(() => tokenizeGameText(text ?? ''), [text])
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        // tokens never reorder for a given text, so the index is a stable key
        const key = i
        if ('br' in t) return <br key={key} />
        const style = t.color ? { color: t.color } : undefined
        return t.italic ? (
          <em key={key} style={style}>
            {t.text}
          </em>
        ) : (
          <span key={key} style={style}>
            {t.text}
          </span>
        )
      })}
    </span>
  )
}
