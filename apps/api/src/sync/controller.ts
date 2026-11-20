import type { SyncController } from './controller-types'
import { type RunSyncDeps, runSync } from './run-sync'

export function createSyncController(
  deps: Omit<RunSyncDeps, 'onStart'>,
): SyncController {
  return {
    trigger() {
      return new Promise((resolve, reject) => {
        let started = false
        runSync({
          ...deps,
          onStart: (runId) => {
            started = true
            resolve({ runId })
          },
        })
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
