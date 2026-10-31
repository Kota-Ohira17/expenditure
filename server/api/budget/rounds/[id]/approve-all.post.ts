/** 承認していない明細をすべて承認済みにする（財務管理部・査定中）。未提出・要修正・査定待ちのものもまとめて承認し、確定できるようにする */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'reviewing')
  const numbers = await numbersWhere(round, s => s !== 'approved')
  return { count: await setStatuses(round, numbers, 'approve', user, 'すべて承認') }
})
