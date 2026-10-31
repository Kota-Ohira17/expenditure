/** 集約を中止する（財務管理部）。その集約で書いた明細はすべて消える。確定した予算は変わらない */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  await cancelRound(round)
  return { ok: true }
})
