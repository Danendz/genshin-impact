import type { Locale } from '@gi/shared'
import hideIcon from '../assets/icons/hide.webp'
import menuIcon from '../assets/icons/menu.webp'
import { t } from '../i18n/strings'
import styles from './characters.module.css'

/** Legacy CharactersBottom: toggle the selection panel and hide the interface. */
export function BottomButtons({
  locale,
  onSelection,
  onHide,
}: {
  locale: Locale
  onSelection: () => void
  onHide: () => void
}) {
  const buttons = [
    ['button.selection', menuIcon, onSelection],
    ['button.hide', hideIcon, onHide],
  ] as const
  return (
    <div className={styles.bottom}>
      {buttons.map(([key, icon, onClick]) => (
        <button
          key={key}
          type="button"
          aria-label={t(locale, key)}
          title={t(locale, key)}
          onClick={onClick}
        >
          <img src={icon} alt="" />
        </button>
      ))}
    </div>
  )
}

/** the one control left on screen while the interface is hidden */
export function ShowButton({
  locale,
  onShow,
}: {
  locale: Locale
  onShow: () => void
}) {
  return (
    <div className={styles.bottom}>
      <button
        type="button"
        aria-label={t(locale, 'button.show')}
        title={t(locale, 'button.show')}
        onClick={onShow}
      >
        <img src={hideIcon} alt="" />
      </button>
    </div>
  )
}
