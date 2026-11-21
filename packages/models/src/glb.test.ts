import { describe, expect, it } from 'vitest'
import { parseGlb, rebrandGlb, writeGlb } from './glb'

const glb = (doc: object, bin = Uint8Array.of(1, 2, 3, 4)) => writeGlb(doc, bin)

describe('rebrandGlb', () => {
  it('renames the skowt extras key and generator, keeping the BIN', () => {
    const source = glb({
      asset: { version: '2.0', generator: 'skowt' },
      nodes: [{ name: 'skowt', extras: { skowt: { fx: { prefab: 'a' } } } }],
      materials: [{ extras: { skowt: { masks: 1 } } }],
    })
    const out = parseGlb(rebrandGlb(source))
    expect(out.doc).toEqual({
      asset: { version: '2.0', generator: 'danendz' },
      nodes: [{ name: 'skowt', extras: { danendz: { fx: { prefab: 'a' } } } }],
      materials: [{ extras: { danendz: { masks: 1 } } }],
    })
    expect([...out.bin]).toEqual([1, 2, 3, 4])
  })

  it('pads the JSON chunk to 4 bytes with spaces', () => {
    const out = rebrandGlb(glb({ extras: { skowt: 1 } }))
    const jsonLen = new DataView(out.buffer).getUint32(12, true)
    expect(jsonLen % 4).toBe(0)
    expect(new DataView(out.buffer).getUint32(8, true)).toBe(out.length)
  })

  it('returns the input when there is nothing to rename', () => {
    const source = glb({ asset: { generator: 'other' } })
    expect(rebrandGlb(source)).toBe(source)
  })
})
