import { eq } from 'drizzle-orm'

/** 「削除する」印を外す（その担当の人・財務管理部）。未提出に戻る */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { item, team } = await collectingItemOr404(Number(getRouterParam(event, 'id')))
  await assertCanChangeItem(user, item, team)
  await useDb().update(schema.budgetItems).set({ deleted: false, status: 'draft', updatedAt: new Date(), updatedBy: user.email })
    .where(eq(schema.budgetItems.id, item.id))
  return { ok: true }
})
