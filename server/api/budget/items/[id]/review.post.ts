import { budgetReviewSchema } from '../../../../../shared/schemas'

/** 査定する（財務管理部）。査定待ちの明細を、承認するか、理由を付けて担当に戻す（要修正）。⑤に行を足す */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const { row, round, status } = await openItemOr404(String(getRouterParam(event, 'id')))
  assertPhase(round, 'reviewing')
  if (status !== 'submitted') throw createError({ statusCode: 409, message: '査定待ちの明細ではありません。' })
  const { decision, comment } = parseOr400(budgetReviewSchema.safeParse(await readBody(event)))
  const next = decision === 'approve' ? 'approved' as const : 'returned' as const
  const review = reviewRow(round.id, row.itemNumber, decision === 'approve' ? 'approve' : 'return', next, user, { comment, rowId: row.id })
  await useDb().insert(schema.budgetReviews).values(review)
  return { status: next, reviewComment: decision === 'approve' ? '' : comment, updatedAt: review.createdAt }
})
