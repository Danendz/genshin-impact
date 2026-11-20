import { useState } from 'react'
import { PROFILE_KEY, readStored, writeStored } from '../lib/storage'

/** exp needed to leave each rank, from legacy UserData.ts */
export const RANK_EXP: readonly number[] = [
  0, 375, 500, 625, 725, 850, 950, 1075, 1200, 1300, 1425, 1525, 1650, 1775,
  1875, 2000, 2375, 2500, 2625, 2775, 2825, 3425, 3725, 4000, 4300, 4575, 4875,
  5150, 5450, 5725, 6025, 6300, 6600, 6900, 7175, 7475, 7750, 8050, 8325, 8625,
  10550, 11525, 12475, 13450, 14400, 15350, 16325, 17275, 18250, 19200, 26400,
  28800, 31200, 33600, 36000, 232350, 258950, 285750, 312825, 340125,
]

export const MAX_RANK = 60

export const DEFAULT_AVATAR = '10000052' // Raiden Shogun
export const NAMECARD_ID = '10000039' // Diona
export const PROFILE = { rank: 57, exp: 0 } as const

/** legacy read one past the table at MAX_RANK; clamp to the last entry */
export function nextRankExp(ar: number): number {
  return RANK_EXP[Math.min(ar, MAX_RANK - 1)] ?? 0
}

export function worldLevel(ar: number): number {
  return ar <= 19 ? 0 : Math.floor((ar - 20) / 5 + 1)
}

export function newUid(): number {
  return 100_000_000 + Math.floor(Math.random() * 900_000_000)
}

type Stored = { uid?: unknown; avatarId?: unknown }

const validUid = (v: unknown): v is number =>
  Number.isInteger(v) &&
  (v as number) >= 100_000_000 &&
  (v as number) <= 999_999_999

function load(): { uid: number; avatarId: string } {
  const stored = readStored(PROFILE_KEY, (v) =>
    v && typeof v === 'object' ? (v as Stored) : undefined,
  )
  const avatarId =
    typeof stored?.avatarId === 'string' ? stored.avatarId : DEFAULT_AVATAR
  if (validUid(stored?.uid)) return { uid: stored.uid, avatarId }
  const fresh = { uid: newUid(), avatarId }
  writeStored(PROFILE_KEY, fresh)
  return fresh
}

/** The visitor's uid and avatar, kept in localStorage. */
export function useProfile() {
  const [profile, setProfile] = useState(load)
  const setAvatar = (avatarId: string) => {
    const next = { ...profile, avatarId }
    writeStored(PROFILE_KEY, next)
    setProfile(next)
  }
  return { ...profile, setAvatar }
}
