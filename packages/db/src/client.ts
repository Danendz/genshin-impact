import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

export function createDb(url: string) {
  const sql = postgres(url, { onnotice: () => {} })
  const db = drizzle(sql, { schema, casing: 'snake_case' })
  return { db, sql, close: () => sql.end() }
}

export type Db = ReturnType<typeof createDb>['db']
