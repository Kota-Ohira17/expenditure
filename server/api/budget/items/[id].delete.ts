import { eq } from 'drizzle-orm'

/**
 * 明細を消す（その担当の人・財務管理部）。
 * 写してきた明細は「削除する」印を付けるだけ（査定で承認されると、確定したときに予算から消える）。
 * 今回足した明細はそのまま消す。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { item, team } = await collectingItemOr404(Number(getRouterParam(event, 'id')))
  await assertCanChangeItem(user, item, team)
  const db = useDb()
  if (item.baseItemId == null) {
    await db.delete(schema.budgetItems).where(eq(schema.budgetItems.id, item.id))
    return { removed: true }
  }
  await db.update(schema.budgetItems).set({ deleted: true, status: 'draft', updatedAt: new Date(), updatedBy: user.email })
    .where(eq(schema.budgetItems.id, item.id))
  return { removed: false }
})
