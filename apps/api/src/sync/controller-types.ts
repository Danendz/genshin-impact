export type SyncController = {
  trigger(): Promise<{ runId: number } | 'busy'>
}
