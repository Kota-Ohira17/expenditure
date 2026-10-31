import { budgetReplySchema } from '../../../../../shared/schemas'

/** 要修正への返事（その担当の人・財務管理部）。⑤に残す（査定の状態は変えない） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { row, team, round, status } = await openItemOr404(String(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細には返事できません。' })
  const { comment } = parseOr400(budgetReplySchema.safeParse(await readBody(event)))
  await useDb().insert(schema.budgetReviews).values(reviewRow(round.id, row.itemNumber, 'reply', status, user, { comment, rowId: row.id }))
  return { ok: true }
})
