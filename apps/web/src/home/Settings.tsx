import type { Locale } from '@gi/shared'
import { useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import { CloseButton } from '../characters/CloseButton'
import characterStyles from '../characters/characters.module.css'
import { useModalLayer } from '../components/layers'
import { saveLocale } from '../i18n/locale'
import { t } from '../i18n/strings'
import styles from './home.module.css'
import { HomeIcon } from './icons'

/** Locale names are shown in their own language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ru: 'Русский',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
}

/** Legacy HomeSettings: a full-screen panel with one section, Language. */
export function Settings({
  locale,
  onClose,
}: {
  locale: Locale
  onClose(): void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useModalLayer(panel, onClose)
  const navigate = useNavigate()

  const choose = (l: Locale) => {
    saveLocale(l)
    // ?locale= outranks the saved choice, so drop it
    navigate({
      to: '.',
      search: (s: Record<string, unknown>) => ({ ...s, locale: undefined }),
    })
  }

  return (
    <div
      ref={panel}
      role="dialog"
      aria-modal="true"
      aria-label={t(locale, 'home.settings')}
      tabIndex={-1}
      className={styles.settings}
    >
      <header className={styles.settingsHeader}>
        <div>
          <HomeIcon name="settings" className={styles.settingsIcon} />
          <h2>
            {t(locale, 'home.settings')} / {t(locale, 'home.language')}
          </h2>
          <CloseButton
            label={t(locale, 'home.close')}
            onClick={onClose}
            className={styles.settingsClose}
          />
        </div>
      </header>
      <div className={styles.settingsMain}>
        <ul className={styles.settingsSections}>
          <li>
            <span aria-current="true" className={characterStyles.rhombus}>
              {t(locale, 'home.language')}
            </span>
          </li>
        </ul>
        <section className={styles.settingsContent}>
          <h3>{t(locale, 'home.language')}</h3>
          <div className={styles.settingsOption}>
            <p>{t(locale, 'home.languageSelect')}</p>
            <div className={styles.settingsChoices}>
              {(Object.keys(LOCALE_NAMES) as Locale[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  lang={l}
                  aria-pressed={l === locale}
                  onClick={() => choose(l)}
                >
                  {LOCALE_NAMES[l]}
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
