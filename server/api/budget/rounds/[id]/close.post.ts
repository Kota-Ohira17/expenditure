import { eq } from 'drizzle-orm'

/**
 * 集約終了（財務管理部）。担当の入力を締め切る。まだ提出していない明細（未提出・要修正）は、ここで自動で提出する（査定待ち）。
 * このあと「査定開始」で査定できるようになる。
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'collecting')
  const numbers = await numbersWhere(round, s => s === 'draft' || s === 'returned')
  const submitted = await setStatuses(round, numbers, 'submit', user, '集約終了')
  await useDb().update(schema.budgetRounds).set({ status: 'closed' }).where(eq(schema.budgetRounds.id, round.id))
  return { submitted }
})
