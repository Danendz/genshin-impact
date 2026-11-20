import { useState } from 'react'
import { useLocale } from '../i18n/locale'
import { t } from '../i18n/strings'
import { Background } from './Background'
import styles from './home.module.css'
import { HomeIcon } from './icons'
import { Locked } from './Locked'
import { ProfileCard } from './ProfileCard'
import { Settings } from './Settings'
import { Tiles } from './Tiles'

const LOCKED_OPTIONS = ['camera', 'bulletin', 'mail', 'clock'] as const

/** Legacy HomeLayout: background, option icons, profile card + tiles, settings panel. */
export function HomePage() {
  const locale = useLocale()
  const [settings, setSettings] = useState(false)

  return (
    <div className={styles.page}>
      <Background />
      <main hidden={settings} className={styles.home}>
        <section className={styles.options}>
          {LOCKED_OPTIONS.map((name) => (
            <Locked
              key={name}
              label={t(locale, `home.option.${name}` as const)}
              className={styles.option}
            >
              <HomeIcon name={name} />
            </Locked>
          ))}
          <button
            type="button"
            aria-label={t(locale, 'home.option.settings')}
            className={styles.option}
            onClick={() => setSettings(true)}
          >
            <HomeIcon name="settings" />
          </button>
        </section>
        <section className={styles.main}>
          <ProfileCard locale={locale} />
          <Tiles locale={locale} />
        </section>
      </main>
      {settings && (
        <Settings locale={locale} onClose={() => setSettings(false)} />
      )}
    </div>
  )
}
