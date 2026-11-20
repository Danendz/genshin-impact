export type SyncController = {
  trigger(opts?: { full?: boolean }): Promise<{ runId: number } | 'busy'>
  /** Resolves once no sync started by this controller is still running. */
  idle?(): Promise<void>
}
