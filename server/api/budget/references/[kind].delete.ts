import { eq } from 'drizzle-orm'

/** 取り込んだ昨年の本予算・決算を消す（財務管理部）。コピー済みの明細はそのまま残る */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const kind = getRouterParam(event, 'kind')
  if (kind !== 'budget' && kind !== 'settlement') throw createError({ statusCode: 404, message: '見つかりません。' })
  const db = useDb()
  await db.batch([
    db.delete(schema.budgetReferences).where(eq(schema.budgetReferences.kind, kind)),
    db.delete(schema.budgetReferenceFiles).where(eq(schema.budgetReferenceFiles.kind, kind)),
  ])
  return { ok: true }
})
