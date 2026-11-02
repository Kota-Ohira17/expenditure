import { manualJournalSchema } from '../../../../shared/schemas'

/** 仕訳を手で入れる（財務局長・管理者）。借方の合計＝貸方の合計 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'manageCashbook')
  const input = parseOr400(manualJournalSchema.safeParse(await readBody(event)))
  const [journal] = await useDb().insert(schema.manualJournals).values({
    date: input.date,
    memo: input.memo,
    lines: input.lines,
    createdBy: user.email,
    createdAt: new Date(),
  }).returning()
  setResponseStatus(event, 201)
  return journal
})
