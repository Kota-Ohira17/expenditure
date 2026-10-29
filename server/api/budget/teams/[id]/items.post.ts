import { eq } from 'drizzle-orm'
import { budgetItemSchema } from '../../../../../shared/schemas'

/** 担当に明細を足す（その担当の人・財務管理部）。同じ款のいちばん後ろ（新しい款なら担当のいちばん後ろ）に入る */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team, round } = await collectingTeamOr404(Number(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は入力できません。' })
  const body = parseOr400(budgetItemSchema.safeParse(await readBody(event)))
  const db = useDb()
  const items = await db.select({ kan: schema.budgetItems.kan, sortOrder: schema.budgetItems.sortOrder })
    .from(schema.budgetItems).where(eq(schema.budgetItems.teamId, team.id))
  const sameKan = items.filter(i => i.kan === body.kan)
  const after = Math.max(-1, ...(sameKan.length ? sameKan : items).map(i => i.sortOrder))
  const next = items.filter(i => i.sortOrder > after).map(i => i.sortOrder)
  const sortOrder = next.length ? (after + Math.min(...next)) / 2 : after + 1
  const [item] = await db.insert(schema.budgetItems).values({
    ...body, roundId: round.id, teamId: team.id, sortOrder, status: 'draft', isNew: body.isNew,
    updatedAt: new Date(), updatedBy: user.email,
  }).returning()
  return item
})
