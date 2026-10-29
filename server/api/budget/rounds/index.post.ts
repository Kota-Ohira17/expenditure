import { budgetRoundStartSchema } from '../../../../shared/schemas'

/** 予算の集約を始める（財務管理部）。最新の確定した予算を写す */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const { kind, term } = parseOr400(budgetRoundStartSchema.safeParse(await readBody(event)))
  return startRound(kind, term, user)
})
