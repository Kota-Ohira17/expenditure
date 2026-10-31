import { eq } from 'drizzle-orm'
import { budgetTeamMoveSchema } from '../../../../../shared/schemas'

/** 担当を部に入れる（departmentId）・部から出して局の直属にする（null）。財務管理部。同じ局の部だけ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const { team } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  const { departmentId } = parseOr400(budgetTeamMoveSchema.safeParse(await readBody(event)))
  const db = useDb()
  if (departmentId) {
    const dept = await db.query.budgetDepartments.findFirst({ where: eq(schema.budgetDepartments.id, departmentId) })
    if (!dept || dept.bureauId !== team.bureauId) throw createError({ statusCode: 404, message: '同じ局の部が見つかりません。' })
  }
  await db.update(schema.budgetTeams).set({ departmentId }).where(eq(schema.budgetTeams.id, team.id))
  return { ok: true }
})
