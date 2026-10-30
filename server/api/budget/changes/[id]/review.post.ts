import { eq } from 'drizzle-orm'
import { budgetChangeReviewSchema } from '../../../../../shared/schemas'

/** 予算の変更の申請を承認する（予算に反映）か、理由を付けて却下する（財務管理部） */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const id = Number(getRouterParam(event, 'id'))
  const change = await useDb().query.budgetChanges.findFirst({ where: eq(schema.budgetChanges.id, id) })
  if (!change) throw createError({ statusCode: 404, message: '変更が見つかりません。' })
  if (change.status !== 'pending') throw createError({ statusCode: 409, message: '承認待ちの変更ではありません。' })
  const { decision, comment } = parseOr400(budgetChangeReviewSchema.safeParse(await readBody(event)))
  if (decision === 'approve') {
    await applyChange(change, user, comment)
    return { ok: true }
  }
  await useDb().update(schema.budgetChanges)
    .set({ status: 'rejected', reviewComment: comment, reviewedAt: new Date(), reviewedBy: user.email })
    .where(eq(schema.budgetChanges.id, id))
  return { ok: true }
})
