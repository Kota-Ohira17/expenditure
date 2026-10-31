import { budgetRoundStartSchema } from '../../../../shared/schemas'

/** 予算の集約を始める（財務管理部）。期は第100期で固定 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const { kind } = parseOr400(budgetRoundStartSchema.safeParse(await readBody(event)))
  return startRound(kind, user)
})
