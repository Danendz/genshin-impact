// Generates the viewer's toon sidecar (toon.json + textures) for a character
// (port of models/tools/toon_sidecar.py). Texture slots come from each
// material's `extras.game.textures`; images with a separate `<name>.alpha`
// image are merged into one RGBA texture, since the alpha carries material
// ids / masks. Textures are written as lossless WebP (`exact`, so RGB under
// zero alpha survives) instead of PNG.
import sharp from 'sharp'
import { type Glb, type GltfDoc, imageBytes } from './glb'

const GENSHIN_SLOTS = [
  ['diffuse', '_MainTex', 'diffuse'],
  ['lightMap', '_LightMapTex', 'lightmap'],
  ['rampMap', '_PackedShadowRampTex', 'ramp'],
  ['normalMap', '_BumpMap', 'normal'],
  ['matcap', '_MTMap', null],
  ['specularRamp', '_MTSpecularRamp', 'specular-ramp'],
] as const
const FACE_SLOTS = [
  ['diffuse', '_MainTex', 'diffuse'],
  ['faceMap', '_FaceMapTex', 'lightmap'],
  ['faceShadow', '_LightMapTex', 'shadow'],
] as const
// Normal maps are read as RGB; their `.alpha` image is unused.
const RGB_ONLY = new Set(['normalMap'])
// Weapon containers ship without their lightmap. This one reads as no metal,
// no specular, neutral AO (G 0.5) and material id 1, so the weapon still gets
// the body ramp's shadow and the toon outline.
const NEUTRAL_LIGHTMAP = 'weapon-lightmap.webp'

export interface RawImage {
  width: number
  height: number
  /** 8-bit RGBA */
  rgba: Uint8Array
}

export async function decodeImage(data: Uint8Array): Promise<RawImage> {
  const { data: rgba, info } = await sharp(data)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return { width: info.width, height: info.height, rgba: new Uint8Array(rgba) }
}

export async function encodeLossless(
  image: RawImage,
  alpha: boolean,
): Promise<Uint8Array> {
  let img = sharp(image.rgba, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
  if (!alpha) img = img.removeAlpha()
  return new Uint8Array(
    await img.webp({ lossless: true, exact: true, effort: 4 }).toBuffer(),
  )
}

const hasAlpha = (img: RawImage) => {
  for (let i = 3; i < img.rgba.length; i += 4)
    if (img.rgba[i] !== 255) return true
  return false
}

function withAlpha(color: RawImage, alpha: RawImage): RawImage {
  if (color.width !== alpha.width || color.height !== alpha.height) {
    throw new Error(
      `alpha size ${alpha.width}x${alpha.height} != ${color.width}x${color.height}`,
    )
  }
  const rgba = color.rgba.slice()
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = alpha.rgba[i - 3] as number
  return { ...color, rgba }
}

/** `Avatar_Girl_Catalyst_Citlali_Mat_Hair` -> `hair` */
export function materialPart(name: string): string {
  const i = name.lastIndexOf('_Mat_')
  const tail = i >= 0 ? name.slice(i + 5) : name
  return tail.toLowerCase().replaceAll('_', '-')
}

const gameTextures = (material: GltfDoc): Record<string, string> =>
  material.extras?.game?.textures ?? {}

export interface ToonSidecar {
  json: string
  files: Record<string, Uint8Array>
  missing: string[]
}

export async function buildSidecar(opts: {
  model: Glb
  images: Glb[]
  weapons: Glb[]
  label: string
  element?: string | null
}): Promise<ToonSidecar> {
  const index = new Map<string, { glb: Glb; image: GltfDoc }>()
  for (const glb of [opts.model, ...opts.images, ...opts.weapons]) {
    for (const image of glb.doc.images ?? []) {
      if (image.name && !index.has(image.name))
        index.set(image.name, { glb, image })
    }
  }
  const decode = (name: string) => {
    const { glb, image } = index.get(name) as { glb: Glb; image: GltfDoc }
    if ((image.mimeType ?? 'image/webp').toLowerCase() !== 'image/webp') {
      throw new Error(`${name}: only WebP images are supported`)
    }
    return decodeImage(imageBytes(glb, image))
  }

  const written = new Map<string, string>() // image name -> filename
  const jobs: Promise<void>[] = []
  const files: Record<string, Uint8Array> = {}
  const missing: string[] = []

  const emit = (slot: string, imageName: string, filename: string) => {
    const done = written.get(imageName)
    if (done) return done
    if (!index.has(imageName)) {
      missing.push(imageName)
      return undefined
    }
    written.set(imageName, filename)
    jobs.push(
      (async () => {
        let image = await decode(imageName)
        let keepAlpha = !RGB_ONLY.has(slot)
        const alphaName = `${imageName}.alpha`
        if (keepAlpha && index.has(alphaName))
          image = withAlpha(image, await decode(alphaName))
        else if (keepAlpha) keepAlpha = hasAlpha(image)
        files[filename] = await encodeLossless(image, keepAlpha)
      })(),
    )
    return filename
  }

  const materials: Record<string, Record<string, string>> = {}
  const pendingFaces: [string, Record<string, string>][] = []
  const ramps = new Map<string, string>()
  const anyRamp = () => ramps.get('body') ?? ramps.values().next().value

  for (const material of opts.model.doc.materials ?? []) {
    const name: string = material.name ?? ''
    const textures = gameTextures(material)
    if (!('_MainTex' in textures)) continue
    if ('_FaceMapTex' in textures) {
      pendingFaces.push([name, textures])
      continue
    }
    if (!('_LightMapTex' in textures)) continue
    const part = materialPart(name)
    const cfg: Record<string, string> = { shader: 'genshin' }
    for (const [slot, prop, suffix] of GENSHIN_SLOTS) {
      const tex = textures[prop]
      if (tex === undefined) continue
      const result = emit(
        slot,
        tex,
        suffix ? `${part}-${suffix}.webp` : 'metal-map.webp',
      )
      if (result) cfg[slot] = result
    }
    if (!cfg.diffuse) continue
    if (cfg.rampMap) ramps.set(part, cfg.rampMap)
    materials[name] = cfg
  }

  // Faces have no shadow ramp of their own; the game samples the body's.
  for (const [name, textures] of pendingFaces) {
    const part = materialPart(name)
    const cfg: Record<string, string> = { shader: 'face' }
    for (const [slot, prop, suffix] of FACE_SLOTS) {
      const tex = textures[prop]
      if (tex === undefined) continue
      const result = emit(slot, tex, `${part}-${suffix}.webp`)
      if (result) cfg[slot] = result
    }
    const ramp = anyRamp()
    if (ramp) cfg.rampMap = ramp
    if (cfg.diffuse && cfg.faceMap) {
      const ordered: Record<string, string> = {}
      for (const k of [
        'shader',
        'diffuse',
        'rampMap',
        'faceMap',
        'faceShadow',
      ]) {
        if (cfg[k]) ordered[k] = cfg[k]
      }
      materials[name] = ordered
    }
  }

  for (const weapon of opts.weapons) {
    for (const material of weapon.doc.materials ?? []) {
      const textures = gameTextures(material)
      if (!('_MainTex' in textures) || !material.name) continue
      const name: string = material.name
      const part = materialPart(name).replace(/-mat$/, '')
      const diffuse = emit(
        'diffuse',
        textures._MainTex as string,
        `${part}-diffuse.webp`,
      )
      if (!diffuse) continue
      const cfg: Record<string, string> = { shader: 'genshin', diffuse }
      const lightmap = textures._LightMapTex
      if (lightmap !== undefined && index.has(lightmap)) {
        cfg.lightMap = emit(
          'lightMap',
          lightmap,
          `${part}-lightmap.webp`,
        ) as string
      } else {
        if (![...written.values()].includes(NEUTRAL_LIGHTMAP)) {
          written.set('(neutral weapon lightmap)', NEUTRAL_LIGHTMAP)
          const neutral = {
            width: 1,
            height: 1,
            rgba: Uint8Array.of(0, 128, 0, 0),
          }
          jobs.push(
            encodeLossless(neutral, true).then((b) => {
              files[NEUTRAL_LIGHTMAP] = b
            }),
          )
        }
        cfg.lightMap = NEUTRAL_LIGHTMAP
      }
      const ramp = anyRamp()
      if (ramp) cfg.rampMap = ramp
      if (textures._MTMap !== undefined) {
        const matcap = emit('matcap', textures._MTMap, 'metal-map.webp')
        if (matcap) cfg.matcap = matcap
      }
      if (textures._MTSpecularRamp !== undefined) {
        const spec = emit(
          'specularRamp',
          textures._MTSpecularRamp,
          `${part}-specular-ramp.webp`,
        )
        if (spec) cfg.specularRamp = spec
      }
      materials[name] = cfg
    }
  }

  await Promise.all(jobs)
  const sidecar: GltfDoc = { label: opts.label }
  if (opts.element) sidecar.element = opts.element
  sidecar.materials = materials
  return { json: `${JSON.stringify(sidecar, null, 2)}\n`, files, missing }
}
