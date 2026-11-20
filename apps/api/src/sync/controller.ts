import type { SyncController } from './controller-types'
import { type RunSyncDeps, runSync } from './run-sync'

export function createSyncController(
  deps: Omit<RunSyncDeps, 'onStart'>,
): SyncController {
  return {
    trigger() {
      return new Promise((resolve) => {
        runSync({ ...deps, onStart: (runId) => resolve({ runId }) })
          .then((r) => {
            if (r === 'busy') resolve('busy')
          })
          .catch((e) => {
            deps.log?.(`sync crashed: ${e instanceof Error ? e.message : e}`)
            resolve('busy')
          })
      })
    },
  }
}
