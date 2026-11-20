import type { Locale } from '@gi/shared'
import { useId, useMemo, useState } from 'react'
import { type StringKey, t } from '../i18n/strings'
import { parseCharacterDetails } from './details'
import type { CharacterDetail } from './queries'
import { Attributes } from './tabs/Attributes'
import { Constellations } from './tabs/Constellations'
import { Profile } from './tabs/Profile'
import { Talents } from './tabs/Talents'

const TABS = ['attributes', 'talents', 'constellations', 'profile'] as const
type Tab = (typeof TABS)[number]

export function DetailPanel({
  detail,
  locale,
}: {
  detail: CharacterDetail
  locale: Locale
}) {
  const [tab, setTab] = useState<Tab>('attributes')
  const id = useId()
  const { talents, constellations } = useMemo(
    () => parseCharacterDetails(detail.details),
    [detail.details],
  )
  const icons = detail.skillIcons ?? {}

  return (
    <div className="flex min-h-0 flex-col rounded-2xl bg-[#1c2130]/85 text-white shadow-2xl backdrop-blur-md">
      <div
        role="tablist"
        className="flex gap-1 border-b border-white/10 px-3 pt-3"
      >
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-${name}`}
            aria-selected={tab === name}
            aria-controls={`${id}-panel`}
            onClick={() => setTab(name)}
            className={`rounded-t-lg px-3 py-2 text-sm transition ${
              tab === name
                ? 'bg-[#ece5d8] text-[#3b4255]'
                : 'text-white/70 hover:text-white'
            }`}
          >
            {t(locale, `tab.${name}` as StringKey)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto p-4"
      >
        {tab === 'attributes' && <Attributes locale={locale} />}
        {tab === 'talents' && (
          <Talents talents={talents} icons={icons} locale={locale} />
        )}
        {tab === 'constellations' && (
          <Constellations
            constellations={constellations}
            icons={icons}
            locale={locale}
          />
        )}
        {tab === 'profile' && <Profile detail={detail} locale={locale} />}
      </div>
    </div>
  )
}
