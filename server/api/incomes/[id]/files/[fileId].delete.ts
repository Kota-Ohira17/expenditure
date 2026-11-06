import { and, eq } from 'drizzle-orm'

/** 間違えて付けた収入の証憑を外す（付けた本人か、財務局長・管理者） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const fileId = Number(getRouterParam(event, 'fileId'))
  const db = useDb()
  const f = await db.query.evidenceFiles.findFirst({ where: and(eq(schema.evidenceFiles.id, fileId), eq(schema.evidenceFiles.entryId, id)) })
  if (!f || !await findIncome(id)) throw createError({ statusCode: 404, message: '証憑が見つかりません。' })
  if (!canDeleteIncomeFile(user, f)) throw createError({ statusCode: 403, message: '証憑を外せるのは付けた本人と財務局長・管理者です。' })
  await db.batch([
    db.delete(schema.evidenceFiles).where(eq(schema.evidenceFiles.id, fileId)),
    db.delete(schema.attachments).where(eq(schema.attachments.id, f.attachmentId)),
  ])
  return (await incomeFilesOf([id])).get(id) ?? []
})
