import type { Locale } from '@gi/shared'
import { useState } from 'react'
import { t } from '../i18n/strings'
import { formatParamRow } from '../lib/game-text'
import type { Talent } from './details'

/** Talent scaling table at a chosen level; renders nothing without promote data. */
export function Scaling({
  talent,
  locale,
}: {
  talent: Talent
  locale: Locale
}) {
  const levels = Object.values(talent.promote).sort((a, b) => a.level - b.level)
  const [level, setLevel] = useState(levels[0]?.level ?? 1)
  const current = levels.find((l) => l.level === level) ?? levels[0]
  if (!current) return null
  const rows = current.description
    .map((row) => formatParamRow(row, current.params))
    .filter((r) => r !== null)
  return (
    <div className="rounded-lg bg-black/25 p-3 text-sm">
      <label className="mb-2 flex items-center gap-2">
        {t(locale, 'level')}
        <select
          aria-label={t(locale, 'level')}
          value={level}
          onChange={(e) => setLevel(Number(e.target.value))}
          className="rounded bg-white/10 px-2 py-0.5"
        >
          {levels.map((l) => (
            <option key={l.level} value={l.level} className="text-black">
              {l.level}
            </option>
          ))}
        </select>
      </label>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
        {rows.map((r, i) => (
          // labels can repeat; rows are static for a level
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          <div key={i} className="contents">
            <dt className="text-white/70">{r.label}</dt>
            <dd className="text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
