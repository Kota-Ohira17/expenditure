import { eq } from 'drizzle-orm'

/** 予算を確定する（財務管理部）。すべて承認済みのときだけ。確定すると予算明細が入れ替わる */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  assertPhase(round, 'reviewing')
  return confirmRound(round)
})
