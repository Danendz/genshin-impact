import { z } from 'zod'

const trimSlash = (s: string) => s.replace(/\/+$/, '')
const httpUrl = z.url({ protocol: /^https?$/ })

const schema = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  R2_ENDPOINT: httpUrl,
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  MEDIA_PUBLIC_URL: httpUrl.transform(trimSlash),
  ADMIN_TOKEN: z.string().min(32, 'must be at least 32 characters'),
  /** comma-separated list of allowed origins (e.g. prod + Vercel previews) */
  CORS_ORIGIN: z
    .string()
    .transform((v) =>
      v
        .split(',')
        .map((o) => trimSlash(o.trim()))
        .filter(Boolean),
    )
    .pipe(z.array(httpUrl).min(1)),
  PORT: z.coerce.number().int().positive(),
})

export type Env = z.infer<typeof schema>

const cliSchema = schema.pick({
  DATABASE_URL: true,
  R2_ENDPOINT: true,
  R2_ACCESS_KEY_ID: true,
  R2_SECRET_ACCESS_KEY: true,
  R2_BUCKET: true,
  MEDIA_PUBLIC_URL: true,
})
export type CliEnv = z.infer<typeof cliSchema>

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

/** Narrower env for the sync CLI: no ADMIN_TOKEN/CORS_ORIGIN/PORT needed. */
export function parseCliEnv(
  source: Record<string, string | undefined>,
): CliEnv {
  const result = cliSchema.safeParse(source)
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    )
    throw new Error(`Invalid environment:\n${lines.join('\n')}`)
  }
  return result.data
}
