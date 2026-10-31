import { and, eq } from 'drizzle-orm'
import { budgetDepartmentSchema } from '../../../../shared/schemas'

/** 局の中に部を足す（財務管理部）。その局のいちばん後ろに並ぶ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const raw = await readBody(event)
  const body = parseOr400(budgetDepartmentSchema.safeParse(raw))
  const db = useDb()
  const bureau = await db.query.budgetBureaus.findFirst({ where: eq(schema.budgetBureaus.id, Number(raw?.bureauId)) })
  if (!bureau) throw createError({ statusCode: 404, message: '局が見つかりません。' })
  await openRoundOr404(bureau.roundId)
  const depts = await db.select().from(schema.budgetDepartments).where(and(eq(schema.budgetDepartments.bureauId, bureau.id)))
  if (depts.some(d => d.code === body.code)) throw createError({ statusCode: 409, message: 'その局に、同じ名前の部がもうあります。' })
  const [dept] = await db.insert(schema.budgetDepartments).values({
    roundId: bureau.roundId, bureauId: bureau.id, ...body, sortOrder: Math.max(-1, ...depts.map(d => d.sortOrder)) + 1,
  }).returning()
  return dept
})
