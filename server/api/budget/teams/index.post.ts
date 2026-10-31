import { and, eq } from 'drizzle-orm'
import { budgetTeamCreateSchema } from '../../../../shared/schemas'

/** 集約中の予算の局の中に担当を足す（財務管理部）。その局のいちばん後ろに並ぶ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const body = parseOr400(budgetTeamCreateSchema.safeParse(await readBody(event)))
  const round = await openRound()
  if (!round) throw createError({ statusCode: 409, message: '確定していない集約がありません。' })
  const db = useDb()
  const bureau = await db.query.budgetBureaus.findFirst({ where: and(eq(schema.budgetBureaus.id, body.bureauId), eq(schema.budgetBureaus.roundId, round.id)) })
  if (!bureau) throw createError({ statusCode: 404, message: '局が見つかりません。' })
  const teams = await db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.bureauId, bureau.id))
  if (teams.some(t => t.team === body.team)) throw createError({ statusCode: 409, message: 'その局に、同じ名前の担当がもうあります。' })
  const [team] = await db.insert(schema.budgetTeams).values({
    roundId: round.id, bureauId: bureau.id, bureauNo: bureau.bureauNo, bureau: bureau.name, team: body.team,
    sortOrder: Math.max(-1, ...teams.map(t => t.sortOrder)) + 1,
  }).returning()
  return team
})
