import { and, eq, inArray } from 'drizzle-orm'
import { budgetApproveSchema } from '../../../../../shared/schemas'

/** 選んだ査定待ちの明細をまとめて承認する（財務管理部・査定中）。1件ずつ送るより速い */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  assertPhase(round, 'reviewing')
  const { ids } = parseOr400(budgetApproveSchema.safeParse(await readBody(event)))
  const updated = await useDb().update(schema.budgetItems)
    .set({ status: 'approved', reviewComment: '', updatedAt: new Date(), updatedBy: user.email })
    .where(and(eq(schema.budgetItems.roundId, id), eq(schema.budgetItems.status, 'submitted'), inArray(schema.budgetItems.id, ids)))
    .returning({ id: schema.budgetItems.id })
  return { count: updated.length }
})
