import type { SyncController } from './controller-types'
import { type RunSyncDeps, runSync } from './run-sync'

export function createSyncController(
  deps: Omit<RunSyncDeps, 'onStart'>,
): SyncController {
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
            ...deps,
            onStart: (runId) => {
              started = true
              resolve({ runId })
            },
          },
          { full: opts.full },
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
