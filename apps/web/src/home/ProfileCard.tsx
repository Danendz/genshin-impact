import type { Locale } from '@gi/shared'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { homeIcons } from '../assets/icons'
import { charactersListQuery } from '../characters/queries'
import { t } from '../i18n/strings'
import { AvatarPicker } from './AvatarPicker'
import styles from './home.module.css'
import { HomeIcon } from './icons'
import { Locked } from './Locked'
import {
  DEFAULT_AVATAR,
  NAMECARD_ID,
  nextRankExp,
  PROFILE,
  useProfile,
  worldLevel,
} from './profile'

const COPIED_MS = 1500

/** Legacy HomeMainUserInfo: namecard banner, avatar + UID on the left, profile rows on the right. */
export function ProfileCard({ locale }: { locale: Locale }) {
  const { uid, avatarId, setAvatar } = useProfile()
  const { data: items } = useQuery(charactersListQuery(locale))
  const byId = (id: string) => items?.find((c) => c.id === id)
  const avatar = byId(avatarId) ?? byId(DEFAULT_AVATAR)
  const namecard = byId(NAMECARD_ID)?.media.namecard
  const [picking, setPicking] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = () => {
    // missing outside secure contexts; a refusal just shows nothing
    navigator.clipboard?.writeText(String(uid)).then(
      () => setCopied(true),
      () => {},
    )
  }

  const next = nextRankExp(PROFILE.rank)
  const info = (label: string) => (
    <Locked label={label} className={styles.infoBtn}>
      <HomeIcon name="info" />
    </Locked>
  )

  return (
    <section className={styles.card}>
      {namecard && (
        <img
          src={namecard}
          alt=""
          data-testid="namecard"
          className={styles.namecard}
        />
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardLeft}>
          <button
            type="button"
            aria-label={t(locale, 'home.changeAvatar')}
            className={styles.avatar}
            disabled={!avatar}
            onClick={() => setPicking(true)}
          >
            {avatar ? (
              <img src={avatar.media.icon} alt="" />
            ) : (
              <span className={styles.avatarPlaceholder} />
            )}
          </button>
          <p className={styles.uid}>
            {`${t(locale, 'home.uid')} ${uid}`}
            {copied && (
              <span role="status" className={styles.copied}>
                {t(locale, 'home.copied')}
              </span>
            )}
          </p>
          <button type="button" className={styles.copy} onClick={copy}>
            {t(locale, 'home.copy')}
          </button>
        </div>

        <div className={styles.cardRight}>
          <div className={styles.name}>
            <span>{t(locale, 'home.name')}</span>
            <Locked label={t(locale, 'home.name')} className={styles.editBtn}>
              <HomeIcon name="edit" />
            </Locked>
          </div>
          <p className={styles.signature}>{t(locale, 'home.signature')}</p>
          <div className={`${styles.row} ${styles.banded}`}>
            <span>{t(locale, 'home.adventureRank')}:</span>
            <span className={styles.value}>{PROFILE.rank}</span>
            {info(t(locale, 'home.adventureRank'))}
          </div>
          <div className={styles.exp}>
            <img src={homeIcons.adventure} alt="" />
            <div>
              <div className={styles.expText}>
                <span>{t(locale, 'home.adventureExp')}</span>
                <span>{`${PROFILE.exp} / ${next}`}</span>
              </div>
              <progress value={PROFILE.exp} max={next} />
            </div>
          </div>
          <div className={`${styles.row} ${styles.banded}`}>
            <span>{t(locale, 'home.worldLevel')}:</span>
            <span className={styles.value}>{worldLevel(PROFILE.rank)}</span>
            {info(t(locale, 'home.worldLevel'))}
          </div>
          <div className={styles.row}>
            <span>{t(locale, 'home.birthday')}:</span>
            <span className={styles.value}>—</span>
          </div>
        </div>
      </div>

      {picking && items && avatar && (
        <AvatarPicker
          items={items}
          current={avatar.id}
          locale={locale}
          onClose={() => setPicking(false)}
          onConfirm={(id) => {
            setAvatar(id)
            setPicking(false)
          }}
        />
      )}
    </section>
  )
}
