import { and, eq } from 'drizzle-orm'
import { budgetTeamSchema } from '../../../../shared/schemas'

/** 担当の名前を直す（財務管理部）。この集約の明細の行と、割り当てた人も新しい名前に付け替える */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const { team, round } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  const { team: name } = parseOr400(budgetTeamSchema.safeParse(await readBody(event)))
  const db = useDb()
  if (name !== team.team) {
    const same = await db.query.budgetTeams.findFirst({ where: and(eq(schema.budgetTeams.roundId, round.id), eq(schema.budgetTeams.bureau, team.bureau), eq(schema.budgetTeams.team, name)) })
    if (same) throw createError({ statusCode: 409, message: 'その局に、同じ名前の担当がもうあります。' })
  }
  const table = tableOf(round)
  await db.batch([
    db.update(schema.budgetTeams).set({ team: name }).where(eq(schema.budgetTeams.id, team.id)),
    db.update(table).set({ team: name })
      .where(and(eq(table.roundId, round.id), eq(table.bureau, team.bureau), eq(table.team, team.team))),
    db.update(schema.users).set({ budgetTeam: name })
      .where(and(eq(schema.users.budgetBureau, team.bureau), eq(schema.users.budgetTeam, team.team))),
  ])
  return { ok: true }
})
