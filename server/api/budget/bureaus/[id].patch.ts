import { and, eq, ne } from 'drizzle-orm'
import { budgetBureauSchema } from '../../../../shared/schemas'

/**
 * 局の名前・局の番号を直す（財務管理部）。局の中の担当すべてと、この集約の明細の行・割り当てた人も新しい局の名前に付け替える。
 * 局の番号を変えると、これから足す明細の項目番号がその番号から始まる（今ある明細の番号は変えない）。
 */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const db = useDb()
  const bureau = await db.query.budgetBureaus.findFirst({ where: eq(schema.budgetBureaus.id, Number(getRouterParam(event, 'id'))) })
  if (!bureau) throw createError({ statusCode: 404, message: '局が見つかりません。' })
  const round = await openRoundOr404(bureau.roundId)
  const body = parseOr400(budgetBureauSchema.safeParse(await readBody(event)))
  const others = await db.select().from(schema.budgetBureaus).where(and(eq(schema.budgetBureaus.roundId, round.id), ne(schema.budgetBureaus.id, bureau.id)))
  if (others.some(b => b.name === body.name)) throw createError({ statusCode: 409, message: 'その局はもうあります。' })
  if (others.some(b => b.bureauNo === body.bureauNo)) throw createError({ statusCode: 409, message: 'その局の番号は、ほかの局が使っています。' })
  const table = tableOf(round)
  await db.batch([
    db.update(schema.budgetBureaus).set(body).where(eq(schema.budgetBureaus.id, bureau.id)),
    db.update(schema.budgetTeams).set({ bureauNo: body.bureauNo, bureau: body.name }).where(eq(schema.budgetTeams.bureauId, bureau.id)),
    db.update(table).set({ bureau: body.name }).where(and(eq(table.roundId, round.id), eq(table.bureau, bureau.name))),
    db.update(schema.users).set({ budgetBureau: body.name }).where(eq(schema.users.budgetBureau, bureau.name)),
  ])
  return { ok: true }
})
