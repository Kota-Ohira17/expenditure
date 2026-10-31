import { eq } from 'drizzle-orm'
import { preExecutionReviewSchema } from '../../../../../shared/schemas'

/** 予算前執行の承認（認める額を決める。執行依頼で選べるようになる）・却下（理由を書く）。財務管理部 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = String(getRouterParam(event, 'id'))
  const db = useDb()
  const p = await db.query.preExecutionRequests.findFirst({ where: eq(schema.preExecutionRequests.id, id) })
  if (!p) throw createError({ statusCode: 404, message: '予算前執行の申請が見つかりません。' })
  if (p.status !== 'pending') throw createError({ statusCode: 409, message: '承認待ちの申請ではありません。' })
  const { decision, approvedAmount, comment } = parseOr400(preExecutionReviewSchema.safeParse(await readBody(event)))
  await db.update(schema.preExecutionRequests).set({
    status: decision === 'approve' ? 'approved' : 'rejected',
    approvedAmount: decision === 'approve' ? (approvedAmount ?? p.amount) : null,
    reviewComment: comment, reviewedAt: new Date(), reviewedBy: user.email,
  }).where(eq(schema.preExecutionRequests.id, id))
  // 承認した枠を、執行依頼で選べる予算明細に足す
  if (decision === 'approve') await rebuildCurrentBudget()
  return { ok: true }
})
