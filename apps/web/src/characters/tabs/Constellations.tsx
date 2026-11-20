import type { Locale } from '@gi/shared'
import { GameText } from '../../components/GameText'
import { t } from '../../i18n/strings'
import type { Constellation } from '../details'
import { SkillIcon } from '../SkillIcon'

export function Constellations({
  constellations,
  icons,
  locale,
}: {
  constellations: Constellation[]
  icons: Record<string, string>
  locale: Locale
}) {
  if (constellations.length === 0)
    return <p className="text-white/50">{t(locale, 'placeholder')}</p>
  return (
    <ul className="flex flex-col gap-5">
      {constellations.map((c, i) => (
        <li key={`${c.icon}-${c.name}`} className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <SkillIcon url={icons[c.icon]} />
            <div>
              <p className="text-sm text-[#d3bc8e]">C{i + 1}</p>
              <h3 className="text-lg leading-tight">{c.name}</h3>
            </div>
          </div>
          <GameText text={c.description} className="text-sm text-white/85" />
        </li>
      ))}
    </ul>
  )
}
