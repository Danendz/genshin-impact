/** Amber game strings: <color=#RRGGBBAA>, <i>, {LINK#..}..{/LINK}, and literal "\n" escapes. */
export type TextToken =
  | { text: string; color?: string; italic?: boolean }
  | { br: true }

const TOKEN =
  /<color=([^>]*)>|<\/color>|<i>|<\/i>|<[^>]*>|\{\/?LINK[^}]*\}|\\n|\n/g

export function tokenizeGameText(s: string): TextToken[] {
  const out: TextToken[] = []
  const colors: string[] = []
  let italic = 0
  const push = (text: string) => {
    if (!text) return
    const color = colors.at(-1)
    const prev = out.at(-1)
    if (
      prev &&
      'text' in prev &&
      prev.color === color &&
      !!prev.italic === italic > 0
    ) {
      prev.text += text
      return
    }
    out.push({
      text,
      ...(color ? { color } : {}),
      ...(italic > 0 ? { italic: true } : {}),
    })
  }

  let last = 0
  for (const m of s.matchAll(TOKEN)) {
    push(s.slice(last, m.index))
    last = m.index + m[0].length
    const tag = m[0]
    if (m[1] !== undefined) colors.push(m[1])
    else if (tag === '</color>') colors.pop()
    else if (tag === '<i>') italic++
    else if (tag === '</i>') italic = Math.max(0, italic - 1)
    else if (tag === '\\n' || tag === '\n') out.push({ br: true })
    // any other tag or LINK marker is dropped, its inner text kept
  }
  push(s.slice(last))
  return out
}

const PARAM = /\{param(\d+):([A-Z0-9]+)\}/g

function formatParam(value: number | undefined, format: string): string {
  if (value === undefined) return ''
  const percent = format.endsWith('P')
  const n = percent ? value * 100 : value
  const fixed = /^F(\d)/.exec(format)
  if (fixed) return `${n.toFixed(Number(fixed[1]))}${percent ? '%' : ''}`
  if (format === 'P') return `${Math.round(n)}%`
  if (format === 'I') return String(Math.round(n))
  return String(value)
}

/** "Label|{param1:F1P} DEF" -> { label, value }; empty rows -> null */
export function formatParamRow(
  row: string,
  params: number[],
): { label: string; value: string } | null {
  if (!row) return null
  const [label = '', template = ''] = row.split('|')
  const value = template.replace(PARAM, (_, i: string, fmt: string) =>
    formatParam(params[Number(i) - 1], fmt),
  )
  return { label, value }
}
