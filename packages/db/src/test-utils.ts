import { getTableName, is, sql } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import postgres from 'postgres'
import type { Db } from './client'
import { runMigrations } from './migrate'
import * as schema from './schema'

export const DEFAULT_TEST_DATABASE_URL =
  'postgres://gi:gi@localhost:54329/gi_test'

/** Creates (if missing) `<TEST_DATABASE_URL db>_<suffix>`, migrates it, returns its URL. */
export async function setupTestDatabase(suffix: string): Promise<string> {
  const base = new URL(
    process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL,
  )
  const name = `${base.pathname.slice(1)}_${suffix}`
  const admin = new URL(base)
  admin.pathname = '/postgres'
  const adminSql = postgres(admin.href, { onnotice: () => {}, max: 1 })
  try {
    const exists =
      await adminSql`select 1 from pg_database where datname = ${name}`
    if (exists.length === 0) {
      await adminSql.unsafe(`create database "${name}"`)
    }
  } finally {
    await adminSql.end()
  }
  const target = new URL(base)
  target.pathname = `/${name}`
  await runMigrations(target.href)
  return target.href
}

export async function resetDb(db: Db): Promise<void> {
  const tables = Object.values(schema)
    .filter((v) => is(v, PgTable))
    .map((t) => `"${getTableName(t as PgTable)}"`)
  await db.execute(
    sql.raw(`truncate table ${tables.join(', ')} restart identity cascade`),
  )
}
