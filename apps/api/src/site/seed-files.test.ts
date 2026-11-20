import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { filterImageFiles } from './seed-files'

describe('filterImageFiles', () => {
  it('keeps extensionless images, drops hidden files and non-images', async () => {
    const webp = new Uint8Array(
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#fff' },
      })
        .webp()
        .toBuffer(),
    )
    const text = new TextEncoder().encode('hello')
    const logs: string[] = []
    const out = await filterImageFiles(
      [
        { name: '0', bytes: webp },
        { name: '.DS_Store', bytes: webp },
        { name: 'notes.txt', bytes: text },
        { name: 'b.png', bytes: webp },
      ],
      (m) => logs.push(m),
    )
    expect(out.map((f) => f.name)).toEqual(['0', 'b.png'])
    expect(logs).toHaveLength(2)
    expect(logs.join('\n')).toMatch(/notes\.txt/)
  })
})
