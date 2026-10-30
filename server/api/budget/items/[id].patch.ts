import { eq } from 'drizzle-orm'
import { budgetItemSchema } from '../../../../shared/schemas'

/** 明細を直す（その担当の人・財務管理部）。直すと未提出に戻り、提出し直して査定を受ける */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { item, team, round } = await openItemOr404(Number(getRouterParam(event, 'id')))
  await assertCanChangeItem(user, item, team, round)
  const body = parseOr400(budgetItemSchema.safeParse(await readBody(event)))
  const [updated] = await useDb().update(schema.budgetItems)
    .set({ ...body, status: 'draft', updatedAt: new Date(), updatedBy: user.email })
    .where(eq(schema.budgetItems.id, item.id)).returning()
  return updated
})
