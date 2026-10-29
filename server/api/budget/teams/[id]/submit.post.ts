import { and, eq, inArray } from 'drizzle-orm'

/** 担当の未提出・要修正の明細をまとめて提出する（査定待ちになる） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team } = await collectingTeamOr404(Number(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は提出できません。' })
  const updated = await useDb().update(schema.budgetItems)
    .set({ status: 'submitted', updatedAt: new Date(), updatedBy: user.email })
    .where(and(eq(schema.budgetItems.teamId, team.id), inArray(schema.budgetItems.status, ['draft', 'returned'])))
    .returning({ id: schema.budgetItems.id })
  if (!updated.length) throw createError({ statusCode: 400, message: '提出する明細がありません。' })
  return { count: updated.length }
})
