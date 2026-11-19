import { describe, expect, test } from 'vitest'
import {
  LOCALES,
  normalizeElement,
  normalizeRarity,
  normalizeWeaponType,
  toAmberLang,
} from './index'

describe('normalizeElement', () => {
  test.each([
    ['Fire', 'pyro'],
    ['Water', 'hydro'],
    ['Wind', 'anemo'],
    ['Electric', 'electro'],
    ['Grass', 'dendro'],
    ['Ice', 'cryo'],
    ['Rock', 'geo'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeElement(raw)).toBe(expected)
  })

  test('unknown/null/undefined -> null', () => {
    expect(normalizeElement('None')).toBeNull()
    expect(normalizeElement(null)).toBeNull()
    expect(normalizeElement(undefined)).toBeNull()
  })
})

describe('normalizeWeaponType', () => {
  test.each([
    ['WEAPON_SWORD_ONE_HAND', 'sword'],
    ['WEAPON_CLAYMORE', 'claymore'],
    ['WEAPON_POLE', 'polearm'],
    ['WEAPON_BOW', 'bow'],
    ['WEAPON_CATALYST', 'catalyst'],
  ])('%s -> %s', (raw, expected) => {
    expect(normalizeWeaponType(raw)).toBe(expected)
  })

  test('unknown -> null', () => {
    expect(normalizeWeaponType('WEAPON_GUN')).toBeNull()
  })
})

describe('normalizeRarity', () => {
  test('valid and invalid', () => {
    expect(normalizeRarity(5)).toBe(5)
    expect(normalizeRarity(1)).toBe(1)
    expect(normalizeRarity(105)).toBeNull()
    expect(normalizeRarity(6)).toBeNull()
    expect(normalizeRarity(0)).toBeNull()
  })
})

describe('locales', () => {
  test('toAmberLang', () => {
    expect(LOCALES.map(toAmberLang)).toEqual(['en', 'ru', 'chs', 'cht'])
  })
})
