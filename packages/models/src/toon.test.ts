import { describe, expect, it } from 'vitest'
import { decodeImage, encodeLossless, materialPart } from './toon'

describe('materialPart', () => {
  it('takes the part after the last _Mat_', () => {
    expect(materialPart('Avatar_Girl_Catalyst_Citlali_Mat_Hair')).toBe('hair')
    expect(materialPart('Equip_Catalyst_Mat_Body_Mat')).toBe('body-mat')
    expect(materialPart('Plain_Name')).toBe('plain-name')
  })
})

describe('encodeLossless', () => {
  it('keeps RGB under zero alpha (lightmap material ids)', async () => {
    const image = {
      width: 2,
      height: 1,
      rgba: Uint8Array.of(10, 20, 30, 0, 200, 100, 50, 51),
    }
    const decoded = await decodeImage(await encodeLossless(image, true))
    expect([...decoded.rgba]).toEqual([...image.rgba])
  })

  it('drops alpha for RGB-only textures', async () => {
    const image = { width: 1, height: 1, rgba: Uint8Array.of(1, 2, 3, 4) }
    const decoded = await decodeImage(await encodeLossless(image, false))
    expect([...decoded.rgba]).toEqual([1, 2, 3, 255])
  })
})
