import { and, eq, inArray } from 'drizzle-orm'

/** 集約中の未提出・要修正の明細を、すべての担当でまとめて提出する（財務管理部）。査定待ちになる */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  assertPhase(round, 'collecting')
  const updated = await useDb().update(schema.budgetItems)
    .set({ status: 'submitted', updatedAt: new Date(), updatedBy: user.email })
    .where(and(eq(schema.budgetItems.roundId, id), inArray(schema.budgetItems.status, ['draft', 'returned'])))
    .returning({ id: schema.budgetItems.id })
  if (!updated.length) throw createError({ statusCode: 400, message: '提出する明細がありません。' })
  return { count: updated.length }
})
