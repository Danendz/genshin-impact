import type { Locale } from '@gi/shared'
import { type StringKey, t } from '../../i18n/strings'

const STATS: StringKey[] = ['stat.hp', 'stat.atk', 'stat.def', 'stat.em']

/** Real base stats arrive in a later step; until then each row is a marked placeholder. */
export function Attributes({ locale }: { locale: Locale }) {
  return (
    <dl className="flex flex-col divide-y divide-white/10">
      {STATS.map((k) => (
        <div key={k} className="flex justify-between py-2">
          <dt>{t(locale, k)}</dt>
          <dd className="text-white/50" title={t(locale, 'placeholder')}>
            —
          </dd>
        </div>
      ))}
      <p className="pt-3 text-sm text-white/50">{t(locale, 'placeholder')}</p>
    </dl>
  )
}
