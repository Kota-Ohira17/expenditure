import { eq } from 'drizzle-orm'

/** 集約をやめる（財務管理部）。集約中の明細はすべて消える。確定した予算は変わらない */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (round?.status !== 'collecting') throw createError({ statusCode: 404, message: '集約中の予算が見つかりません。' })
  await cancelRound(round)
  return { ok: true }
})
