import { useState } from 'react'
import styles from './characters.module.css'

/** Namecard art under the centred gacha splash; the element gradient shows until they load. */
export function LegacyBackground({
  namecard,
  splash,
  element,
}: {
  namecard: string | undefined
  splash: string | undefined
  element: string | null | undefined
}) {
  const style = {
    '--el': element ? `var(--color-${element})` : '#5b6170',
  } as React.CSSProperties
  return (
    <div className={styles.backdrop} style={style} aria-hidden>
      <CrossFade src={namecard} className={styles.namecard} />
      <div className={styles.dim} />
      <CrossFade src={splash} className={styles.splash} />
    </div>
  )
}

/** keeps the previous image until the next one has loaded, then fades it in */
function CrossFade({
  src,
  className = '',
}: {
  src: string | undefined
  className?: string
}) {
  const [shown, setShown] = useState<string>()
  return (
    <>
      {shown && (
        <img src={shown} alt="" className={className} draggable={false} />
      )}
      {src && src !== shown && (
        <img
          key={src}
          src={src}
          alt=""
          className={`${className} ${styles.incoming}`}
          draggable={false}
          onLoad={(e) => {
            e.currentTarget.dataset.loaded = ''
          }}
          onTransitionEnd={() => setShown(src)}
        />
      )}
    </>
  )
}
