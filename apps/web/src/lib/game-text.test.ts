import { describe, expect, it } from 'vitest'
import { formatParamRow, tokenizeGameText } from './game-text'

describe('tokenizeGameText', () => {
  it('handles color, escaped newline and italics', () => {
    expect(
      tokenizeGameText('a <color=#FFD780FF>b</color>\\nc <i>d</i>'),
    ).toEqual([
      { text: 'a ' },
      { text: 'b', color: '#FFD780FF' },
      { br: true },
      { text: 'c ' },
      { text: 'd', italic: true },
    ])
  })

  it('treats a real newline as a break', () => {
    expect(tokenizeGameText('x\ny')).toEqual([
      { text: 'x' },
      { br: true },
      { text: 'y' },
    ])
  })

  it('keeps link text and strips unknown tags', () => {
    expect(tokenizeGameText('{LINK#N123}x{/LINK}')).toEqual([{ text: 'x' }])
    expect(tokenizeGameText('<foo>y</foo>')).toEqual([{ text: 'y' }])
  })

  it('does not throw on an unclosed color', () => {
    const tokens = tokenizeGameText('<color=#FFF>z')
    expect(tokens.map((t) => ('text' in t ? t.text : '')).join('')).toBe('z')
  })

  it('returns nothing for an empty string', () => {
    expect(tokenizeGameText('')).toEqual([])
  })
})

describe('formatParamRow', () => {
  it.each([
    ['Skill DMG|{param1:P}', [1.304], 'Skill DMG', '130%'],
    ['1-Hit DMG|{param1:F1P}', [0.367392], '1-Hit DMG', '36.7%'],
    ['Duration|{param3:F1}s', [0, 0, 30], 'Duration', '30.0s'],
    ['CD|{param1:I}', [4.6], 'CD', '5'],
    ['A|{param1:F2P}+{param2:F2P}', [0.1, 0.2], 'A', '10.00%+20.00%'],
    ['X|{param9:P}', [1], 'X', ''],
  ])('%s', (row, params, label, value) => {
    expect(formatParamRow(row, params)).toEqual({ label, value })
  })

  it('skips empty rows', () => {
    expect(formatParamRow('', [])).toBeNull()
  })
})
