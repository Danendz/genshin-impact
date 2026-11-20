import { z } from 'zod'

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  R2_ENDPOINT: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  MEDIA_PUBLIC_URL: z.string().min(1),
  ADMIN_TOKEN: z.string().min(1),
  CORS_ORIGIN: z.string().min(1),
  PORT: z.coerce.number().int().positive(),
})

export type Env = z.infer<typeof schema>

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    )
    throw new Error(`Invalid environment:\n${lines.join('\n')}`)
  }
  return result.data
}
