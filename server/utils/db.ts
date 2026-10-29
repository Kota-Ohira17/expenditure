import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema'

let db: ReturnType<typeof createDb> | undefined

/**
 * DB の場所と鍵。NUXT_DATABASE_URL / _AUTH_TOKEN がなければ、Vercel で Turso を追加したときに入る
 * TURSO_DATABASE_URL / TURSO_AUTH_TOKEN を使う（どちらもなければローカルの file:）。
 */
export function databaseConfig() {
  const { databaseUrl, databaseAuthToken } = useRuntimeConfig()
  const fromTurso = databaseUrl.startsWith('file:') && process.env.TURSO_DATABASE_URL
  return fromTurso
    ? { url: process.env.TURSO_DATABASE_URL!, authToken: process.env.TURSO_AUTH_TOKEN || undefined }
    : { url: databaseUrl, authToken: databaseAuthToken || undefined }
}

function createDb() {
  return drizzle(createClient(databaseConfig()), { schema })
}

export function useDb() {
  db ??= createDb()
  return db
}

export { schema }
