import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'turso',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  // Vercel で Turso を追加したときの TURSO_DATABASE_URL / TURSO_AUTH_TOKEN でもよい（server/utils/db.ts と同じ）
  dbCredentials: {
    url: process.env.NUXT_DATABASE_URL || process.env.TURSO_DATABASE_URL || 'file:.data/app.db',
    authToken: process.env.NUXT_DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || undefined,
  },
})
