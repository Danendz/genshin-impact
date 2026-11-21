/** Inline icons for the home screen; legacy used Iconify glyphs of the same names. */
const paths = {
  camera:
    'M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4zm3 4.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z',
  bulletin:
    'M3 4h18v13h-7.5l2.5 4h-2l-2.5-4h-.9L8 21H6l2.5-4H3zm3 3v2h12V7zm0 4v2h8v-2z',
  mail: 'M2 5h20v14H2zm2 2v.5l8 5.5 8-5.5V7l-8 5.5z',
  clock:
    'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 4v7l5.5 3.3 1-1.6-4.5-2.7V6z',
  settings:
    'M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h2v12H5V10zm2 0h6V7a3 3 0 0 0-6 0z',
  edit: 'M4 17.3V20h2.7L17.8 8.9l-2.7-2.7zM20.7 6a1 1 0 0 0 0-1.4l-1.3-1.3a1 1 0 0 0-1.4 0l-1.6 1.6 2.7 2.7z',
  info: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-4v2h2V6z',
  close: 'M6 6l12 12M18 6 6 18',
} as const

export type HomeIconGlyph = keyof typeof paths

export function HomeIcon({
  name,
  className,
}: {
  name: HomeIconGlyph
  className?: string
}) {
  const stroke = name === 'close'
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill={stroke ? 'none' : 'currentColor'}
      fillRule="evenodd"
      stroke={stroke ? 'currentColor' : 'none'}
      strokeWidth={stroke ? 2 : 0}
      strokeLinecap="round"
    >
      <path d={paths[name]} />
    </svg>
  )
}
