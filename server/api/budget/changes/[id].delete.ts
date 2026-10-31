import { eq } from 'drizzle-orm'

/** 自分の申請を取り下げる（承認待ちのものだけ） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = String(getRouterParam(event, 'id'))
  const change = await useDb().query.budgetChangeRequests.findFirst({ where: eq(schema.budgetChangeRequests.id, id) })
  if (!change || change.createdBy !== user.email) throw createError({ statusCode: 404, message: '変更が見つかりません。' })
  if (change.status !== 'pending') throw createError({ statusCode: 409, message: '承認待ちの申請だけ取り下げられます。' })
  await useDb().update(schema.budgetChangeRequests).set({ status: 'withdrawn', reviewedAt: new Date() }).where(eq(schema.budgetChangeRequests.id, id))
  return { ok: true }
})
