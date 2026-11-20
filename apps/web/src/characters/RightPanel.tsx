import type { Locale } from '@gi/shared'
import { useMemo, useState } from 'react'
import { GameText } from '../components/GameText'
import { regionLabel, type StringKey, t } from '../i18n/strings'
import styles from './characters.module.css'
import {
  type Constellation,
  parseCharacterDetails,
  regionGroup,
  type Section,
  type Talent,
  talentKind,
} from './details'
import { Icon, type IconName } from './icons'
import { Modal } from './Modal'
import type { CharacterDetail } from './queries'
import { Scaling } from './Scaling'
import { SkillIcon } from './SkillIcon'

/** The legacy right-hand column; its content follows the left menu section. */
export function RightPanel({
  detail,
  section,
  locale,
}: {
  detail: CharacterDetail
  section: Section
  locale: Locale
}) {
  const { talents, constellations } = useMemo(
    () => parseCharacterDetails(detail.details),
    [detail.details],
  )
  const icons = detail.skillIcons ?? {}
  return (
    <article className={styles.card}>
      {section === 'attributes' && (
        <Attributes detail={detail} locale={locale} />
      )}
      {(section === 'weapon' || section === 'artifacts') && (
        <Placeholder locale={locale} />
      )}
      {section === 'talents' && (
        <SkillList
          entries={talents.map((talent) => ({ talent }))}
          icons={icons}
          locale={locale}
        />
      )}
      {section === 'constellation' && (
        <SkillList
          entries={constellations.map((constellation, i) => ({
            constellation,
            rank: i + 1,
          }))}
          icons={icons}
          locale={locale}
        />
      )}
      {section === 'profile' && <Profile detail={detail} locale={locale} />}
    </article>
  )
}

function Placeholder({ locale }: { locale: Locale }) {
  return <p className="text-white/70">{t(locale, 'placeholder')}</p>
}

function Stars({ rarity }: { rarity: number }) {
  return (
    <p
      className="flex gap-0.5"
      style={{ color: `var(--color-rarity-${rarity})` }}
      role="img"
      aria-label={`${rarity}★`}
    >
      {Array.from({ length: rarity }, (_, i) => (
        // stars are identical and never reorder
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <Icon key={i} name="star" className={styles.star} />
      ))}
    </p>
  )
}

const STATS: [IconName, StringKey][] = [
  ['hp', 'stat.hp'],
  ['atk', 'stat.atk'],
  ['def', 'stat.def'],
  ['em', 'stat.em'],
  ['stamina', 'stat.stamina'],
]

/** legacy AttributesContent; stats, friendship and outfits have no data source yet */
function Attributes({
  detail,
  locale,
}: {
  detail: CharacterDetail
  locale: Locale
}) {
  const [details, setDetails] = useState(false)
  return (
    <div className="flex flex-col gap-2.5">
      <header>
        <h1 className={styles.name}>{detail.name}</h1>
        <Stars rarity={detail.rarity} />
        <p className={styles.level}>
          {t(locale, 'level')} 90 / <span className="text-[#b9b9b9]">90</span>
        </p>
        <div className={`${styles.bar} ${styles.barLevel}`} />
      </header>
      <dl className="flex flex-col">
        {STATS.map(([icon, key]) => (
          <div key={key} className={styles.stat}>
            <dt className="flex items-center gap-1.5">
              <Icon name={icon} className="size-3.5" />
              {t(locale, key)}
            </dt>
            <dd>—</dd>
          </div>
        ))}
      </dl>
      <button
        type="button"
        className={styles.detailsBtn}
        onClick={() => setDetails(true)}
      >
        {t(locale, 'details')}
      </button>
      <div>
        <p className="flex items-center gap-1.5 text-[15px]">
          <Icon name="friendship" className="size-3.5" />
          {t(locale, 'friendship')}
          <span className="ml-auto">10</span>
        </p>
        <div className={`${styles.bar} ${styles.barFriendship}`} />
      </div>
      <GameText text={detail.description} className={styles.description} />
      <button type="button" className={styles.wardrobe} disabled>
        <Icon name="wardrobe" className="size-5" />
        <span className="flex-1">{t(locale, 'wardrobe')}</span>
      </button>
      {details && (
        <Modal
          label={t(locale, 'details')}
          closeLabel={t(locale, 'close')}
          onClose={() => setDetails(false)}
        >
          <h2 className="mb-3 text-xl">{t(locale, 'details')}</h2>
          <Placeholder locale={locale} />
        </Modal>
      )}
    </div>
  )
}

type Entry =
  | { talent: Talent; constellation?: never }
  | { constellation: Constellation; rank: number; talent?: never }

const entryOf = (e: Entry) => e.talent ?? e.constellation

/** game-style icon list; an entry opens its full text in a modal */
function SkillList({
  entries,
  icons,
  locale,
}: {
  entries: Entry[]
  icons: Record<string, string>
  locale: Locale
}) {
  const [open, setOpen] = useState<Entry>()
  if (entries.length === 0) return <Placeholder locale={locale} />
  const caption = (e: Entry) => {
    if (e.constellation) return `C${e.rank}`
    const kind = talentKind(e.talent)
    return kind ? t(locale, `talent.${kind}`) : null
  }
  return (
    <>
      <ul className="flex flex-col gap-1">
        {entries.map((e) => {
          const { icon, name } = entryOf(e)
          const cap = caption(e)
          return (
            <li key={`${icon}-${name}`}>
              <button
                type="button"
                className={styles.skill}
                onClick={() => setOpen(e)}
              >
                <SkillIcon url={icons[icon]} />
                <span className="flex flex-col items-start text-left">
                  <span className="leading-tight">{name}</span>
                  {cap && <span className="text-xs text-[#d3bc8e]">{cap}</span>}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      {open && (
        <Modal
          label={entryOf(open).name}
          closeLabel={t(locale, 'close')}
          onClose={() => setOpen(undefined)}
        >
          <header className="mb-3 flex items-center gap-3 pr-10">
            <SkillIcon url={icons[entryOf(open).icon]} />
            <div>
              <h3 className="text-xl leading-tight">{entryOf(open).name}</h3>
              {caption(open) && (
                <p className="text-sm text-[#d3bc8e]">{caption(open)}</p>
              )}
            </div>
          </header>
          <div className="flex flex-col gap-3">
            <GameText
              text={entryOf(open).description}
              className="text-sm text-white/85"
            />
            {open.talent && <Scaling talent={open.talent} locale={locale} />}
          </div>
        </Modal>
      )}
    </>
  )
}

function Profile({
  detail,
  locale,
}: {
  detail: CharacterDetail
  locale: Locale
}) {
  const [month, day] = detail.birthday ?? []
  const birthday =
    month && day
      ? new Intl.DateTimeFormat(locale, {
          month: 'long',
          day: 'numeric',
        }).format(new Date(2000, month - 1, day))
      : null
  const release = detail.releaseAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
        new Date(detail.releaseAt),
      )
    : null
  const rows = [
    ['profile.region', regionLabel(locale, regionGroup(detail.region))],
    ['profile.birthday', birthday],
    ['profile.release', release],
  ] as const
  return (
    <div className="flex flex-col gap-3">
      <header>
        <h1 className={styles.name}>{detail.name}</h1>
        {detail.title && <p className="text-white/80">{detail.title}</p>}
      </header>
      <dl className="flex flex-col">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className={styles.stat}>
              <dt>{t(locale, k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <GameText text={detail.description} className={styles.description} />
    </div>
  )
}
