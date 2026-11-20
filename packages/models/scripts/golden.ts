// Checks the TS build against the Python toolchain's outputs for every
// character in ../models (the reference implementation).
//
//   pnpm --filter @gi/models golden [Name ...]
//
// Merged GLBs must match as parsed JSON with an identical BIN chunk (Python
// formats floats differently), weapon/props byte for byte, toon.json exactly
// (after the .png -> .webp rename), and every toon texture pixel for pixel.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import sharp from 'sharp'
import type { Container } from '../src/assemble'
import {
  buildVariantFrom,
  DEFAULT_VARIANT,
  isSkv,
  parseGlb,
} from '../src/index'
import { decodeImage } from '../src/toon'

const MODELS = resolve(
  process.env.MODELS_DIR ?? join(import.meta.dirname, '../../../../models'),
)
const CHARACTERS = join(MODELS, 'characters')
const VIEWER = join(MODELS, 'viewer')

const read = (p: string) => new Uint8Array(readFileSync(p))
const bytesEqual = (a: Uint8Array, b: Uint8Array) =>
  a.length === b.length && Buffer.from(a).equals(Buffer.from(b))

function containers(dir: string): Container[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .map((f) => ({ id: f, bytes: read(join(dir, f)) }))
    .filter((c) => isSkv(c.bytes))
}

async function pixelsEqual(
  ours: Uint8Array,
  theirs: Uint8Array,
): Promise<string | undefined> {
  const a = await decodeImage(ours)
  const b = await decodeImage(theirs)
  if (a.width !== b.width || a.height !== b.height) return 'size'
  const meta = await sharp(theirs).metadata()
  const channels = meta.hasAlpha ? 4 : 3
  let maxDelta = 0
  for (let i = 0; i < a.rgba.length; i++) {
    if (i % 4 >= channels) continue
    maxDelta = Math.max(
      maxDelta,
      Math.abs((a.rgba[i] as number) - (b.rgba[i] as number)),
    )
  }
  return maxDelta === 0 ? undefined : `pixels differ by up to ${maxDelta}`
}

async function check(
  viewerName: string,
  variant: string,
  name: string,
  element: string | null,
  list: Container[],
) {
  const problems: string[] = []
  const built = await buildVariantFrom({
    name,
    element,
    variant,
    containers: list,
  })
  const outDir = join(VIEWER, 'models', viewerName)
  if (!built)
    return existsSync(outDir) ? ['TS skipped a variant Python built'] : []
  if (!existsSync(outDir)) return ['Python has no build for this variant']

  const ref = parseGlb(read(join(outDir, `${viewerName}.glb`)))
  const ours = parseGlb(built.glb)
  if (!isDeepStrictEqual(ours.doc, ref.doc))
    problems.push('merged glb JSON differs')
  if (!bytesEqual(ours.bin, ref.bin)) problems.push('merged glb BIN differs')
  built.weapons.forEach((w, i) => {
    const f = join(outDir, `${viewerName}-weapon${i ? `-${i + 1}` : ''}.glb`)
    if (!existsSync(f) || !bytesEqual(w, read(f)))
      problems.push(`weapon ${i + 1} differs`)
  })
  if (built.props) {
    const f = join(outDir, `${viewerName}-props.glb`)
    if (!existsSync(f) || !bytesEqual(built.props, read(f)))
      problems.push('props differ')
  }

  const toonDir = join(VIEWER, 'toon', viewerName)
  const refJson = readFileSync(join(toonDir, 'toon.json'), 'utf8').replaceAll(
    '.png"',
    '.webp"',
  )
  if (!isDeepStrictEqual(JSON.parse(built.toon.json), JSON.parse(refJson))) {
    problems.push('toon.json differs')
  }
  for (const [file, bytes] of Object.entries(built.toon.files)) {
    const png = join(toonDir, file.replace(/\.webp$/, '.png'))
    if (!existsSync(png)) {
      problems.push(`${file}: no Python counterpart`)
      continue
    }
    const diff = await pixelsEqual(bytes, read(png))
    if (diff) problems.push(`${file}: ${diff}`)
  }
  return problems
}

const only = process.argv.slice(2)
const names = readdirSync(CHARACTERS)
  .filter((n) => existsSync(join(CHARACTERS, n, 'source')))
  .filter((n) => only.length === 0 || only.includes(n))
  .sort()

let failed = 0
let checked = 0
const started = performance.now()
for (const folder of names) {
  const root = join(CHARACTERS, folder)
  const meta = JSON.parse(readFileSync(join(root, 'character.json'), 'utf8'))
  const jobs: [string, string, string, string | null, Container[]][] = [
    [
      meta.name,
      DEFAULT_VARIANT,
      meta.name,
      meta.element ?? null,
      containers(join(root, 'source')),
    ],
  ]
  const extras = join(root, 'extras')
  if (existsSync(extras)) {
    for (const outfit of readdirSync(extras).sort()) {
      const dir = join(extras, outfit)
      if (!statSync(dir).isDirectory()) continue
      const extraMetaPath = join(dir, 'character.json')
      const extraElement = existsSync(extraMetaPath)
        ? (JSON.parse(readFileSync(extraMetaPath, 'utf8')).element ?? null)
        : null
      jobs.push([
        `${folder} - ${outfit}`,
        outfit,
        folder,
        extraElement,
        containers(dir),
      ])
    }
  }
  for (const [viewerName, variant, name, element, list] of jobs) {
    if (list.length === 0) continue
    checked++
    let problems: string[]
    try {
      problems = await check(viewerName, variant, name, element, list)
    } catch (err) {
      problems = [`error: ${(err as Error).message}`]
    }
    if (problems.length) {
      failed++
      console.log(`FAIL ${viewerName}\n  ${problems.join('\n  ')}`)
    } else {
      console.log(`ok   ${viewerName}`)
    }
  }
}
console.log(
  `\n${checked - failed}/${checked} variants match (${((performance.now() - started) / 1000).toFixed(0)} s)`,
)
process.exit(failed ? 1 : 0)
