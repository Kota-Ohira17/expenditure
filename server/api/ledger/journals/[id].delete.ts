import { eq } from 'drizzle-orm'

/** 手で入れた仕訳を取り消す（財務局長・管理者） */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'manageCashbook')
  const id = Number(getRouterParam(event, 'id'))
  const [deleted] = await useDb().delete(schema.manualJournals).where(eq(schema.manualJournals.id, id)).returning()
  if (!deleted) throw createError({ statusCode: 404, message: '仕訳が見つかりません。' })
  return { ok: true }
})
