import { eq } from 'drizzle-orm'
import { flowOf } from '../../../shared/budgetCompile'
import { incomeSchema } from '../../../shared/schemas'

/**
 * 収入を記録する（だれでも）。収入の予算明細を1つ選ぶか、予算にない収入として款〜節と項目番号を書く。
 * ファイル（入金の明細など）を一緒に送ると、1件目の証憑として付ける。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { payload, file } = await readPayloadAndFile(event)
  const input = parseOr400(incomeSchema.safeParse(payload))
  const db = useDb()

  let line: typeof schema.budgetLines.$inferSelect | undefined
  if (input.budgetLineKey) {
    line = await db.query.budgetLines.findFirst({ where: eq(schema.budgetLines.key, input.budgetLineKey) })
    if (!line) throw createError({ statusCode: 400, message: '選んだ収入の明細が見つかりません。ページを再読み込みして選び直してください。' })
    if (flowOf(line.itemNumber) !== 'income') throw createError({ statusCode: 400, message: '支出の明細は収入の記録では選べません。' })
  }

  const saved = await insertEntry({
    seq: await nextSeq('income'),
    kind: 'income',
    type: '収入',
    status: 'pending',
    applicantEmail: user.email,
    applicantName: input.applicantName,
    department: input.department,
    inCharge: input.inCharge,
    itemNumber: line?.itemNumber ?? input.itemNumber,
    itemName: input.itemName,
    amount: input.amount,
    deadline: input.receivedOn,
    paymentMethod: input.method,
    remark: input.remark,
    details: {
      payer: input.payer,
      account: input.method === '振込' ? input.account : null,
      ...(line ? {} : { budgetPath: input.budgetPath }),
    },
    createdAt: new Date(),
  }, line ? [line] : [], line ? { itemAmounts: { [line.key]: input.amount } } : {})
  const income = toIncome(saved)

  if (file) {
    const attachmentId = await saveAttachment(file, incomeFileLabel(income, 1))
    await db.insert(schema.evidenceFiles).values({ entryId: income.id, attachmentId, kind: '入金の明細', uploadedBy: user.email, createdAt: new Date() })
  }
  setResponseStatus(event, 201)
  const [view] = await withIncomeFiles([income])
  return view
})
