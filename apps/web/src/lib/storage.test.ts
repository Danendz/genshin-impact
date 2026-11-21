import { afterEach, describe, expect, it, vi } from 'vitest'
import { readStored, writeStored } from './storage'

const isNumber = (v: unknown) => (typeof v === 'number' ? v : undefined)

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('storage', () => {
  it('reads a stored JSON value', () => {
    localStorage.setItem('k', '42')
    expect(readStored('k', isNumber)).toBe(42)
  })

  it('returns undefined when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readStored('k', isNumber)).toBeUndefined()
  })

  it('returns undefined for broken JSON', () => {
    localStorage.setItem('k', '{')
    expect(readStored('k', isNumber)).toBeUndefined()
  })

  it('returns undefined when parse rejects the value', () => {
    localStorage.setItem('k', '"x"')
    expect(readStored('k', isNumber)).toBeUndefined()
  })

  it('writes JSON and swallows storage errors', () => {
    writeStored('k', { a: 1 })
    expect(localStorage.getItem('k')).toBe('{"a":1}')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(() => writeStored('k', 1)).not.toThrow()
  })
})
