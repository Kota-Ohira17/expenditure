import { eq } from 'drizzle-orm'

/** 自分の予算前執行の申請を取り下げる（承認待ちのものだけ） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id'))
  const p = await useDb().query.preExecutionRequests.findFirst({ where: eq(schema.preExecutionRequests.id, id) })
  if (!p || p.createdBy !== user.email) throw createError({ statusCode: 404, message: '予算前執行の申請が見つかりません。' })
  if (p.status !== 'pending') throw createError({ statusCode: 409, message: '承認待ちの申請だけ取り下げられます。' })
  await useDb().update(schema.preExecutionRequests).set({ status: 'withdrawn', reviewedAt: new Date() }).where(eq(schema.preExecutionRequests.id, id))
  return { ok: true }
})
