import { eq } from 'drizzle-orm'

/** 部を消す（財務管理部）。中の担当は消さず、局の直属に戻す */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const db = useDb()
  const dept = await db.query.budgetDepartments.findFirst({ where: eq(schema.budgetDepartments.id, Number(getRouterParam(event, 'id'))) })
  if (!dept) throw createError({ statusCode: 404, message: '部が見つかりません。' })
  await openRoundOr404(dept.roundId)
  await db.batch([
    db.update(schema.budgetTeams).set({ departmentId: null }).where(eq(schema.budgetTeams.departmentId, dept.id)),
    db.delete(schema.budgetDepartments).where(eq(schema.budgetDepartments.id, dept.id)),
  ])
  return { ok: true }
})
