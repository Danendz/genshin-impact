import { Link } from '@tanstack/react-router'
import { GenshinIcon } from '../components/GenshinIcon'
import styles from './characters.module.css'

/** Legacy round close/back button (#e0ddd4); a home link when `to` is given. */
export function CloseButton({
  label,
  onClick,
  to,
  glyph = 'close',
  className = '',
}: {
  label: string
  onClick?: () => void
  to?: '/'
  glyph?: 'close' | 'reply'
  className?: string
}) {
  const cls = `${styles.close} ${className}`
  const icon = <GenshinIcon name={glyph} />
  if (to)
    return (
      <Link to={to} aria-label={label} title={label} className={cls}>
        {icon}
      </Link>
    )
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cls}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}
