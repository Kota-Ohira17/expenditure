import { eq } from 'drizzle-orm'

/** 査定開始（財務管理部）。集約終了のあとに押す。ここから査定（承認・要修正）ができ、要修正になった明細だけ担当が直せる */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  assertPhase(round, 'closed')
  await useDb().update(schema.budgetRounds).set({ status: 'reviewing' }).where(eq(schema.budgetRounds.id, id))
  return { ok: true }
})
