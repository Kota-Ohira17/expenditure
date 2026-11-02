import { desc } from 'drizzle-orm'

/** 収入の記録の一覧（新しい順。だれでも見られる） */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const rows = await useDb().select().from(schema.incomeRecords).orderBy(desc(schema.incomeRecords.createdAt))
  return withIncomeFiles(rows)
})
