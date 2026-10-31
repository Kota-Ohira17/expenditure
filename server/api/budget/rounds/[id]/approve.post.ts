import { budgetApproveSchema } from '../../../../../shared/schemas'

/** 選んだ査定待ちの明細をまとめて承認する（財務管理部・査定中）。ids は画面に出した行の id */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const round = await openRoundOr404(Number(getRouterParam(event, 'id')))
  assertPhase(round, 'reviewing')
  const { ids } = parseOr400(budgetApproveSchema.safeParse(await readBody(event)))
  const { latest, statusOf } = await roundState(round)
  const wanted = new Set(ids)
  const numbers = [...latest.values()].filter(r => wanted.has(r.id) && statusOf(r.itemNumber) === 'submitted').map(r => r.itemNumber)
  return { count: await setStatuses(round, numbers, 'approve', user, 'まとめて承認') }
})
