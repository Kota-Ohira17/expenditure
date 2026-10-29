import type { BudgetKind } from '../../utils/budget'

/**
 * 最初の予算の取り込み（財務管理部）。予算の集約は「最新の確定した予算を写して直す」ので、
 * まだ予算が1つもないときだけ、もとにする予算（昨年の予算など）を「支出」シートの CSV から一度だけ入れる。
 * どちらの予算かは kind（main: 本予算 / revised: 補正予算）で必ず指定する。
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const db = useDb()
  if ((await db.query.budgetRounds.findFirst()) || (await db.query.budgetLines.findFirst())) {
    throw createError({ statusCode: 409, message: '予算はもう入っています。これからの予算は「予算の集約」で作ってください。' })
  }
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find(p => p.name === 'file' && p.data.length > 0)
  if (!file) throw createError({ statusCode: 400, message: 'CSV ファイルを選んでください。' })

  const { lines, sheetRows } = parseBudgetCsv(decodeCsv(file.data))
  const kindPart = parts.find(p => p.name === 'kind')?.data.toString()
  // 値は ASCII（main / revised）で受け取る（送信元の文字コードに左右されないように）
  const budgetKind: BudgetKind | null = kindPart === 'main' ? '本予算' : kindPart === 'revised' ? '補正予算' : null
  if (!budgetKind) throw createError({ statusCode: 400, message: '本予算か補正予算かを選んでください。' })
  if (!lines.length) {
    throw createError({ statusCode: 400, message: '金額の入った明細が見つかりませんでした。「支出」シートの CSV か確認してください。' })
  }

  await replaceBudgetLines(lines, sheetRows, budgetKind)
  // 取り込んだ予算を、最初の確定した予算として記録する（集約はこれを写して始める）
  await ensureInitialRound(user)
  return { count: lines.length, total: lines.reduce((s, l) => s + l.budgetAmount, 0), budgetKind }
})
