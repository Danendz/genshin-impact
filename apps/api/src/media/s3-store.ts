import {
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import type { Env } from '../env'
import type { MediaStore } from './store'

export function createS3Store(
  env: Pick<
    Env,
    | 'R2_ENDPOINT'
    | 'R2_ACCESS_KEY_ID'
    | 'R2_SECRET_ACCESS_KEY'
    | 'R2_BUCKET'
    | 'MEDIA_PUBLIC_URL'
  >,
): MediaStore {
  const client = new S3Client({
    endpoint: env.R2_ENDPOINT,
    region: 'auto',
    forcePathStyle: true,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
  const base = env.MEDIA_PUBLIC_URL.replace(/\/+$/, '')
  return {
    async exists(key) {
      try {
        await client.send(
          new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
        )
        return true
      } catch (e) {
        const err = e as {
          name?: string
          $metadata?: { httpStatusCode?: number }
        }
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404)
          return false
        throw e
      }
    },
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({
          Bucket: env.R2_BUCKET,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      )
    },
    async list(prefix) {
      const keys: string[] = []
      let token: string | undefined
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: env.R2_BUCKET,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        )
        for (const o of page.Contents ?? []) if (o.Key) keys.push(o.Key)
        token = page.IsTruncated ? page.NextContinuationToken : undefined
      } while (token)
      return keys
    },
    async delete(key) {
      await client.send(
        new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: key }),
      )
    },
    publicUrl: (key) => `${base}/${key}`,
  }
}
