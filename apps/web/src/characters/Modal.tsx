import { type ReactNode, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useModalLayer } from '../components/layers'
import { CloseButton } from './CloseButton'
import styles from './characters.module.css'

/**
 * Legacy ModalWindow: dimmed backdrop, closes on Escape (when on top), backdrop click or the close button.
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
  const dialog = useRef<HTMLDivElement>(null)
  useModalLayer(dialog, onClose)
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: click-outside; Escape is handled by useModalLayer
    // biome-ignore lint/a11y/useKeyWithClickEvents: as above
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
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
