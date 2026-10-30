import { eq } from 'drizzle-orm'

/** 担当の画面に出す「昨年の予算・決算」（本予算の集約のときの参考。コピーして使える） */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const team = await useDb().query.budgetTeams.findFirst({ where: eq(schema.budgetTeams.id, Number(getRouterParam(event, 'id'))) })
  if (!team) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, team.roundId) })
  if (!round || round.status === 'confirmed' || round.kind !== '本予算') return null
  return await referenceFor(round, team)
})
