import { and, eq, ne } from 'drizzle-orm'
import { budgetDepartmentSchema } from '../../../../shared/schemas'

/** 部の英語名・日本語名を直す（財務管理部） */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const db = useDb()
  const dept = await db.query.budgetDepartments.findFirst({ where: eq(schema.budgetDepartments.id, Number(getRouterParam(event, 'id'))) })
  if (!dept) throw createError({ statusCode: 404, message: '部が見つかりません。' })
  await openRoundOr404(dept.roundId)
  const body = parseOr400(budgetDepartmentSchema.safeParse(await readBody(event)))
  const same = await db.query.budgetDepartments.findFirst({
    where: and(eq(schema.budgetDepartments.bureauId, dept.bureauId), eq(schema.budgetDepartments.code, body.code), ne(schema.budgetDepartments.id, dept.id)),
  })
  if (same) throw createError({ statusCode: 409, message: 'その局に、同じ名前の部がもうあります。' })
  await db.update(schema.budgetDepartments).set(body).where(eq(schema.budgetDepartments.id, dept.id))
  return { ok: true }
})
