import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { SyncController } from '../sync/controller-types'

const sha = (s: string) => createHash('sha256').update(s).digest()

function tokenMatches(header: string | undefined, token: string): boolean {
  const m = /^Bearer (.+)$/.exec(header ?? '')
  if (!m?.[1]) return false
  return timingSafeEqual(sha(m[1]), sha(token))
}

export function adminRoute(deps: { adminToken: string; sync: SyncController }) {
  return new Hono().post('/sync', async (c) => {
    if (!tokenMatches(c.req.header('authorization'), deps.adminToken))
      return c.json({ error: 'unauthorized' }, 401)
    let result: Awaited<ReturnType<SyncController['trigger']>>
    try {
      result = await deps.sync.trigger({
        full: c.req.query('full') === '1',
        details: c.req.query('details') === '1',
      })
    } catch (e) {
      console.error('[admin] POST /sync failed to start:', e)
      return c.json({ error: 'sync_failed_to_start' }, 500)
    }
    if (result === 'busy') return c.json({ error: 'sync_running' }, 409)
    return c.json({ runId: result.runId }, 202)
  })
}
