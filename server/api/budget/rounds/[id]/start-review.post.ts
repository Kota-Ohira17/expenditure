import { eq } from 'drizzle-orm'

/** 査定開始（財務管理部）。集約終了のあとに押す。ここから査定（承認・要修正）ができ、要修正になった明細だけ担当が直せる */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'closed')
  await useDb().update(schema.budgetRounds).set({ status: 'reviewing' }).where(eq(schema.budgetRounds.id, round.id))
  return { ok: true }
})
