import { eq } from 'drizzle-orm'
import { budgetReviewSchema } from '../../../../../shared/schemas'

/** 査定する（財務管理部）。査定待ちの明細を、承認するか、理由を付けて担当に戻す（要修正） */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const { item } = await collectingItemOr404(Number(getRouterParam(event, 'id')))
  if (item.status !== 'submitted') throw createError({ statusCode: 409, message: '査定待ちの明細ではありません。' })
  const { decision, comment } = parseOr400(budgetReviewSchema.safeParse(await readBody(event)))
  const [updated] = await useDb().update(schema.budgetItems)
    .set({ status: decision === 'approve' ? 'approved' : 'returned', reviewComment: comment, updatedAt: new Date(), updatedBy: user.email })
    .where(eq(schema.budgetItems.id, item.id)).returning()
  return updated
})
