import { GENSHIN_ICONS, type GenshinIconName } from './genshinIconGlyphs'

type Props = {
  name: GenshinIconName
  /** Accessible label. Without it the icon is decorative (aria-hidden). */
  label?: string
  className?: string
}

export function GenshinIcon({ name, label, className }: Props) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--font-genshin-icon)',
        fontStyle: 'normal',
        lineHeight: 1,
      }}
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
    >
      {GENSHIN_ICONS[name]}
    </span>
  )
}
