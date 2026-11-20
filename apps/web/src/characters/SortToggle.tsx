import { useState } from 'react'
import styles from './characters.module.css'
import { Icon } from './icons'

/** Legacy TogglerWithList: a pill showing the current option; its list opens upwards. */
export function SortToggle<T extends string>({
  label,
  value,
  options,
  optionLabel,
  onChange,
}: {
  label: string
  value: T
  options: readonly T[]
  optionLabel: (option: T) => string
  onChange: (option: T) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={styles.toggler}>
      {open && (
        <ul aria-label={label} className={styles.togglerList}>
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                aria-pressed={o === value}
                onClick={() => {
                  onChange(o)
                  setOpen(false)
                }}
              >
                {optionLabel(o)}
                <Icon name="check" className={styles.togglerCheck} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className={styles.togglerBtn}
        aria-label={`${label}: ${optionLabel(value)}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="truncate">{optionLabel(value)}</span>
        <Icon name="triangle" className={styles.togglerArrow} />
      </button>
    </div>
  )
}
