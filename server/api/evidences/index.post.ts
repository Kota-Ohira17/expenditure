import { can } from '../../../shared/roles'
import { evidenceSchema } from '../../../shared/schemas'

/** 証憑提出（旧「証憑管理」フォーム）。立替の台帳登録もここで行う */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { payload, file } = await readPayloadAndFile(event)
  const input = parseOr400(evidenceSchema.safeParse(payload))
  if (!file) {
    throw createError({ statusCode: 400, message: '証憑ファイルを添付してください。' })
  }
  const { itemNumber, lines } = await resolveBudgetLines(input.budgetLineKeys, input.itemNumber)
  // 予算の表に数量がある明細だけ数量が必須
  requireItemQuantities(lines, input.itemQuantities)

  const attachmentId = await saveAttachment(file, `${input.inCharge}_${input.itemName}_${input.kindOfEvidence}`)

  const entry = await insertEntry({
    seq: await nextSeq('evidence'),
    kind: 'evidence',
    type: '立替',
    createdAt: new Date(),
    applicantEmail: user.email,
    applicantName: input.advancedName,
    department: input.department,
    inCharge: input.inCharge,
    itemNumber,
    itemName: input.itemName,
    amount: input.amount,
    quantity: input.quantity || null,
    deadline: input.payDate,
    details: { kindOfEvidence: input.kindOfEvidence, refundTiming: input.refundTiming },
    attachmentId,
    // 旧GASでは証憑提出時点で執行形態「立替」・執行日=立替日として記録していた
    paymentMethod: '立替',
  }, lines, input)

  await notifyN8n('created', entry)
  setResponseStatus(event, 201)
  return toPublicEntry(entry, can(user.role, 'viewBankAccount'))
})
