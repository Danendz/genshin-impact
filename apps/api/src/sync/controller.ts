import type { SyncController } from './controller-types'
import { type RunSyncDeps, runSync } from './run-sync'
import type { GameDataSource } from './source'

export function createSyncController(
  deps: Omit<RunSyncDeps, 'onStart' | 'source'> & {
    /** Called per run: a source caches upstream lists, so one per process would go stale. */
    createSource: () => GameDataSource
  },
): SyncController {
  const { createSource, ...runDeps } = deps
  const inflight = new Set<Promise<unknown>>()
  return {
    async idle() {
      while (inflight.size > 0) await Promise.allSettled([...inflight])
    },
    trigger(opts = {}) {
      return new Promise((resolve, reject) => {
        let started = false
        const run = runSync(
          {
            ...runDeps,
            source: createSource(),
            onStart: (runId) => {
              started = true
              resolve({ runId })
            },
          },
          { full: opts.full, details: opts.details },
        )
        inflight.add(run)
        run
          .finally(() => inflight.delete(run))
          .then((r) => {
            if (r === 'busy') resolve('busy')
          })
          .catch((e) => {
            // before the run row exists: a real error (e.g. DB down), not busy
            if (!started) reject(e)
            else
              deps.log?.(`sync crashed: ${e instanceof Error ? e.message : e}`)
          })
      })
    },
  }
}
