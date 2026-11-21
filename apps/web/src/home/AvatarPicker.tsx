import type { Locale } from '@gi/shared'
import { useState } from 'react'
import { Modal } from '../characters/Modal'
import type { CharacterListItem } from '../characters/queries'
import { t } from '../i18n/strings'
import styles from './home.module.css'

/** Legacy ChangeAvatar: every character's icon on the left, the pick and "Use" on the right. */
export function AvatarPicker({
  items,
  current,
  locale,
  onConfirm,
  onClose,
}: {
  items: CharacterListItem[]
  current: string
  locale: Locale
  onConfirm(id: string): void
  onClose(): void
}) {
  const [selected, setSelected] = useState(current)
  const pick = items.find((c) => c.id === selected)
  return (
    <Modal
      label={t(locale, 'home.changeAvatar')}
      closeLabel={t(locale, 'home.close')}
      onClose={onClose}
    >
      <h2 className={styles.pickerTitle}>{t(locale, 'home.changeAvatar')}</h2>
      <div className={styles.picker}>
        <ul className={styles.avatarList}>
          {items.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                aria-label={c.name}
                aria-pressed={c.id === selected}
                data-current={c.id === current}
                className={styles.avatarOption}
                onClick={() => setSelected(c.id)}
              >
                <img src={c.media.icon} alt="" className={styles.avatarImg} />
              </button>
            </li>
          ))}
        </ul>
        <div className={styles.avatarPreview}>
          {pick && (
            <>
              <img
                src={pick.media.icon}
                alt=""
                className={styles.avatarPreviewImg}
              />
              <p className={styles.avatarName}>{pick.name}</p>
            </>
          )}
          <button
            type="button"
            className={styles.useBtn}
            disabled={!pick}
            onClick={() => onConfirm(selected)}
          >
            {t(locale, 'home.use')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
