import { asc } from 'drizzle-orm'

/** 担当に割り当てられる人の一覧（財務管理部）。名前・メールと、今の割り当て */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  return useDb()
    .select({ email: schema.users.email, name: schema.users.name, bureau: schema.users.budgetBureau, team: schema.users.budgetTeam })
    .from(schema.users).orderBy(asc(schema.users.name))
})
