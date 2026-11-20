import type { Locale } from '@gi/shared'
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { type StatsIconName, statsIcons } from '../assets/icons'
import { type StringKey, t } from '../i18n/strings'
import styles from './characters.module.css'

type Stat = [key: string, icon?: StatsIconName]

/** legacy stats.json: groups, rows and which rows carry an icon */
const GROUPS: [group: string, stats: Stat[]][] = [
  [
    'base-stats',
    [
      ['max-hp', 'hp'],
      ['atk', 'atk'],
      ['def', 'def'],
      ['em', 'em'],
      ['max-stamina', 'stamina'],
    ],
  ],
  [
    'advanced-stats',
    [
      ['crit-rate', 'crit'],
      ['crit-dmg'],
      ['healing-bonus', 'healing-bonus'],
      ['incoming-healing-bonus'],
      ['er', 'er'],
      ['cd-reduction', 'cd-reduction'],
      ['shield-strength', 'shield-strength'],
    ],
  ],
  [
    'elemental-type',
    (
      [
        'pyro',
        'hydro',
        'dendro',
        'electro',
        'anemo',
        'cryo',
        'geo',
        'physical',
      ] as const
    ).flatMap((e): Stat[] => [[`${e}-bonus`, e], [`${e}-res`]]),
  ],
]

/**
 * Legacy DetailsInfo in its ModalWindow: a dark full-screen backdrop with a
 * scrolling stat column; a press on the backdrop or Escape closes it, there is
 * no close button. Values are placeholders until stats have a data source.
 */
export function DetailsOverlay({
  locale,
  onClose,
}: {
  locale: Locale
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const label = (key: string) => t(locale, `stats.${key}` as StringKey)
  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions: click-outside; Escape is handled on window
    <div
      className={styles.detailsBackdrop}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(locale, 'details')}
        className={styles.details}
      >
        {GROUPS.map(([group, stats]) => (
          <section key={group} className={styles.detailsGroup}>
            <h2>{label(group)}</h2>
            <dl>
              {stats.map(([key, icon]) => (
                <div key={key} className={styles.detailsRow}>
                  <dt>
                    {icon ? <img src={statsIcons[icon]} alt="" /> : <span />}
                    {label(key)}
                  </dt>
                  <dd>—</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>,
    document.body,
  )
}
