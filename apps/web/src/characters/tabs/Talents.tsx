import type { Locale } from '@gi/shared'
import { useState } from 'react'
import { GameText } from '../../components/GameText'
import { t } from '../../i18n/strings'
import { formatParamRow } from '../../lib/game-text'
import { type Talent, talentKind } from '../details'
import { SkillIcon } from '../SkillIcon'

export function Talents({
  talents,
  icons,
  locale,
}: {
  talents: Talent[]
  icons: Record<string, string>
  locale: Locale
}) {
  if (talents.length === 0)
    return <p className="text-white/50">{t(locale, 'placeholder')}</p>
  return (
    <ul className="flex flex-col gap-5">
      {talents.map((talent) => {
        const kind = talentKind(talent)
        return (
          <li
            key={`${talent.icon}-${talent.name}`}
            className="flex flex-col gap-2"
          >
            <div className="flex items-center gap-3">
              <SkillIcon url={icons[talent.icon]} />
              <div>
                <h3 className="text-lg leading-tight">{talent.name}</h3>
                {kind && (
                  <p className="text-sm text-[#d3bc8e]">
                    {t(locale, `talent.${kind}`)}
                  </p>
                )}
              </div>
            </div>
            <GameText
              text={talent.description}
              className="text-sm text-white/85"
            />
            <Scaling talent={talent} locale={locale} />
          </li>
        )
      })}
    </ul>
  )
}

function Scaling({ talent, locale }: { talent: Talent; locale: Locale }) {
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
        {rows.map((r) => (
          <div key={r.label} className="contents">
            <dt className="text-white/70">{r.label}</dt>
            <dd className="text-right">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
