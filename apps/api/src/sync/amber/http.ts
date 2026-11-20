export type HttpOptions = {
  fetch: typeof fetch
  baseUrl: string
  concurrency: number
  timeoutMs: number
  retries: number
  retryDelayMs: number
}

export class UpstreamError extends Error {
  constructor(
    public url: string,
    public status: number | null,
    message: string,
  ) {
    super(message)
    this.name = 'UpstreamError'
  }
}

/** Tiny FIFO limiter: at most `max` tasks run at once. */
export function createLimiter(max: number) {
  let active = 0
  const queue: Array<() => void> = []
  const next = () => {
    active--
    queue.shift()?.()
  }
  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r))
    active++
    try {
      return await task()
    } finally {
      next()
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function createHttp(opts: HttpOptions) {
  const limit = createLimiter(Math.max(1, opts.concurrency))

  async function attempt(url: string): Promise<unknown | null> {
    const ctrl = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new UpstreamError(
          url,
          null,
          `timeout after ${opts.timeoutMs}ms: ${url}`,
        )
        ctrl.abort(err)
        reject(err)
      }, opts.timeoutMs)
    })
    try {
      const work = (async () => {
        const res = await opts.fetch(url, { signal: ctrl.signal })
        if (res.status === 404) return null
        if (!res.ok) {
          throw new UpstreamError(url, res.status, `HTTP ${res.status}: ${url}`)
        }
        return (await res.json()) as unknown
      })()
      work.catch(() => {}) // avoid unhandled rejection if timeout wins
      return await Promise.race([work, timeout])
    } finally {
      clearTimeout(timer)
    }
  }

  /** GET JSON; resolves null on 404. Retries network errors/timeouts/5xx only. */
  async function getJson(path: string): Promise<unknown | null> {
    const url = `${opts.baseUrl}/${path}`
    let lastErr: unknown
    for (let i = 0; i <= opts.retries; i++) {
      if (i > 0) await sleep(opts.retryDelayMs * 2 ** (i - 1))
      try {
        return await limit(() => attempt(url))
      } catch (e) {
        lastErr = e
        if (e instanceof UpstreamError && e.status !== null && e.status < 500) {
          throw e
        }
      }
    }
    throw lastErr
  }

  return { getJson }
}
