// Merges the `anim` container's clips into the skinned `model` GLB
// (port of models/tools/merge_anim.py + .tools/decompress.mjs).
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { MeshoptDecoder } from 'meshoptimizer'
import { type Glb, type GltfDoc, writeGlb } from './glb'

let io: Promise<NodeIO> | undefined

function getIo(): Promise<NodeIO> {
  io ??= MeshoptDecoder.ready.then(() =>
    new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ 'meshopt.decoder': MeshoptDecoder }),
  )
  return io
}

/** Strip EXT_meshopt_compression (decodes the buffers). */
export async function decompressMeshopt(glb: Uint8Array): Promise<Uint8Array> {
  const nodeIo = await getIo()
  const doc = await nodeIo.readBinary(glb)
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose()
  }
  return nodeIo.writeBinary(doc)
}

export function mergeAnimations(
  model: Glb,
  anim: Glb,
): { glb: Uint8Array; clips: string[] } {
  const doc: GltfDoc = structuredClone(model.doc)
  const firstIndex = new Map<string, number>()
  ;(doc.nodes ?? []).forEach((n: GltfDoc, i: number) => {
    if (n.name != null && !firstIndex.has(n.name)) firstIndex.set(n.name, i)
  })
  const nodeMap = new Map<number, number>()
  const missing: string[] = []
  ;(anim.doc.nodes ?? []).forEach((n: GltfDoc, i: number) => {
    const target = n.name != null ? firstIndex.get(n.name) : undefined
    if (target === undefined) missing.push(n.name ?? `#${i}`)
    else nodeMap.set(i, target)
  })
  if (missing.length) {
    throw new Error(`anim nodes not present in model: ${missing.slice(0, 10)}`)
  }
  if (!anim.doc.animations?.length)
    throw new Error('animation GLB has no animations')

  // Append the whole anim buffer and every bufferView/accessor; copying all of
  // them keeps sampler indices valid and is simpler than pruning.
  const base = model.bin.length
  const animBin = new Uint8Array(
    anim.bin.length + ((4 - (anim.bin.length % 4)) % 4),
  )
  animBin.set(anim.bin)
  const oldBv = doc.bufferViews?.length ?? 0
  const oldAcc = doc.accessors?.length ?? 0
  doc.bufferViews ??= []
  for (const bv of anim.doc.bufferViews ?? []) {
    doc.bufferViews.push({
      ...bv,
      buffer: 0,
      byteOffset: (bv.byteOffset ?? 0) + base,
    })
  }
  doc.accessors ??= []
  for (const acc of anim.doc.accessors ?? []) {
    const copy = { ...acc }
    if ('bufferView' in copy) copy.bufferView += oldBv
    doc.accessors.push(copy)
  }

  doc.animations = anim.doc.animations.map((clip: GltfDoc) => {
    const { channels, samplers, ...rest } = clip
    return {
      ...rest,
      samplers: samplers.map((s: GltfDoc) => ({
        input: s.input + oldAcc,
        output: s.output + oldAcc,
        ...('interpolation' in s ? { interpolation: s.interpolation } : {}),
      })),
      channels: channels.map((ch: GltfDoc) => ({
        sampler: ch.sampler,
        target: { ...ch.target, node: nodeMap.get(ch.target.node) },
      })),
    }
  })
  const byteLength = base + animBin.length
  if (doc.buffers?.length) doc.buffers[0].byteLength = byteLength
  else doc.buffers = [{ byteLength }]

  const bin = new Uint8Array(byteLength)
  bin.set(model.bin)
  bin.set(animBin, base)
  return {
    glb: writeGlb(doc, bin),
    clips: doc.animations.map((a: GltfDoc) => a.name),
  }
}
