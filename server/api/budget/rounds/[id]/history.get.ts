import { and, asc, eq, sql } from 'drizzle-orm'

/** 項目の査定のやり取り（⑤の行）。?item=項目番号。だれが行ったかは出さない */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const roundId = Number(getRouterParam(event, 'id'))
  const item = String(getQuery(event).item ?? '')
  const rows = await useDb().select().from(schema.budgetReviews)
    .where(and(eq(schema.budgetReviews.roundId, roundId), eq(schema.budgetReviews.itemNumber, item)))
    .orderBy(asc(schema.budgetReviews.createdAt), sql`rowid`)
  return rows.map(({ createdBy: _c, ...r }) => r)
})
