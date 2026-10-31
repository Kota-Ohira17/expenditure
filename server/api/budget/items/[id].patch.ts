import { budgetItemSchema } from '../../../../shared/schemas'

/** 明細を直す（その担当の人・財務管理部）。①⑦に行を足す。担当の人が直すと未提出に戻り、提出し直して査定を受ける */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { row, team, round, status } = await openItemOr404(String(getRouterParam(event, 'id')))
  await assertCanChangeItem(user, status, team, round)
  const body = parseOr400(budgetItemSchema.safeParse(await readBody(event)))
  return writeItem(round, row, body as ItemValues, user, status)
})
