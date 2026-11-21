import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { describe, expect, it } from 'vitest'
import { createS3Store } from './s3-store'

const env = {
  R2_ENDPOINT: process.env.R2_ENDPOINT ?? 'http://localhost:9000',
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID ?? 'gi-local',
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY ?? 'gi-local-secret',
  R2_BUCKET: process.env.R2_BUCKET ?? 'gi-media',
  MEDIA_PUBLIC_URL:
    process.env.MEDIA_PUBLIC_URL ?? 'http://localhost:9000/gi-media',
}

describe.skipIf(process.env.S3_INTEGRATION !== '1')('s3 store', () => {
  it('put then exists', async () => {
    const client = new S3Client({
      endpoint: env.R2_ENDPOINT,
      region: 'auto',
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    })
    try {
      await client.send(new CreateBucketCommand({ Bucket: env.R2_BUCKET }))
    } catch (e) {
      const name = (e as { name?: string }).name
      if (name !== 'BucketAlreadyOwnedByYou' && name !== 'BucketAlreadyExists')
        throw e
    }
    const store = createS3Store(env)
    const key = `test/${Date.now()}.webp`
    expect(await store.exists(key)).toBe(false)
    await store.put(key, new Uint8Array([1, 2, 3]), 'image/webp')
    expect(await store.exists(key)).toBe(true)
    expect(store.publicUrl(key)).toBe(`${env.MEDIA_PUBLIC_URL}/${key}`)
  })
})
