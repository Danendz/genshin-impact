// Decodes SKV containers into standard GLB files.
// Port of models/tools/skv_decode.py, itself a port of the source viewer.js `$e`.
import { inflateSync } from 'node:zlib'

export const SKV_MAGIC = Uint8Array.of(154, 126, 49, 197)
const HEADER_LEN = 24
const DIR_LEN = 48
const GLB_MAGIC = 0x46546c67
const JSON_CHUNK_TYPE = 0x4e4f534a
const BIN_CHUNK_TYPE = 0x004e4942
const MAX_GLB = 512 * 1024 * 1024
const MAX_RATIO = 1032
export const SKV_ROLES = ['model', 'anim', 'props', 'toon'] as const
export type SkvRole = (typeof SKV_ROLES)[number]

const KEY = Uint8Array.of(
  103,
  66,
  214,
  78,
  233,
  170,
  123,
  74,
  146,
  134,
  184,
  139,
  215,
  194,
  75,
  17,
)

export class SkvError extends Error {}

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0

/** viewer.js `C` */
export function mixC(t: number): number {
  let e = (t + 2654435769) >>> 0
  e = Math.imul(e ^ (e >>> 16), 2246822507) >>> 0
  e = Math.imul(e ^ (e >>> 13), 3266489909) >>> 0
  return (e ^ (e >>> 16)) >>> 0
}

const readU32 = (buf: Uint8Array, off: number) =>
  ((buf[off] as number) |
    ((buf[off + 1] as number) << 8) |
    ((buf[off + 2] as number) << 16) |
    ((buf[off + 3] as number) << 24)) >>>
  0

interface Params {
  key: Uint8Array
  dirMagic: number
  keystream: number
  shuffle: number
  skip: number
  ascending: boolean
}

function deriveParams(version: number, key: Uint8Array = KEY): Params {
  if (version === 1) {
    return {
      key,
      dirMagic: 827738963,
      keystream: 1,
      shuffle: 2,
      skip: 0,
      ascending: false,
    }
  }
  const r = mixC((version ^ 1447777024) >>> 0)
  const derived = new Uint8Array(16)
  const view = new DataView(derived.buffer)
  for (let s = 0; s < 4; s++) {
    view.setUint32(
      4 * s,
      mixC((readU32(key, 4 * s) ^ mixC((r + s) >>> 0)) >>> 0),
      true,
    )
  }
  return {
    key: derived,
    dirMagic: (5655379 | (((48 + version) & 255) << 24)) >>> 0,
    keystream: mixC((r ^ 1) >>> 0),
    shuffle: mixC((r ^ 2) >>> 0),
    skip: (r >>> 8) & 15,
    ascending: version % 2 === 0,
  }
}

/** viewer.js `pt`: xoshiro128**-style state seeded from the salt and key. */
export function prngInit(
  salt: Uint8Array,
  key: Uint8Array,
  seed: number,
): Uint32Array {
  let o = seed >>> 0
  for (let s = 0; s < 4; s++) {
    o = mixC((o ^ readU32(salt, 4 * s) ^ readU32(key, 4 * s)) >>> 0)
  }
  const n = new Uint32Array(4)
  for (let s = 0; s < 4; s++) {
    o = mixC(o)
    n[s] = o
  }
  if (
    ((n[0] as number) |
      (n[1] as number) |
      (n[2] as number) |
      (n[3] as number)) ===
    0
  )
    n[0] = 1
  return n
}

export function prngStep(n: Uint32Array): number {
  const n1 = n[1] as number
  const a = Math.imul(rotl(Math.imul(n1, 5) >>> 0, 7), 9) >>> 0
  const i = (n1 << 9) >>> 0
  n[2] = (n[2] as number) ^ (n[0] as number)
  n[3] = (n[3] as number) ^ n1
  n[1] = n1 ^ (n[2] as number)
  n[0] = (n[0] as number) ^ (n[3] as number)
  n[2] = (n[2] as number) ^ i
  n[3] = rotl(n[3] as number, 11)
  return a
}

/** viewer.js `Xt`: decodes everything from offset 24 onward, in place. */
function xorDecrypt(data: Uint8Array, salt: Uint8Array, params: Params): void {
  const n = prngInit(salt, params.key, params.keystream)
  for (let i = 0; i < params.skip; i++) prngStep(n)
  const fullWords = data.length >>> 2
  const tail = data.length & 3
  // Words are little-endian; when the buffer is 4-aligned XOR whole words.
  if (data.byteOffset % 4 === 0) {
    const words = new Uint32Array(data.buffer, data.byteOffset, fullWords)
    if (new Uint8Array(Uint32Array.of(1).buffer)[0] !== 1) {
      throw new SkvError('big-endian hosts are not supported')
    }
    for (let f = 0; f < fullWords; f++)
      words[f] = (words[f] as number) ^ prngStep(n)
  } else {
    for (let f = 0; f < fullWords; f++) {
      const b = prngStep(n)
      const base = f * 4
      data[base] = (data[base] as number) ^ (b & 255)
      data[base + 1] = (data[base + 1] as number) ^ ((b >>> 8) & 255)
      data[base + 2] = (data[base + 2] as number) ^ ((b >>> 16) & 255)
      data[base + 3] = (data[base + 3] as number) ^ ((b >>> 24) & 255)
    }
  }
  if (tail) {
    const b = prngStep(n)
    const base = fullWords * 4
    for (let u = 0; u < tail; u++) {
      data[base + u] = (data[base + u] as number) ^ ((b >>> (8 * u)) & 255)
    }
  }
}

/** viewer.js `jt`: Fisher-Yates permutation derived from the header salt. */
function blockPermutation(
  salt: Uint8Array,
  count: number,
  version: number,
): Uint32Array {
  const params = deriveParams(version)
  const n = prngInit(salt, params.key, params.shuffle)
  for (let i = 0; i < params.skip; i++) prngStep(n)
  const perm = new Uint32Array(count)
  for (let i = 0; i < count; i++) perm[i] = i
  const swap = (c: number, j: number) => {
    const t = perm[c] as number
    perm[c] = perm[j] as number
    perm[j] = t
  }
  if (params.ascending) {
    for (let c = 0; c < count - 1; c++) swap(c, c + (prngStep(n) % (count - c)))
  } else {
    for (let c = count - 1; c > 0; c--) swap(c, prngStep(n) % (c + 1))
  }
  return perm
}

/** viewer.js `Gt`, in place. */
function unshuffleBlocks(
  payload: Uint8Array,
  perm: Uint32Array,
  blockSize: number,
): void {
  const count = perm.length
  const seen = new Uint8Array(count)
  let s = new Uint8Array(blockSize)
  let a = new Uint8Array(blockSize)
  const block = (i: number) =>
    payload.subarray(i * blockSize, (i + 1) * blockSize)
  for (let c = 0; c < count; c++) {
    if (seen[c]) continue
    if (perm[c] === c) {
      seen[c] = 1
      continue
    }
    s.set(block(c))
    let l = c
    while (true) {
      seen[l] = 1
      const d = perm[l] as number
      if (d === c) {
        payload.set(s, d * blockSize)
        break
      }
      a.set(block(d))
      payload.set(s, d * blockSize)
      ;[s, a] = [a, s]
      l = d
    }
  }
}

export function adler32(data: Uint8Array): number {
  let a = 1
  let b = 0
  const NMAX = 5552
  for (let i = 0; i < data.length; ) {
    const end = Math.min(i + NMAX, data.length)
    for (; i < end; i++) {
      a += data[i] as number
      b += a
    }
    a %= 65521
    b %= 65521
  }
  return ((b << 16) | a) >>> 0
}

function decodeSection(
  stored: Uint8Array,
  expectedLen: number,
  compressed: boolean,
  name: string,
): Uint8Array {
  if (!compressed) {
    if (stored.length !== expectedLen) {
      throw new SkvError(
        `${name}: stored ${stored.length} of ${expectedLen} bytes`,
      )
    }
    return stored
  }
  // Layout: zlib stream (its trailer is the big-endian Adler-32 of the plain data).
  if (stored.length < 4)
    throw new SkvError(`${name}: compressed section too short`)
  let out: Uint8Array
  try {
    out = inflateSync(stored)
  } catch (err) {
    throw new SkvError(`${name}: inflate failed: ${(err as Error).message}`)
  }
  if (out.length !== expectedLen) {
    throw new SkvError(
      `${name}: inflates to ${out.length} of ${expectedLen} bytes`,
    )
  }
  return out
}

export function isSkv(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && SKV_MAGIC.every((b, i) => bytes[i] === b)
}

export interface SkvResult {
  role: SkvRole
  version: number
  glb: Uint8Array
}

/** Decode one SKV container into GLB bytes. */
export function decodeSkv(raw: Uint8Array): SkvResult {
  if (raw.length < HEADER_LEN + DIR_LEN || raw.length > MAX_GLB) {
    throw new SkvError(`size: ${raw.length} bytes`)
  }
  if (!isSkv(raw)) throw new SkvError('magic: not an SKV file')
  const version = raw[4] as number
  if (version !== 1 && version !== 2)
    throw new SkvError(`version: version ${version}`)
  if (raw[5] || raw[6] || raw[7])
    throw new SkvError('header: reserved bytes set')

  const params = deriveParams(version)
  const salt = raw.slice(8, HEADER_LEN)
  const decrypted = raw.slice(HEADER_LEN)
  xorDecrypt(decrypted, salt, params)
  const dir = decrypted.subarray(0, DIR_LEN)

  if (readU32(dir, 0) !== params.dirMagic) {
    throw new SkvError(`key: directory doesn't open with SKV${version}`)
  }
  const roleIndex = dir[4] as number
  const role = SKV_ROLES[roleIndex - 1]
  if (!role) throw new SkvError(`role: role ${roleIndex}`)

  const flags = dir[5] as number
  const blockShift = dir[6] as number
  const jsonLen = readU32(dir, 8)
  const jsonStored = readU32(dir, 12)
  const binLen = readU32(dir, 16)
  const binStored = readU32(dir, 20)
  const jsonChecksum = readU32(dir, 24)
  const binChecksum = readU32(dir, 28)
  const glbVersion = readU32(dir, 32)
  const payloadLen = raw.length - HEADER_LEN - DIR_LEN
  const jsonCompressed = (flags & 1) !== 0
  const binCompressed = (flags & 2) !== 0
  const glbLen = 20 + jsonLen + (binLen > 0 ? 8 + binLen : 0)

  if (flags & ~3) throw new SkvError(`directory: flags ${flags}`)
  if (blockShift < 10 || blockShift > 20) {
    throw new SkvError(`directory: block shift ${blockShift}`)
  }
  if (dir[7]) throw new SkvError('directory: reserved byte set')
  if (dir.subarray(36, DIR_LEN).some((b) => b !== 0)) {
    throw new SkvError('directory: reserved bytes set')
  }
  if (glbVersion !== 2)
    throw new SkvError(`directory: glb version ${glbVersion}`)
  if (jsonLen === 0 || jsonLen % 4)
    throw new SkvError(`directory: json length ${jsonLen}`)
  if (binLen % 4) throw new SkvError(`directory: bin length ${binLen}`)
  if (jsonStored + binStored !== payloadLen) {
    throw new SkvError(
      `directory: sections ${jsonStored} + ${binStored}, payload ${payloadLen}`,
    )
  }
  if ((binLen === 0) !== (binStored === 0)) {
    throw new SkvError('directory: bin lengths disagree')
  }
  const ratioCheck = (
    plain: number,
    stored: number,
    compressed: boolean,
    name: string,
  ) => {
    if (!compressed && stored !== plain) {
      throw new SkvError(`directory: ${name} stored ${stored} of ${plain}`)
    }
    if (compressed && plain > 0 && (stored < 6 || plain > stored * MAX_RATIO)) {
      throw new SkvError(`directory: ${name} zlib ${stored} for ${plain}`)
    }
  }
  ratioCheck(jsonLen, jsonStored, jsonCompressed, 'json')
  ratioCheck(binLen, binStored, binCompressed, 'bin')
  if (glbLen > MAX_GLB) throw new SkvError(`directory: glb of ${glbLen} bytes`)

  const payload = decrypted.subarray(DIR_LEN)
  const blockSize = 1 << blockShift
  const blockCount = Math.floor(payloadLen / blockSize)
  if (blockCount > 1) {
    unshuffleBlocks(
      payload,
      blockPermutation(salt, blockCount, version),
      blockSize,
    )
  }

  const json = decodeSection(
    payload.subarray(0, jsonStored),
    jsonLen,
    jsonCompressed,
    'json',
  )
  if (adler32(json) !== jsonChecksum) throw new SkvError('checksum: json chunk')
  let bin: Uint8Array | undefined
  if (binLen > 0) {
    bin = decodeSection(
      payload.subarray(jsonStored),
      binLen,
      binCompressed,
      'bin',
    )
    if (adler32(bin) !== binChecksum) throw new SkvError('checksum: bin chunk')
  }

  const glb = new Uint8Array(glbLen)
  const view = new DataView(glb.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, glbLen, true)
  view.setUint32(12, jsonLen, true)
  view.setUint32(16, JSON_CHUNK_TYPE, true)
  glb.set(json, 20)
  if (bin) {
    view.setUint32(20 + jsonLen, binLen, true)
    view.setUint32(24 + jsonLen, BIN_CHUNK_TYPE, true)
    glb.set(bin, 28 + jsonLen)
  }
  return { role, version, glb }
}
