import { and, eq, inArray } from 'drizzle-orm'

/**
 * 集約終了（財務管理部）。担当の入力を締め切る。まだ提出していない明細（未提出・要修正）は、ここで自動で提出する（査定待ち）。
 * このあと「査定開始」で査定できるようになる。
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const round = await db.query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  assertPhase(round, 'collecting')
  const submitted = await db.update(schema.budgetItems)
    .set({ status: 'submitted', updatedAt: new Date(), updatedBy: user.email })
    .where(and(eq(schema.budgetItems.roundId, id), inArray(schema.budgetItems.status, ['draft', 'returned'])))
    .returning({ id: schema.budgetItems.id })
  await db.update(schema.budgetRounds).set({ status: 'closed' }).where(eq(schema.budgetRounds.id, id))
  return { submitted: submitted.length }
})
