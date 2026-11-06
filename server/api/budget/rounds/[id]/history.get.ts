import { and, asc, eq, or, sql } from 'drizzle-orm'

/** 項目の査定のやり取り（⑤の行）。?item=項目の内部 ID。番号を振り直しても続けて出す。だれが行ったかは出さない */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const roundId = Number(getRouterParam(event, 'id'))
  const item = String(getQuery(event).item ?? '')
  const rows = await useDb().select().from(schema.budgetReviews)
    .where(and(eq(schema.budgetReviews.roundId, roundId), or(eq(schema.budgetReviews.itemId, item), and(eq(schema.budgetReviews.itemId, ''), eq(schema.budgetReviews.itemNumber, item)))))
    .orderBy(asc(schema.budgetReviews.createdAt), sql`rowid`)
  return rows.map(({ createdBy: _c, ...r }) => r)
})
