/**
 * 昨年の本予算・決算を CSV で取り込む（財務管理部）。kind=budget は「支出」シート、settlement は「支出詳細」シート。
 * 同じ種類を取り込み直すと入れ替える。本予算の集約で、担当の画面に参考として出す。
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find(p => p.name === 'file' && p.data.length > 0)
  if (!file) throw createError({ statusCode: 400, message: 'CSV ファイルを選んでください。' })
  const kind = parts.find(p => p.name === 'kind')?.data.toString()
  if (kind !== 'budget' && kind !== 'settlement') throw createError({ statusCode: 400, message: '本予算か決算かを選んでください。' })
  return await importReference(kind, file.filename ?? '', file.data, user)
})
