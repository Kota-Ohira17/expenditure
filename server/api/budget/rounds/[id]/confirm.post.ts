/** 予算を確定する（予算提出・承認。財務管理部）。すべて承認済みのときだけ。確定すると執行依頼で選ぶ予算が入れ替わる */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'reviewing')
  return confirmRound(round, user)
})
