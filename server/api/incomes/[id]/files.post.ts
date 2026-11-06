import { count, eq } from 'drizzle-orm'
import { incomeFileSchema } from '../../../../shared/schemas'

/** 収入に証憑を付ける（だれでも）。ファイル名は「項目番号_担当名_収入項目名_月日」に付け直す */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const { payload, file } = await readPayloadAndFile(event)
  const input = parseOr400(incomeFileSchema.safeParse(payload))
  if (!file) throw createError({ statusCode: 400, message: '証憑ファイルを選んでください。' })
  const db = useDb()
  const income = await findIncome(id)
  if (!income) throw createError({ statusCode: 404, message: '収入の記録が見つかりません。' })
  const [row] = await db.select({ n: count() }).from(schema.evidenceFiles).where(eq(schema.evidenceFiles.entryId, id))
  const attachmentId = await saveAttachment(file, incomeFileLabel(income, (row?.n ?? 0) + 1))
  await db.insert(schema.evidenceFiles).values({ entryId: id, attachmentId, kind: input.kind, uploadedBy: user.email, createdAt: new Date() })
  setResponseStatus(event, 201)
  return (await incomeFilesOf([id])).get(id) ?? []
})
