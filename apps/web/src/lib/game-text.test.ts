import { describe, expect, it } from 'vitest'
import travelerRu from '../../../api/test/fixtures/amber/avatar-10000005-pyro-ru.json'
import nahida from '../../../api/test/fixtures/amber/avatar-10000073-en.json'
import { formatParamRow, tokenizeGameText } from './game-text'

const plain = (s: string, gender?: 'M' | 'F') =>
  tokenizeGameText(s, gender)
    .map((t) => ('text' in t ? t.text : '\n'))
    .join('')

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

describe('Amber placeholders', () => {
  const travelerBio = travelerRu.data.fetter.detail

  it('resolves gendered text, default male', () => {
    expect(plain(travelerBio)).toMatch(
      /^Путешественник из другого мира, разлучённый со своей сестрой\. Он отправляе/,
    )
    expect(plain(travelerBio, 'F')).toMatch(
      /^Путешественница из другого мира, разлучённая со своим братом\. Она отправляе/,
    )
  })

  it('keeps the PC wording of layout variants and drops the leading #', () => {
    expect(
      plain('#{LAYOUT_MOBILE#Tap}{LAYOUT_PC#Press}{LAYOUT_PS#Press} DMG'),
    ).toBe('Press DMG')
  })

  it('keeps the payload of other upper-case markers', () => {
    expect(plain('a {SOMETHING#b} c')).toBe('a b c')
  })

  it('leaves no raw markers in real talent rows and texts', () => {
    const talents = Object.values(nahida.data.talent) as {
      description: string
      promote?: Record<string, { description: string[]; params: number[] }>
    }[]
    for (const t of talents) {
      expect(plain(t.description)).not.toMatch(/[{}]|^#/)
      for (const lvl of Object.values(t.promote ?? {}))
        for (const row of lvl.description) {
          const r = formatParamRow(row, lvl.params)
          if (r) expect(r.label).not.toMatch(/[{}]|^#/)
        }
    }
  })

  it('cleans scaling labels', () => {
    expect(
      formatParamRow(
        '#{LAYOUT_MOBILE#Tap}{LAYOUT_PC#Press}{LAYOUT_PS#Press} DMG|{param1:F1P}',
        [1.2],
      ),
    ).toEqual({ label: 'Press DMG', value: '120.0%' })
  })
})
