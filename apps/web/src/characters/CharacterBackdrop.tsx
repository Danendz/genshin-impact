import { useState } from 'react'
import styles from './characters.module.css'

/** Cross-fades to a new gacha splash once it has loaded; the gradient shows meanwhile. */
export function CharacterBackdrop({
  splash,
  element,
}: {
  splash: string | undefined
  element: string | null | undefined
}) {
  const [shown, setShown] = useState<string>()
  const style = {
    '--el': element ? `var(--color-${element})` : '#5b6170',
  } as React.CSSProperties
  return (
    <div className={styles.backdrop} style={style} aria-hidden>
      {shown && <img src={shown} alt="" className={styles.splash} />}
      {splash && splash !== shown && (
        <img
          key={splash}
          src={splash}
          alt=""
          className={`${styles.splash} ${styles.incoming}`}
          onLoad={(e) => {
            e.currentTarget.dataset.loaded = ''
          }}
          onTransitionEnd={() => setShown(splash)}
        />
      )}
    </div>
  )
}
