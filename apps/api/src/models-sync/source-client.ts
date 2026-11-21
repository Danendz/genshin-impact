// Models source API client (port of models/fetch_characters.py's API layer).
const GAME = 'genshin-impact'
const HASH_RE = /^[0-9a-f]{32}$/
const VIEWER_KEYS = ['model', 'anim', 'props', 'toon'] as const
const SKV_MAGIC = [154, 126, 49, 197]

export class FetchError extends Error {}
export class AuthError extends FetchError {}

export interface SourceCharacter {
  id: string
  slug: string
  name: string
  hasModel?: boolean
  facets?: { facet: string; name: string }[]
}

export interface SourceAsset {
  id: string
  publicId?: string
  name?: string
  role?: string
  extension?: string
  hidden?: boolean
  metadata?: { model?: { viewer?: unknown } }
  game?: { name?: string }
  category?: { name?: string }
}

export interface SourceWeapons {
  defaultSetId?: string
  weapons?: { setId?: string; name?: string; model?: { viewer?: unknown } }[]
}

export interface SourceClientOptions {
  /** site origin (`MODELS_SOURCE_URL`); the API and packs live on its subdomains */
  baseUrl: string
  fetch?: typeof fetch
  cookie?: string
  /** pause after each API call, ms (the source rate-limits) */
  throttleMs?: number
  sleep?: (ms: number) => Promise<void>
}

const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
}

/** Python's str.title(), enough for the source's ASCII labels. */
export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|[^a-z])([a-z])/g, (_, p, c: string) => p + c.toUpperCase())

/** Make a display name safe for a folder and a viewer model name. */
export function cleanLabel(value: string): string {
  return value
    .replace(/\(([^)]*)\)/g, (_, inner: string) => ` ${titleCase(inner)} `)
    .replace(/[,]/g, ' ')
    .replace(/[^A-Za-z0-9 _.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[ .-]+|[ .-]+$/g, '')
}

/** `Citlali · Outfit 3D model` -> `Outfit`; boss/skill names stay descriptive. */
export function extraLabel(
  characterName: string,
  asset: SourceAsset,
  used: Set<string>,
): string {
  let raw = (asset.name ?? '').trim()
  const prefix = `${characterName} · `
  if (raw.startsWith(prefix)) raw = raw.slice(prefix.length)
  raw = raw.replace(/\s*3D model\s*$/i, '').trim()
  const role = asset.role ?? ''
  const roleTail = () =>
    titleCase((role.split('.').at(-1) ?? '').replaceAll('-', ' '))
  if (!raw || raw.toLowerCase() === '3d model') raw = roleTail()
  let label = cleanLabel(raw) || 'Extra'
  if (used.has(label)) {
    label = `${label} ${cleanLabel(roleTail())}`.trim()
    const base = label
    for (let n = 2; used.has(label); n++) label = `${base} ${n}`
  }
  used.add(label)
  return label
}

export function viewerHashes(viewer: unknown): string[] {
  if (!viewer || typeof viewer !== 'object') return []
  const v = viewer as Record<string, unknown>
  if (v.format !== 1) return []
  return VIEWER_KEYS.map((k) => v[k]).filter(
    (h): h is string => typeof h === 'string' && HASH_RE.test(h),
  )
}

export interface ContainerSets {
  main: string[]
  /** outfit/boss/skill label -> its container hashes */
  extras: Record<string, string[]>
  problems: string[]
}

/** Split one character's containers into the main set (+ default weapon) and extras. */
export function collectHashes(
  characterName: string,
  files: SourceAsset[],
  weapons: SourceWeapons | undefined,
): ContainerSets {
  const main: string[] = []
  const extras: Record<string, string[]> = {}
  const problems: string[] = []
  const used = new Set<string>()
  const add = (list: string[], h: string) => {
    if (!list.includes(h)) list.push(h)
  }
  for (const asset of files) {
    if (asset.extension !== 'glb') continue
    const role = asset.role ?? ''
    let target: string[]
    if (role === 'model') target = main
    else if (role.startsWith('model.')) {
      const label = extraLabel(characterName, asset, used)
      extras[label] ??= []
      target = extras[label]
    } else continue
    const found = viewerHashes(asset.metadata?.model?.viewer)
    if (!found.length) {
      problems.push(`${asset.publicId ?? asset.id} has no viewer hashes`)
      continue
    }
    for (const h of found) add(target, h)
  }
  if (weapons) {
    const chosen = weapons.weapons?.find(
      (w) => w.setId === weapons.defaultSetId,
    )
    const value = chosen?.model?.viewer
    if (!chosen) problems.push('no default weapon')
    else if (typeof value === 'string' && HASH_RE.test(value)) add(main, value)
    else problems.push(`weapon ${chosen.name} has no viewer hash`)
  }
  return { main, extras, problems }
}

export const elementOf = (c: SourceCharacter) =>
  c.facets?.find((f) => f.facet === 'element')?.name ?? null

export function createSourceClient(opts: SourceClientOptions) {
  const site = new URL(opts.baseUrl)
  const API = `${site.protocol}//den.${site.host}`
  const PACK = `${site.protocol}//pack.${site.host}`
  const fetchFn = opts.fetch ?? fetch
  const throttle = opts.throttleMs ?? 400
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)))
  // Signed container links are bound to the visit cookie the API
  // sets, so keep cookies like a browser session (requests.Session did).
  const jar = new Map<string, string>()
  for (const part of opts.cookie?.split(';') ?? []) {
    const [name, ...value] = part.trim().split('=')
    if (name) jar.set(name, value.join('='))
  }
  const headers = () => {
    const h: Record<string, string> = {
      ...HEADERS,
      Origin: site.origin,
      Referer: `${site.origin}/`,
    }
    if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    return h
  }
  const remember = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(';')
      const [name, ...value] = (pair ?? '').trim().split('=')
      if (name) jar.set(name, value.join('='))
    }
  }

  /** GET (or POST `body`) with retry/backoff for the source's rate limiter (429). */
  async function request(
    url: string,
    init: { body?: unknown; attempts?: number } = {},
  ) {
    let delay = 1000
    let res: Response | undefined
    for (let i = 0; i < (init.attempts ?? 6); i++) {
      res = await fetchFn(url, {
        method: init.body === undefined ? 'GET' : 'POST',
        headers:
          init.body === undefined
            ? headers()
            : { ...headers(), 'Content-Type': 'application/json' },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(300_000),
      })
      remember(res)
      if (res.status !== 429) return res
      const retryAfter = Number(res.headers.get('Retry-After'))
      const wait =
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : delay
      await sleep(Math.min(Math.max(wait, 1000), 60_000))
      delay = Math.min(delay * 2, 30_000)
    }
    return res as Response
  }

  async function trpc<T>(path: string, payload: unknown): Promise<T> {
    const url = `${API}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(payload))}`
    const res = await request(url)
    await sleep(throttle)
    if (!res.ok) throw new FetchError(`${path}: HTTP ${res.status}`)
    const body = (await res.json()) as {
      result?: { data: T }
      error?: { message?: string }
    }
    if (body.error)
      throw new FetchError(`${path}: ${body.error.message ?? 'request failed'}`)
    return (body.result as { data: T }).data
  }

  async function links(hashes: string[]): Promise<Record<string, string>> {
    const res = await request(`${API}/viewer/links?n=${hashes.join(',')}`)
    await sleep(throttle)
    if (!res.ok) throw new FetchError(`viewer/links: HTTP ${res.status}`)
    const found =
      ((await res.json()) as { links?: Record<string, string> }).links ?? {}
    const missing = hashes.filter((h) => !(h in found))
    if (missing.length)
      throw new FetchError(`no signed link for ${missing.join(', ')}`)
    return found
  }

  return {
    hasCookie: Boolean(opts.cookie),

    characters: () =>
      trpc<{ characters: SourceCharacter[] }>('asset.gameCharacters', {
        slug: GAME,
      }).then((d) => d.characters),

    character: (slug: string) =>
      trpc<{ files: SourceAsset[] }>('asset.getCharacter', {
        gameSlug: GAME,
        character: slug,
      }),

    weapons: (characterId: string) =>
      trpc<SourceWeapons>('asset.characterWeapons', { setId: characterId }),

    /** Download SKV containers, refreshing expired signatures once. */
    async containers(hashes: string[]): Promise<Map<string, Uint8Array>> {
      const out = new Map<string, Uint8Array>()
      let remaining = hashes
      for (let attempt = 0; attempt < 2 && remaining.length; attempt++) {
        if (attempt) await sleep(500)
        const signed = await links(remaining)
        const retry: string[] = []
        for (const h of remaining) {
          const res = await request(`${PACK}/v/${h}?${signed[h]}`, {
            attempts: 3,
          })
          if (res.status === 403) {
            retry.push(h)
            continue
          }
          if (!res.ok)
            throw new FetchError(`container ${h}: HTTP ${res.status}`)
          const bytes = new Uint8Array(await res.arrayBuffer())
          if (bytes.length < 8 || SKV_MAGIC.some((b, i) => bytes[i] !== b)) {
            throw new FetchError(
              `${h}: unexpected response (not an SKV container)`,
            )
          }
          out.set(h, bytes)
        }
        remaining = retry
      }
      if (remaining.length) {
        throw new FetchError(
          `signature kept expiring for ${remaining.join(', ')}`,
        )
      }
      return out
    },

    /** Signed full-size URLs; needs a signed-in session cookie. */
    async originalUrls(
      characterName: string,
      assets: SourceAsset[],
    ): Promise<Map<string, string>> {
      const res = await request(`${API}/trpc/downloads.generate`, {
        body: {
          picks: { anim: false, props: false, parts: false, weapon: false },
          assets: assets.map((a) => ({
            id: a.id,
            name: a.name || characterName,
            extension: a.extension,
            gameName: a.game?.name || 'Genshin Impact',
            categoryName: a.category?.name || '',
          })),
        },
      })
      await sleep(throttle)
      if (res.status === 401) {
        throw new AuthError(
          'MODELS_COOKIE was rejected; sign in on the source site and copy it again',
        )
      }
      if (!res.ok)
        throw new FetchError(`downloads.generate: HTTP ${res.status}`)
      const body = (await res.json()) as {
        result?: {
          data: {
            files?: { id: string; url: string }[]
            urls?: { id: string; url: string }[]
          }
        }
        error?: { message?: string }
      }
      if (body.error || !body.result) {
        throw new FetchError(
          `downloads.generate: ${body.error?.message ?? 'request failed'}`,
        )
      }
      const items = body.result.data.files ?? body.result.data.urls ?? []
      return new Map(items.map((i) => [i.id, i.url]))
    },

    previewUrl: (assetId: string) => `${PACK}/asset/${assetId}-preview.webp`,

    async download(url: string): Promise<Uint8Array> {
      const res = await request(url, { attempts: 3 })
      if (!res.ok) throw new FetchError(`${url}: HTTP ${res.status}`)
      return new Uint8Array(await res.arrayBuffer())
    },
  }
}

export type SourceClient = ReturnType<typeof createSourceClient>
