import { budgetTeamSchema } from '../../../../shared/schemas'

/** 集約中の予算に局・担当を足す（財務管理部）。いちばん後ろに並ぶ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const body = parseOr400(budgetTeamSchema.safeParse(await readBody(event)))
  const round = await openRound()
  if (!round) throw createError({ statusCode: 409, message: '確定していない集約がありません。' })
  const db = useDb()
  const teams = await db.query.budgetTeams.findMany({ where: (t, { eq }) => eq(t.roundId, round.id) })
  if (teams.some(t => t.bureau === body.bureau && t.team === body.team)) {
    throw createError({ statusCode: 409, message: 'その局・担当はもうあります。' })
  }
  // 同じ局があれば、その局のいちばん後ろに入れる
  const sameBureau = teams.filter(t => t.bureau === body.bureau)
  const after = sameBureau.length ? Math.max(...sameBureau.map(t => t.sortOrder)) : Math.max(0, ...teams.map(t => t.sortOrder))
  const next = teams.filter(t => t.sortOrder > after).map(t => t.sortOrder)
  const sortOrder = next.length ? (after + Math.min(...next)) / 2 : after + 1
  const [team] = await db.insert(schema.budgetTeams).values({ ...body, roundId: round.id, sortOrder }).returning()
  return team
})
