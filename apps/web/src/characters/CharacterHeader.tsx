import type { Element, Locale, WeaponType } from '@gi/shared'
import { GenshinIcon } from '../components/GenshinIcon'
import { t } from '../i18n/strings'

export function CharacterHeader({
  name,
  title,
  rarity,
  element,
  weaponType,
  locale,
}: {
  name: string
  title: string | null
  rarity: number
  element: Element | null
  weaponType: WeaponType
  locale: Locale
}) {
  return (
    <header className="flex flex-col gap-1 drop-shadow-[0_2px_6px_rgb(0_0_0/0.6)]">
      <div className="flex items-center gap-3 text-sm text-white/85">
        {element && (
          <span className="flex items-center gap-1">
            <GenshinIcon name={element} className="text-xl" />
            {t(locale, `element.${element}`)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <GenshinIcon name={weaponType} className="text-xl" />
          {t(locale, `weapon.${weaponType}`)}
        </span>
      </div>
      <h1 className="text-3xl md:text-5xl">{name}</h1>
      {title && <p className="text-white/80">{title}</p>}
      <p
        className="tracking-[0.2em]"
        style={{ color: `var(--color-rarity-${rarity})` }}
        role="img"
        aria-label={`${rarity}★`}
      >
        {'★'.repeat(rarity)}
      </p>
    </header>
  )
}
