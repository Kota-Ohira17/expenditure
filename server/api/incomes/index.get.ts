
/** 収入の記録の一覧（新しい順。だれでも見られる） */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return withIncomeFiles(await listIncomes())
})
