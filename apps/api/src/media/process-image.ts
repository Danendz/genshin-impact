import { createHash } from 'node:crypto'
import sharp from 'sharp'

export async function processImage(
  input: Uint8Array,
  quality = 85,
): Promise<{
  body: Uint8Array
  width: number
  height: number
  contentHash: string
}> {
  const { data, info } = await sharp(input)
    .webp({ quality })
    .toBuffer({ resolveWithObject: true })
  const body = new Uint8Array(data)
  return {
    body,
    width: info.width,
    height: info.height,
    contentHash: createHash('sha256').update(body).digest('hex'),
  }
}

export function mediaKey(
  ownerType: string,
  ownerId: string,
  kind: string,
  contentHash: string,
): string {
  return `${ownerType}/${ownerId}/${kind}-${contentHash.slice(0, 12)}.webp`
}
