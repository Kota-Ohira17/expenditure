import { BUDGET_TERM } from '../../../shared/constants'
import type { BudgetKind } from '../../utils/budget'

/**
 * 最初の予算の取り込み（財務管理部）。予算が1つもないときだけ、もとにする予算を「支出」シートの CSV から一度だけ入れる。
 * 確定した集約として記録し、明細を①予算項目DBの承認済みの行にする（同じ項目番号が重なっていたら、2つ目からはその款の空いている番号）。
 * どちらの予算かは kind（main: 本予算 / revised: 補正予算）で必ず指定する。
 */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'reviewBudget')
  const db = useDb()
  if ((await db.query.budgetRounds.findFirst()) || (await db.query.mainBudgetItems.findFirst())) {
    throw createError({ statusCode: 409, message: '予算はもう入っています。これからの予算は「予算の集約」で作ってください。' })
  }
  const parts = (await readMultipartFormData(event)) ?? []
  const file = parts.find(p => p.name === 'file' && p.data.length > 0)
  if (!file) throw createError({ statusCode: 400, message: 'CSV ファイルを選んでください。' })
  const kindPart = parts.find(p => p.name === 'kind')?.data.toString()
  // 値は ASCII（main / revised）で受け取る（送信元の文字コードに左右されないように）
  const budgetKind: BudgetKind | null = kindPart === 'main' ? '本予算' : kindPart === 'revised' ? '補正予算' : null
  if (!budgetKind) throw createError({ statusCode: 400, message: '本予算か補正予算かを選んでください。' })

  const { lines, sheetRows } = parseBudgetCsv(decodeCsv(file.data))
  if (!lines.length) {
    throw createError({ statusCode: 400, message: '金額の入った明細が見つかりませんでした。「支出」シートの CSV か確認してください。' })
  }
  // 仕様・単価・新規・予算前執行は明細（lines）に持たないので、シートの行から拾う
  const header = sheetRows.find(r => r.role === 'header')?.cells.map(normalizeHeader) ?? []
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
  const c = { spec: col('仕様・詳細', '仕様等', '仕様'), unit: col('単価'), isNew: col('新規'), pre: col('予算前執行') }
  const extras = new Map(sheetRows.filter(r => r.lineKey).map((r) => {
    const at = (i: number) => (i >= 0 ? (r.cells[i] ?? '').trim() : '')
    return [r.lineKey!, { spec: at(c.spec), unitPrice: parseMoney(at(c.unit)), isNew: at(c.isNew) === 'TRUE', preExecution: at(c.pre) === 'TRUE' }]
  }))

  const now = new Date()
  const [round] = await db.insert(schema.budgetRounds).values({
    term: BUDGET_TERM, kind: budgetKind, status: 'confirmed', createdAt: now, createdBy: user.email, confirmedAt: now,
  }).returning()
  // 局・担当を、予算の並び順に1つずつ
  const teams: (typeof schema.budgetTeams.$inferInsert)[] = []
  for (const l of lines) {
    if (teams.some(t => t.bureau === l.bureau && t.team === l.team)) continue
    teams.push({ roundId: round!.id, bureauNo: l.bureauNo || (l.itemNumber.match(/^[a-z]+-?\d+/i)?.[0] ?? ''), bureau: l.bureau, team: l.team, sortOrder: teams.length })
  }
  await db.insert(schema.budgetTeams).values(teams)

  // 同じ項目番号の2つ目からは、その款の空いている番号に付け直す
  const used = new Map<string, { bureau: string, team: string, kan: string }>()
  const rows = lines.map((l, i) => {
    const team = teams.find(t => t.bureau === l.bureau && t.team === l.team)!
    const itemNumber = used.has(l.itemNumber) ? nextItemNumber(used, { bureauNo: team.bureauNo, bureau: l.bureau, team: l.team }, l.kan) : l.itemNumber
    used.set(itemNumber, { bureau: l.bureau, team: l.team, kan: l.kan })
    return {
      id: newId(), term: BUDGET_TERM, roundId: round!.id, itemNumber, bureau: l.bureau, team: l.team,
      kan: l.kan, kou: l.kou, moku: l.moku, setsu: l.setsu, amount: l.budgetAmount, quantity: l.quantity,
      vendor: l.vendor, remark: l.remark, link: l.link, plannedTiming: l.plannedTiming,
      spec: '', unitPrice: null as number | null, isNew: false, preExecution: false, ...extras.get(l.key),
      deleted: false, status: 'approved' as const, sortOrder: i, createdAt: now, createdBy: user.email,
    }
  })
  for (let i = 0; i < rows.length; i += 100) await db.insert(schema.mainBudgetItems).values(rows.slice(i, i + 100))
  await rebuildCurrentBudget()
  return { count: lines.length, total: lines.reduce((s, l) => s + l.budgetAmount, 0), budgetKind }
})
