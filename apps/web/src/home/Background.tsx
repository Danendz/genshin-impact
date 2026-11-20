import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import styles from './home.module.css'
import { homeBackgroundsQuery } from './queries'
import { pickNext, ROTATE_MS } from './rotation'

type Layers = { urls: [string?, string?]; front: 0 | 1; index: number }

/** Full-screen art that crossfades to another random image every ROTATE_MS, once it has loaded. */
export function Background() {
  const { data } = useQuery(homeBackgroundsQuery)
  const count = data?.length ?? 0
  const [layers, setLayers] = useState<Layers>()

  if (data && count > 0 && !layers) {
    const index = pickNext(count, undefined, Math.random)
    setLayers({ urls: [data[index]?.url], front: 0, index })
  }

  const index = layers?.index
  useEffect(() => {
    if (!data || count <= 1 || index === undefined) return
    let img: HTMLImageElement | undefined
    const timer = setTimeout(() => {
      const next = pickNext(count, index, Math.random)
      const url = data[next]?.url
      if (!url) return
      img = new Image()
      img.onload = () =>
        setLayers((l) => {
          if (!l) return l
          const back = l.front === 0 ? 1 : 0
          const urls: Layers['urls'] = [...l.urls]
          urls[back] = url
          return { urls, front: back, index: next }
        })
      img.src = url
    }, ROTATE_MS)
    return () => {
      clearTimeout(timer)
      if (img) img.onload = null
    }
  }, [data, count, index])

  return (
    <div className={styles.background} data-testid="home-bg-fallback">
      {layers?.urls.map((url, i) =>
        url ? (
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: two fixed layers
            key={i}
            src={url}
            alt=""
            data-testid="home-bg"
            data-visible={layers.front === i}
            className={styles.backgroundLayer}
          />
        ) : null,
      )}
    </div>
  )
}
