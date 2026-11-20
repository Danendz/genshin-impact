import { useEffect, useState } from 'react'
import styles from './characters.module.css'

/**
 * Legacy CharacterImageBG: the namecard (element gradient until it loads, or if it
 * fails) cross-fades, and the centred gacha splash fades out, then the next fades in.
 */
export function LegacyBackground({
  namecard,
  splash,
  element,
}: {
  namecard: string | undefined
  splash: string | undefined
  element: string | null | undefined
}) {
  const card = usePreloaded(namecard)
  const art = usePreloaded(splash)
  const el = element
    ? `var(--color-${element})`
    : 'var(--color-element-fallback)'
  return (
    <div className={styles.backdrop} aria-hidden>
      <Fade
        next={card && { key: `${el}|${card.ok ?? ''}`, value: { el, ...card } }}
        className={styles.bgLayer}
      >
        {(v) => (
          <div style={{ '--el': v.el } as React.CSSProperties}>
            {v.ok && <img src={v.ok} alt="" className={styles.namecard} />}
          </div>
        )}
      </Fade>
      <div className={styles.dim} />
      <Fade
        next={art && { key: art.ok ?? '', value: art.ok }}
        className={styles.splashLayer}
      >
        {(src) =>
          src && (
            <img src={src} alt="" className={styles.splash} draggable={false} />
          )
        }
      </Fade>
    </div>
  )
}

/** settles once `src` has loaded (`ok` set) or failed or is missing (`ok` unset) */
function usePreloaded(src: string | undefined) {
  const [state, setState] = useState<{ src?: string; ok?: string }>()
  useEffect(() => {
    if (!src) return setState({})
    let live = true
    const img = new Image()
    img.onload = () => live && setState({ src, ok: src })
    img.onerror = () => live && setState({ src })
    img.src = src
    return () => {
      live = false
    }
  }, [src])
  return state && state.src === src ? state : undefined
}

type Layer<T> = { key: string; value: T; leaving?: boolean }

/** keeps outgoing layers until their fade-out animation ends */
function Fade<T>({
  next,
  className = '',
  children,
}: {
  next: { key: string; value: T } | undefined
  className?: string
  children: (value: T) => React.ReactNode
}) {
  const [layers, setLayers] = useState<Layer<T>[]>([])
  const top = layers.at(-1)
  if (next && (!top || top.key !== next.key || top.leaving))
    setLayers([
      ...layers
        .filter((l) => l.key !== next.key)
        .map((l) => ({ ...l, leaving: true })),
      next,
    ])
  return layers.map((l) => (
    <div
      key={l.key}
      className={className}
      data-leaving={l.leaving ? '' : undefined}
      onAnimationEnd={() =>
        l.leaving &&
        setLayers((ls) => ls.filter((x) => !(x.key === l.key && x.leaving)))
      }
    >
      {children(l.value)}
    </div>
  ))
}
