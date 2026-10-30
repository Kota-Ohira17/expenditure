import { and, eq, inArray } from 'drizzle-orm'
import { budgetCopySchema } from '../../../../../shared/schemas'

/**
 * 昨年の予算の明細を、この担当の明細にコピーする（本予算の集約。その担当の人・財務管理部）。
 * コピーした明細は未提出から始まり、昨年の金額と比べられる（baseItemId・baseAmount）。すでにコピーした明細は飛ばす。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team, round } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は入力できません。' })
  assertCanAddItem(user, round)
  if (round.kind !== '本予算' || round.baseRoundId == null) throw createError({ statusCode: 409, message: 'コピーできるのは本予算の集約のときだけです。' })
  const { ids } = parseOr400(budgetCopySchema.safeParse(await readBody(event)))
  const db = useDb()
  const baseTeam = await db.query.budgetTeams.findFirst({
    where: and(eq(schema.budgetTeams.roundId, round.baseRoundId), eq(schema.budgetTeams.bureau, team.bureau), eq(schema.budgetTeams.team, team.team)),
  })
  if (!baseTeam) throw createError({ statusCode: 404, message: '昨年の予算にこの担当が見つかりません。' })
  const [sources, mine] = await Promise.all([
    db.select().from(schema.budgetItems)
      .where(and(eq(schema.budgetItems.teamId, baseTeam.id), eq(schema.budgetItems.deleted, false), inArray(schema.budgetItems.id, ids))),
    db.select({ baseItemId: schema.budgetItems.baseItemId, sortOrder: schema.budgetItems.sortOrder }).from(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id)),
  ])
  const done = new Set(mine.map(m => m.baseItemId))
  const todo = sources.filter(s => !done.has(s.id)).sort((a, b) => a.sortOrder - b.sortOrder)
  if (!todo.length) return { count: 0 }
  // 担当のいちばん後ろに、昨年の並び順のまま足す（番号は確定するときに付け直す）
  const teamItems = await db.select({ sortOrder: schema.budgetItems.sortOrder }).from(schema.budgetItems).where(eq(schema.budgetItems.teamId, team.id))
  const start = Math.max(-1, ...teamItems.map(i => i.sortOrder)) + 1
  const now = new Date()
  await db.insert(schema.budgetItems).values(todo.map(({ id, roundId: _r, teamId: _t, ...s }, i) => ({
    ...s,
    roundId: round.id,
    teamId: team.id,
    itemNumber: '',
    sortOrder: start + i,
    status: 'draft' as const,
    reviewComment: '',
    deleted: false,
    baseItemId: id,
    baseAmount: s.amount,
    updatedAt: now,
    updatedBy: user.email,
  })))
  return { count: todo.length }
})
