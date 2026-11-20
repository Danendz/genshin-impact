export type SyncController = {
  trigger(opts?: { full?: boolean }): Promise<{ runId: number } | 'busy'>
}
