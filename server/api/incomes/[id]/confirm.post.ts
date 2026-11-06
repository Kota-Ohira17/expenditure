import { and, eq } from 'drizzle-orm'
import { incomeConfirmSchema } from '../../../../shared/schemas'

/** 入金を確かめた（確認済み）／確認待ちに戻す（財務局長・管理者） */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'executeEntries')
  const id = Number(getRouterParam(event, 'id'))
  const { done } = parseOr400(incomeConfirmSchema.safeParse(await readBody(event)))
  const [updated] = await useDb().update(schema.entries)
    .set(done
      ? { status: 'done', executedAt: new Date(), executedBy: user.email }
      : { status: 'pending', executedAt: null, executedBy: null })
    .where(and(eq(schema.entries.id, id), eq(schema.entries.kind, 'income')))
    .returning()
  if (!updated) throw createError({ statusCode: 404, message: '収入の記録が見つかりません。' })
  const [view] = await withIncomeFiles([(await findIncome(id))!])
  return view
})
