import { count, eq } from 'drizzle-orm'
import { evidenceUploadSchema } from '../../../../shared/schemas'

/**
 * 台帳から申請に証憑を付ける（申請者本人か、財務局長・管理者）。
 * ファイル名は「受付番号_項目番号_支出項目名_種類_金額」に自動で付け直す。
 * 立替なら返金時期も申請に記録する。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const { payload, file } = await readPayloadAndFile(event)
  const input = parseOr400(evidenceUploadSchema.safeParse(payload))
  if (!file) throw createError({ statusCode: 400, message: '証憑ファイルを選んでください。' })

  const db = useDb()
  const entry = await db.query.entries.findFirst({ where: eq(schema.entries.id, id) })
  if (!entry || !canSeeEntry(user, entry)) throw createError({ statusCode: 404, message: '申請が見つかりません。' })
  if (entry.kind !== 'execution') throw createError({ statusCode: 400, message: 'この申請には証憑を付けられません。' })
  if (!canSubmitEvidence(user, entry)) throw createError({ statusCode: 403, message: '証憑を付けられるのは申請者本人と財務局長・管理者です。' })

  const amount = input.amount === '' ? null : input.amount
  const [row] = await db.select({ n: count() }).from(schema.evidenceFiles).where(eq(schema.evidenceFiles.entryId, id))
  const attachmentId = await saveAttachment(file, evidenceLabel(entry, input.kind, amount, (row?.n ?? 0) + 1))

  await db.insert(schema.evidenceFiles).values({
    entryId: id,
    attachmentId,
    kind: input.kind,
    amount,
    date: input.date || null,
    uploadedBy: user.email,
    createdAt: new Date(),
  })
  if (entry.type === '立替' && input.refundTiming) {
    await db.update(schema.entries)
      .set({ details: { ...entry.details, refundTiming: input.refundTiming } })
      .where(eq(schema.entries.id, id))
  }

  setResponseStatus(event, 201)
  return (await evidencesOf([id])).get(id) ?? []
})
