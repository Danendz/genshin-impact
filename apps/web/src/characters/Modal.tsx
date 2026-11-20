import { type ReactNode, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CloseButton } from './CloseButton'
import styles from './characters.module.css'

/**
 * Legacy ModalWindow: dimmed backdrop, closes on Escape, backdrop click or the close button.
 * Portalled to <body>: the panel's backdrop-filter would otherwise contain `position: fixed`.
 */
export function Modal({
  label,
  closeLabel,
  onClose,
  children,
}: {
  label: string
  closeLabel: string
  onClose: () => void
  children: ReactNode
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: click-outside; Escape is handled on window
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <CloseButton
          label={closeLabel}
          onClick={onClose}
          className="absolute top-3 right-3"
        />
        {children}
      </div>
    </div>,
    document.body,
  )
}
