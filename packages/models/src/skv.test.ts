import { describe, expect, it } from 'vitest'
import {
  adler32,
  decodeSkv,
  isSkv,
  mixC,
  prngInit,
  prngStep,
  SKV_MAGIC,
} from './skv'

const KEY = Uint8Array.of(
  103,
  66,
  214,
  78,
  233,
  170,
  123,
  74,
  146,
  134,
  184,
  139,
  215,
  194,
  75,
  17,
)

// Vectors from models/tools/skv_decode.py (the reference implementation).
describe('primitives', () => {
  it('mixC matches the Python reference', () => {
    expect([0, 1, 0xffffffff, 123456789].map(mixC)).toEqual([
      2462723854, 2527132011, 920564995, 1573771921,
    ])
  })

  it('prng matches the Python reference', () => {
    const salt = Uint8Array.from({ length: 16 }, (_, i) => i)
    const n = prngInit(salt, KEY, 1)
    expect([...n]).toEqual([3450647081, 78773132, 2447326693, 1214205164])
    expect([prngStep(n), prngStep(n), prngStep(n), prngStep(n)]).toEqual([
      2761674339, 389522245, 1850233527, 2321648600,
    ])
  })

  it('adler32 matches zlib', () => {
    expect(adler32(new TextEncoder().encode('Wikipedia'))).toBe(0x11e60398)
    expect(adler32(new Uint8Array(100_000).fill(255))).toBe(0x149a302c)
  })
})

describe('decodeSkv', () => {
  const header = (version: number) => {
    const raw = new Uint8Array(24 + 48 + 64)
    raw.set(SKV_MAGIC)
    raw[4] = version
    return raw
  }

  it('recognises the magic', () => {
    expect(isSkv(header(2))).toBe(true)
    expect(isSkv(Uint8Array.of(1, 2, 3, 4, 5))).toBe(false)
  })

  it('rejects bad headers', () => {
    expect(() => decodeSkv(new Uint8Array(10))).toThrow('size')
    expect(() => decodeSkv(new Uint8Array(200))).toThrow('magic')
    expect(() => decodeSkv(header(3))).toThrow('version')
    const reserved = header(2)
    reserved[6] = 1
    expect(() => decodeSkv(reserved)).toThrow('reserved')
  })

  it('rejects a directory that does not decrypt', () => {
    expect(() => decodeSkv(header(2))).toThrow('key')
  })
})
