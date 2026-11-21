import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PROFILE_KEY } from '../lib/storage'
import {
  DEFAULT_AVATAR,
  newUid,
  nextRankExp,
  RANK_EXP,
  useProfile,
  worldLevel,
} from './profile'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const NINE_DIGITS = /^[1-9]\d{8}$/

describe('profile numbers', () => {
  it('has the legacy 60-entry exp table', () => {
    expect(RANK_EXP).toHaveLength(60)
  })

  it('computes world level from the rank', () => {
    expect(worldLevel(19)).toBe(0)
    expect(worldLevel(20)).toBe(1)
    expect(worldLevel(57)).toBe(8)
  })

  it('clamps the next-rank exp to the last entry', () => {
    expect(nextRankExp(57)).toBe(285750)
    expect(nextRankExp(60)).toBe(340125)
    expect(nextRankExp(99)).toBe(340125)
  })

  it('makes 9-digit uids', () => {
    expect(String(newUid())).toMatch(NINE_DIGITS)
  })
})

describe('useProfile', () => {
  it('keeps the same uid across mounts', () => {
    const first = renderHook(() => useProfile())
    const uid = first.result.current.uid
    expect(String(uid)).toMatch(NINE_DIGITS)
    first.unmount()
    expect(renderHook(() => useProfile()).result.current.uid).toBe(uid)
  })

  it.each([[{ uid: 'x' }], [{ uid: 123 }]])(
    'regenerates an invalid stored uid %j',
    (stored) => {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(stored))
      const { result } = renderHook(() => useProfile())
      expect(String(result.current.uid)).toMatch(NINE_DIGITS)
      expect(result.current.avatarId).toBe(DEFAULT_AVATAR)
    },
  )

  it('saves the chosen avatar', () => {
    const first = renderHook(() => useProfile())
    act(() => first.result.current.setAvatar('10000073'))
    expect(first.result.current.avatarId).toBe('10000073')
    first.unmount()
    expect(renderHook(() => useProfile()).result.current.avatarId).toBe(
      '10000073',
    )
  })

  it('works with storage blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useProfile())
    expect(String(result.current.uid)).toMatch(NINE_DIGITS)
    expect(result.current.avatarId).toBe(DEFAULT_AVATAR)
  })
})
