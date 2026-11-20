/** Small inline icons standing in for the legacy site's stat icons (served by the old API). */
const paths = {
  hp: 'M12 2C8 8 5 11.5 5 15a7 7 0 0 0 14 0c0-3.5-3-7-7-13z',
  atk: 'M20 3h1v1L10.5 14.5 12 16l-1.5 1.5-1.8-1.8L5 19.4 4.6 19 8.3 15.3 6.5 13.5 8 12l1.5 1.5z',
  def: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z',
  em: 'M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm-5 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm10 0a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  stamina: 'M12 2c1 5 4 8 10 10-6 2-9 5-10 10-1-5-4-8-10-10 6-2 9-5 10-10z',
  friendship:
    'M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6.5 5 5 0 0 1 21.5 12C19 16.5 12 21 12 21z',
  wardrobe: 'M12 4a2 2 0 0 1 2 2c0 1-.8 1.4-2 2.2V10l9 6v2H3v-2l9-6M12 10v-1.8',
  star: 'M12 1 9 9 1 12l8 3 3 8 3-8 8-3-8-3z',
  filter: 'M3 4h18l-7 8.5V19l-4 2v-8.5z',
  sort: 'M8 4v15M4 15l4 4 4-4M16 20V5M12 9l4-4 4 4',
} as const

export type IconName = keyof typeof paths

export function Icon({
  name,
  className,
  style,
}: {
  name: IconName
  className?: string
  style?: React.CSSProperties
}) {
  const stroke = name === 'wardrobe' || name === 'sort'
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      style={style}
      fill={stroke ? 'none' : 'currentColor'}
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 1.8 : 0}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}
