// Sorts one folder's decoded containers into a character (from models/build.py).
import { type Glb, parseGlb, rebrandGlb } from './glb'
import { decodeSkv, type SkvRole } from './skv'

const MESHOPT = 'EXT_meshopt_compression'

export interface Container {
  /** container hash (the file name); containers are processed in id order */
  id: string
  bytes: Uint8Array
}

export interface Part extends Glb {
  id: string
  role: SkvRole
  glb: Uint8Array
}

/** What the rig is, from its root node prefix. */
export type ModelKind = 'avatar' | 'npc' | 'monster'

const KIND_PREFIXES: [string, ModelKind][] = [
  ['Avatar_', 'avatar'],
  ['NPC_Avatar_', 'npc'],
  ['Monster_', 'monster'],
]

export function modelKind(part: Glb): ModelKind | undefined {
  for (const name of rootNames(part))
    for (const [prefix, kind] of KIND_PREFIXES)
      if (name.startsWith(prefix)) return kind
  return undefined
}

export interface Assembled {
  kind: ModelKind
  model: Part
  anim?: Part
  toon?: Part
  props?: Part
  weapons: Part[]
  notes: string[]
}

export class BuildError extends Error {}

export function rootNames(part: Glb): string[] {
  const nodes = part.doc.nodes ?? []
  const scene = (part.doc.scenes ?? [{}])[part.doc.scene ?? 0] ?? {}
  return (scene.nodes ?? []).map((i: number) => nodes[i]?.name ?? '')
}

export const isCompressed = (part: Glb) =>
  (part.doc.extensionsUsed ?? []).includes(MESHOPT)

/** A rigged character: playable (`Avatar_`), its NPC form or a boss (`Monster_`). */
export const isCharacterModel = (part: Part) =>
  part.role === 'model' && modelKind(part) !== undefined

/** `Avatar_Girl_Catalyst_Citlali` -> `Citlali` */
export function characterName(part: Glb): string | undefined {
  for (const name of rootNames(part)) {
    const bits = name.split('_')
    if (bits[0] === 'Avatar' && bits.length >= 4) return bits.slice(3).join('')
  }
  return undefined
}

/** Code-point order, like Python's `sorted()` on the hash names. */
export const byId = (a: Container, b: Container) =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0

export function decodeContainers(containers: Container[]): Part[] {
  return [...containers].sort(byId).map(({ id, bytes }) => {
    let result: ReturnType<typeof decodeSkv>
    try {
      result = decodeSkv(bytes)
    } catch (err) {
      throw new BuildError(`${id}: ${(err as Error).message}`)
    }
    const glb = rebrandGlb(result.glb)
    return { id, role: result.role, glb, ...parseGlb(glb, id) }
  })
}

/** Returns undefined when no part is a rigged character (skill/prop extras). */
export function assemble(parts: Part[]): Assembled | undefined {
  const models = parts.filter(isCharacterModel)
  if (models.length === 0) return undefined
  if (models.length > 1) {
    const names = models.map((m) => characterName(m) ?? m.id).join(', ')
    throw new BuildError(`several characters (${names})`)
  }
  const model = models[0] as Part
  const out: Assembled = {
    kind: modelKind(model) as ModelKind,
    model,
    weapons: [],
    notes: [],
  }
  for (const part of parts) {
    if (part === model) continue
    if (part.role === 'model') out.weapons.push(part)
    else if (!out[part.role]) out[part.role] = part
    else out.notes.push(`extra ${part.role} container ${part.id} ignored`)
  }
  return out
}
