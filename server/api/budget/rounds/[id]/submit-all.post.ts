/** 集約中の未提出・要修正の明細を、すべての担当でまとめて提出する（財務管理部）。査定待ちになる */
export default defineEventHandler(async (event) => {
  const user = await requireArrangeBudget(event)
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'collecting')
  const items = await itemsWhere(round, s => s === 'draft' || s === 'returned')
  if (!items.length) throw createError({ statusCode: 400, message: '提出する明細がありません。' })
  return { count: await setStatuses(round, items, 'submit', user, 'すべて提出') }
})
