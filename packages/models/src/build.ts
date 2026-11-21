// One-step build: a character's SKV containers -> viewer-ready files
// (the parts of models/build.py the web app needs).
import {
  type Assembled,
  assemble,
  type Container,
  decodeContainers,
  isCompressed,
} from './assemble'
import { parseGlb } from './glb'
import { decompressMeshopt, mergeAnimations } from './merge-anim'
import { buildSidecar, type ToonSidecar } from './toon'

export interface BuiltVariant {
  /** `default`, or the outfit/boss label from the source (`Outfit`, `Childe Boss`) */
  variant: string
  /** `<Name>.glb`: the character with its animation library merged in */
  glb: Uint8Array
  /** default weapon first; meshopt-compressed, as the viewer loads them */
  weapons: Uint8Array[]
  props?: Uint8Array
  toon: ToonSidecar
  clips: string[]
  /** sorted container hashes this variant was built from */
  sourceHashes: string[]
  notes: string[]
}

export interface BuildInput {
  name: string
  element?: string | null
  main: Container[]
  extras?: Record<string, Container[]>
}

export interface BuildOutput {
  variants: BuiltVariant[]
  /** extras that aren't rigged character models (skill props) */
  skipped: string[]
}

export const DEFAULT_VARIANT = 'default'

async function buildVariant(
  variant: string,
  label: string,
  element: string | null | undefined,
  character: Assembled,
  containers: Container[],
): Promise<BuiltVariant> {
  let glb = character.model.glb
  let clips: string[] = []
  if (character.anim) {
    const anim = isCompressed(character.anim)
      ? parseGlb(await decompressMeshopt(character.anim.glb), 'anim')
      : character.anim
    ;({ glb, clips } = mergeAnimations(character.model, anim))
  }
  const toon = await buildSidecar({
    model: character.model,
    images: character.toon ? [character.toon] : [],
    weapons: character.weapons,
    label: `${label} — Genshin toon`,
    element,
  })
  return {
    variant,
    glb,
    weapons: character.weapons.map((w) => w.glb),
    props: character.props?.glb,
    toon,
    clips,
    sourceHashes: containers.map((c) => c.id).sort(),
    notes: character.notes,
  }
}

/** Build one variant's containers; undefined if none of them is a rigged model. */
export async function buildVariantFrom(input: {
  name: string
  element?: string | null
  variant: string
  containers: Container[]
}): Promise<BuiltVariant | undefined> {
  const character = assemble(decodeContainers(input.containers))
  if (!character) return undefined
  const label =
    input.variant === DEFAULT_VARIANT
      ? input.name
      : `${input.name} - ${input.variant}`
  return buildVariant(
    input.variant,
    label,
    input.element,
    character,
    input.containers,
  )
}

export async function buildCharacter(input: BuildInput): Promise<BuildOutput> {
  const main = await buildVariantFrom({
    ...input,
    variant: DEFAULT_VARIANT,
    containers: input.main,
  })
  if (!main)
    throw new Error(
      `${input.name}: no character model among ${input.main.length} containers`,
    )
  const out: BuildOutput = { variants: [main], skipped: [] }
  for (const [variant, containers] of Object.entries(input.extras ?? {})) {
    const built = await buildVariantFrom({ ...input, variant, containers })
    if (built) out.variants.push(built)
    else out.skipped.push(variant)
  }
  return out
}
