import { and, eq } from 'drizzle-orm'
import { budgetTeamCreateSchema } from '../../../../shared/schemas'

/** 集約中の予算の局の中（部に入れるなら部の中）に担当を足す（財務管理部）。いちばん後ろに並ぶ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const body = parseOr400(budgetTeamCreateSchema.safeParse(await readBody(event)))
  const round = await openRound()
  if (!round) throw createError({ statusCode: 409, message: '確定していない集約がありません。' })
  const db = useDb()
  const bureau = await db.query.budgetBureaus.findFirst({ where: and(eq(schema.budgetBureaus.id, body.bureauId), eq(schema.budgetBureaus.roundId, round.id)) })
  if (!bureau) throw createError({ statusCode: 404, message: '局が見つかりません。' })
  const teams = await db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.bureauId, bureau.id))
  // 局（または部）のいちばん後ろに並ぶ
  if (teams.some(t => t.team === body.team)) throw createError({ statusCode: 409, message: 'その局に、同じ名前の担当がもうあります。' })
  if (body.departmentId) {
    const dept = await db.query.budgetDepartments.findFirst({ where: eq(schema.budgetDepartments.id, body.departmentId) })
    if (!dept || dept.bureauId !== bureau.id) throw createError({ statusCode: 404, message: '部が見つかりません。' })
  }
  const [team] = await db.insert(schema.budgetTeams).values({
    roundId: round.id, bureauId: bureau.id, departmentId: body.departmentId ?? null, bureauNo: bureau.bureauNo, bureau: bureau.name, team: body.team, nameJa: body.nameJa,
    sortOrder: Math.max(-1, ...teams.map(t => t.sortOrder)) + 1,
  }).returning()
  return team
})
