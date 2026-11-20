import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = resolve(import.meta.dirname, '..')

function files(dir: string, keep: (name: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name)
    if (e.isDirectory()) return files(path, keep)
    return keep(e.name) ? [path] : []
  })
}

const read = (path: string) =>
  readFileSync(path, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** colours live in styles/theme.css; everything else refers to them */
describe('design tokens', () => {
  const RAW_COLOR = /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i

  it.each(
    files(src, (n) => n.endsWith('.module.css')).map((p) => [
      p.slice(src.length + 1),
      p,
    ]),
  )('%s uses colour tokens', (_, path) => {
    const lines = read(path)
      .split('\n')
      .filter((l) => RAW_COLOR.test(l))
    expect(lines).toEqual([])
  })

  it.each(
    files(src, (n) => n.endsWith('.tsx') && !n.includes('.test.')).map((p) => [
      p.slice(src.length + 1),
      p,
    ]),
  )('%s has no arbitrary colours', (_, path) => {
    const hits = read(path).match(/\[#[0-9a-f]{3,8}\]|'#[0-9a-f]{3,8}'/gi)
    expect(hits).toBeNull()
  })

  it('turns motion off under prefers-reduced-motion', () => {
    const theme = read(resolve(src, 'styles/theme.css'))
    const block = theme.split('prefers-reduced-motion: reduce')[1] ?? ''
    expect(block).toMatch(/animation-duration:\s*0\.01ms\s*!important/)
    expect(block).toMatch(/transition-duration:\s*0\.01ms\s*!important/)
  })
})
