import type { ReactNode } from 'react'
import { useLocale } from '../i18n/locale'
import { t } from '../i18n/strings'
import styles from './home.module.css'
import { HomeIcon } from './icons'

/** Anything that leads to a page or feature that isn't built yet: dimmed, locked, inert. */
export function Locked({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  const locale = useLocale()
  return (
    <button
      type="button"
      aria-disabled="true"
      aria-label={label}
      title={t(locale, 'home.comingSoon')}
      className={`${styles.locked} ${className ?? ''}`}
      onClick={(e) => e.preventDefault()}
    >
      {children}
      <HomeIcon name="lock" className={styles.lock} />
    </button>
  )
}
