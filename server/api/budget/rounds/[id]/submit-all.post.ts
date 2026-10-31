/** 集約中の未提出・要修正の明細を、すべての担当でまとめて提出する（財務管理部）。査定待ちになる */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'collecting')
  const numbers = await numbersWhere(round, s => s === 'draft' || s === 'returned')
  if (!numbers.length) throw createError({ statusCode: 400, message: '提出する明細がありません。' })
  return { count: await setStatuses(round, numbers, 'submit', user, 'すべて提出') }
})
