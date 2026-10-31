import { eq } from 'drizzle-orm'
import { budgetBureauSchema } from '../../../../shared/schemas'

/** 集約中の予算に局を足す（財務管理部）。いちばん後ろに並ぶ。担当はこのあと局の中に足す */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const body = parseOr400(budgetBureauSchema.safeParse(await readBody(event)))
  const round = await openRound()
  if (!round) throw createError({ statusCode: 409, message: '確定していない集約がありません。' })
  const db = useDb()
  const bureaus = await db.select().from(schema.budgetBureaus).where(eq(schema.budgetBureaus.roundId, round.id))
  if (bureaus.some(b => b.name === body.name)) throw createError({ statusCode: 409, message: 'その局はもうあります。' })
  if (bureaus.some(b => b.bureauNo === body.bureauNo)) throw createError({ statusCode: 409, message: 'その局の番号は、ほかの局が使っています。' })
  const [bureau] = await db.insert(schema.budgetBureaus).values({
    roundId: round.id, ...body, sortOrder: Math.max(-1, ...bureaus.map(b => b.sortOrder)) + 1,
  }).returning()
  return bureau
})
