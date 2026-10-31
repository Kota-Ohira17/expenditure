import { budgetItemSchema } from '../../../../../shared/schemas'

/** 担当に明細を足す（その担当の人・財務管理部）。項目番号を自動で付け、同じ款のいちばん後ろ（新しい款なら担当のいちばん後ろ）に入る */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team, round } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は入力できません。' })
  assertCanAddItem(user, round)
  const body = parseOr400(budgetItemSchema.safeParse(await readBody(event)))
  const [{ latest }, used] = await Promise.all([roundState(round), usedNumbers(round)])
  const itemNumber = nextItemNumber(used, team, body.kan)
  return writeItem(round, null, {
    ...(body as ItemValues), itemNumber, bureau: team.bureau, team: team.team, sortOrder: sortOrderFor([...latest.values()], team, body.kan),
  }, user, 'draft')
})
