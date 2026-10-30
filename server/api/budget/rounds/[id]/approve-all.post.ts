import { and, eq, ne } from 'drizzle-orm'

/** 集約中の明細をすべて承認済みにする（財務管理部）。未提出・要修正・査定待ちのものもまとめて承認し、確定できるようにする */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (round?.status !== 'collecting') throw createError({ statusCode: 404, message: '集約中の予算が見つかりません。' })
  const updated = await useDb().update(schema.budgetItems)
    .set({ status: 'approved', updatedAt: new Date(), updatedBy: user.email })
    .where(and(eq(schema.budgetItems.roundId, id), ne(schema.budgetItems.status, 'approved')))
    .returning({ id: schema.budgetItems.id })
  return { count: updated.length }
})
