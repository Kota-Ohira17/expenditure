import { eq, inArray } from 'drizzle-orm'
import { can } from '../../../shared/roles'

/** 収入の記録を取り消す（確認待ちの間は記録した本人、いつでも財務局長・管理者）。証憑も消す */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const db = useDb()
  const income = await findIncome(id)
  if (!income) throw createError({ statusCode: 404, message: '収入の記録が見つかりません。' })
  const staff = can(user.role, 'executeEntries')
  if (!staff && (income.applicantEmail !== user.email || income.status !== 'pending')) {
    throw createError({ statusCode: 403, message: '取り消せるのは、確認待ちの間の記録した本人と、財務局長・管理者です。' })
  }
  const files = await db.select().from(schema.evidenceFiles).where(eq(schema.evidenceFiles.entryId, id))
  await db.batch([
    db.delete(schema.evidenceFiles).where(eq(schema.evidenceFiles.entryId, id)),
    db.delete(schema.attachments).where(inArray(schema.attachments.id, files.length ? files.map(f => f.attachmentId) : [-1])),
    db.delete(schema.entryItems).where(eq(schema.entryItems.entryId, id)),
    db.delete(schema.entries).where(eq(schema.entries.id, id)),
  ])
  return { ok: true }
})
