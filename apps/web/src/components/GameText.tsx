import { useMemo } from 'react'
import { type Gender, tokenizeGameText } from '../lib/game-text'

/** Renders Amber game text as React nodes (never as raw HTML). */
export function GameText({
  text,
  className,
  gender,
}: {
  text: string | null | undefined
  className?: string
  gender?: Gender
}) {
  const tokens = useMemo(
    () => tokenizeGameText(text ?? '', gender),
    [text, gender],
  )
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
