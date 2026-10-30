import { and, eq } from 'drizzle-orm'
import { budgetTeamSchema } from '../../../../shared/schemas'

/** 局・担当の名前や担当者を直す（財務管理部）。割り当てた人も新しい名前に付け替える */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const { team } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  const body = parseOr400(budgetTeamSchema.safeParse(await readBody(event)))
  const db = useDb()
  await db.batch([
    db.update(schema.budgetTeams).set(body).where(eq(schema.budgetTeams.id, team.id)),
    db.update(schema.users).set({ budgetBureau: body.bureau, budgetTeam: body.team })
      .where(and(eq(schema.users.budgetBureau, team.bureau), eq(schema.users.budgetTeam, team.team))),
  ])
  return { ok: true }
})
