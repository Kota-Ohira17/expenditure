import { can } from '../../../shared/roles'
import { budgetChangeOfItems, LARGE_INCREASE } from '../../../shared/constants'
import { executionRequestSchema } from '../../../shared/schemas'

/** 執行依頼（旧「執行依頼」フォーム）。予算前執行も同じフォームで出す（予算の表から選ばず、支出項目名を書く） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { payload, file } = await readPayloadAndFile(event)
  const input = parseOr400(executionRequestSchema.safeParse(payload))

  const {
    type, applicantName, department, inCharge, budgetLineKeys, itemNumber: manualItemNumber, itemName, remark, deadline,
    itemAmounts, itemQuantities, itemVendors: _itemVendors, budgetCommitteeApproved, preExecution,
    ...rest
  } = input
  const { amount, quantity, ...details } = rest as typeof rest & { amount?: number, quantity?: string }
  // 予算前執行は予算の表から選ばない（本予算が確定したら、その項目に付け替える）
  const { itemNumber, lines } = preExecution
    ? { itemNumber: '予算前執行', lines: [] }
    : await resolveBudgetLines(budgetLineKeys, manualItemNumber)

  // 発注の数量: 予算の表に数量がある明細だけ必須
  if (type === '発注') requireItemQuantities(lines, itemQuantities)

  // 予算からの変更は申請者に選ばせず、予算額と執行額から決める（予算にない項目なら決めない）
  const budgetChange = lines.length ? budgetChangeOfItems(lines, itemAmounts).change : null
  if (budgetChange === LARGE_INCREASE && !budgetCommitteeApproved) {
    throw createError({ statusCode: 400, message: '1万円以上の増額は、役員会の承認を得てから申請してください（承認のチェックが必要です）。' })
  }

  const attachmentId = file
    ? await saveAttachment(file, `${inCharge}_${itemName}_請求書`)
    : null

  const entry = await insertEntry({
    seq: await nextSeq('execution'),
    kind: 'execution',
    type,
    createdAt: new Date(),
    applicantEmail: user.email,
    applicantName,
    department,
    inCharge,
    itemNumber,
    itemName,
    amount: amount ?? null,
    quantity: quantity || null,
    deadline,
    remark,
    details: {
      ...details,
      ...(budgetChange ? { budgetChange } : {}),
      ...(budgetChange === LARGE_INCREASE ? { budgetCommitteeApproved: true } : {}),
      ...(preExecution ? { preExecution: true } : {}),
    },
    attachmentId,
  }, lines, input)
  if (preExecution) await recordPreExecution(entry, user)

  await notifyN8n('created', entry)
  setResponseStatus(event, 201)
  return toPublicEntry(entry, can(user.role, 'viewBankAccount'))
})
