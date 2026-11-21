import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { SIDE_CANVAS, squareSideIcon } from './side-icon'

const png = (width: number, height: number) =>
  sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
    .then((b) => new Uint8Array(b))

/** the canvas size and the opaque box inside it */
async function content(bytes: Uint8Array) {
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let [x0, y0, x1, y1] = [info.width, info.height, -1, -1]
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3]) {
        x0 = Math.min(x0, x)
        y0 = Math.min(y0, y)
        x1 = Math.max(x1, x)
        y1 = Math.max(y1, y)
      }
  return {
    width: info.width,
    height: info.height,
    box: { left: x0, top: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
  }
}

describe('squareSideIcon', () => {
  it('puts a cropped head back on the game canvas, at its scale, sitting on the bottom', async () => {
    const out = await content(await squareSideIcon(await png(86, 86)))
    expect(out.width).toBe(SIDE_CANVAS)
    expect(out.height).toBe(SIDE_CANVAS)
    expect(out.box).toEqual({ left: 32, top: 42, w: 86, h: 86 })
  })

  it('shifts a wide head left so it still fits', async () => {
    const out = await content(await squareSideIcon(await png(114, 123)))
    expect(out.box).toEqual({ left: 14, top: 5, w: 114, h: 123 })
  })

  it('leaves icons already on the canvas, or larger than it, untouched', async () => {
    for (const [w, h] of [
      [128, 128],
      [256, 256],
      [140, 90],
    ] as const) {
      const input = await png(w, h)
      expect(await squareSideIcon(input)).toBe(input)
    }
  })
})
