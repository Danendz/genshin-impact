// Minimal GLB container helpers (port of models/tools/glb.py).

const GLB_MAGIC = 0x46546c67
const JSON_CHUNK_TYPE = 0x4e4f534a
const BIN_CHUNK_TYPE = 0x004e4942

// biome-ignore lint/suspicious/noExplicitAny: glTF JSON is walked loosely, like the Python tools did.
export type GltfDoc = Record<string, any>

export interface Glb {
  doc: GltfDoc
  bin: Uint8Array
}

export function parseGlb(data: Uint8Array, name = 'GLB'): Glb {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  if (
    data.length < 12 ||
    view.getUint32(0, true) !== GLB_MAGIC ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== data.length
  ) {
    throw new Error(`${name}: not a valid GLB`)
  }
  let offset = 12
  let doc: GltfDoc | undefined
  let bin: Uint8Array = new Uint8Array(0)
  while (offset < data.length) {
    const len = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const chunk = data.subarray(offset + 8, offset + 8 + len)
    offset += 8 + len
    if (type === JSON_CHUNK_TYPE)
      doc = JSON.parse(new TextDecoder().decode(chunk))
    else if (type === BIN_CHUNK_TYPE) bin = chunk
  }
  if (!doc) throw new Error(`${name}: missing JSON chunk`)
  return { doc, bin }
}

const pad4 = (n: number) => (4 - (n % 4)) % 4

export function writeGlb(doc: GltfDoc, bin: Uint8Array): Uint8Array {
  const raw = new TextEncoder().encode(JSON.stringify(doc))
  const jsonLen = raw.length + pad4(raw.length)
  const binLen = bin.length + pad4(bin.length)
  const total = 20 + jsonLen + (binLen ? 8 + binLen : 0)
  const out = new Uint8Array(total)
  const view = new DataView(out.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonLen, true)
  view.setUint32(16, JSON_CHUNK_TYPE, true)
  out.set(raw, 20)
  out.fill(0x20, 20 + raw.length, 20 + jsonLen)
  if (binLen) {
    view.setUint32(20 + jsonLen, binLen, true)
    view.setUint32(24 + jsonLen, BIN_CHUNK_TYPE, true)
    out.set(bin, 28 + jsonLen)
  }
  return out
}

export function imageBytes(glb: Glb, image: GltfDoc): Uint8Array {
  if (image.bufferView === undefined) {
    throw new Error(`image ${image.name} has no embedded bufferView`)
  }
  const bv = glb.doc.bufferViews[image.bufferView]
  const start = bv.byteOffset ?? 0
  return glb.bin.subarray(start, start + bv.byteLength)
}
