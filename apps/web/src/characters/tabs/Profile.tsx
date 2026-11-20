import type { Locale } from '@gi/shared'
import { GameText } from '../../components/GameText'
import { regionLabel, t } from '../../i18n/strings'
import type { CharacterDetail } from '../queries'

export function Profile({
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
    ['profile.region', regionLabel(locale, detail.region)],
    ['profile.birthday', birthday],
    ['profile.release', release],
  ] as const
  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col divide-y divide-white/10">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between py-2">
              <dt className="text-white/70">{t(locale, k)}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      <GameText text={detail.description} className="text-sm text-white/85" />
    </div>
  )
}
