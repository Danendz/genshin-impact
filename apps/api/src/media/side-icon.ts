import sharp from 'sharp'

/** The game's side icons are 128×128, the head resting on the bottom edge. */
export const SIDE_CANVAS = 128
/** where the head starts across the game's canvas */
const SIDE_LEFT = 32

/**
 * Some sources ship side icons cropped tight to the head. Put those back on the
 * game's canvas at the same pixel scale, so every head shows at one size.
 */
export async function squareSideIcon(input: Uint8Array): Promise<Uint8Array> {
  const { width = 0, height = 0 } = await sharp(input).metadata()
  if (width > SIDE_CANVAS || height > SIDE_CANVAS) return input
  if (width === SIDE_CANVAS && height === SIDE_CANVAS) return input
  const left = Math.min(SIDE_LEFT, SIDE_CANVAS - width)
  const out = await sharp(input)
    .ensureAlpha()
    .extend({
      top: SIDE_CANVAS - height,
      bottom: 0,
      left,
      right: SIDE_CANVAS - width - left,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer()
  return new Uint8Array(out)
}
