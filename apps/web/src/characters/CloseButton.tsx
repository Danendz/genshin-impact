import { Link } from '@tanstack/react-router'
import { GenshinIcon } from '../components/GenshinIcon'
import styles from './characters.module.css'

/** Legacy round close button (#e0ddd4); a home link when `to` is given. */
export function CloseButton({
  label,
  onClick,
  to,
  className = '',
}: {
  label: string
  onClick?: () => void
  to?: '/'
  className?: string
}) {
  const cls = `${styles.close} ${className}`
  const glyph = <GenshinIcon name="close" />
  if (to)
    return (
      <Link to={to} aria-label={label} title={label} className={cls}>
        {glyph}
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
      {glyph}
    </button>
  )
}
