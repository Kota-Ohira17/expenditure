import { and, asc, eq, inArray } from 'drizzle-orm'
import type { BudgetRound, BudgetTeam } from '../db/schema'
import type { SessionUser } from './auth'

/**
 * 本予算の集約で参考にする「昨年の本予算・決算」。どちらも財務管理部が CSV で取り込む。
 * - 本予算：「支出」シート（予算の取り込みと同じ形）
 * - 決算：「支出詳細」シート（MF99_決算の形。このシステムが出す決算シートと同じ）
 * 担当の画面には、局・担当の名前が同じ明細を出し、決算は項目番号で本予算の明細に合わせる。
 */

export type ReferenceKind = 'budget' | 'settlement'
export const REFERENCE_LABELS: Record<ReferenceKind, string> = { budget: '本予算', settlement: '決算' }

/** CSV を読んで、種類ごとに入れ替える */
export async function importReference(kind: ReferenceKind, fileName: string, data: Uint8Array, user: SessionUser) {
  const { lines, sheetRows } = parseBudgetRows(parseCsv(decodeCsv(data)))
  if (!lines.length) {
    const sheet = kind === 'budget' ? '「支出」シート' : '「支出詳細」シート'
    throw createError({ statusCode: 400, message: `金額の入った明細が見つかりませんでした。${sheet}の CSV か確認してください。` })
  }
  // 仕様・単価・新規・予算前執行は明細（lines）に持たないので、シートの行から拾う
  const header = sheetRows.find(r => r.role === 'header')?.cells.map(normalizeHeader) ?? []
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
  const c = { spec: col('仕様・詳細', '仕様等', '仕様'), unit: col('単価'), isNew: col('新規'), pre: col('予算前執行') }
  const extras = new Map(sheetRows.filter(r => r.lineKey).map((r) => {
    const at = (i: number) => (i >= 0 ? (r.cells[i] ?? '').trim() : '')
    return [r.lineKey!, { spec: at(c.spec), unitPrice: parseMoney(at(c.unit)), isNew: at(c.isNew) === 'TRUE', preExecution: at(c.pre) === 'TRUE' }]
  }))

  const rows = lines.map((l, i) => ({
    kind,
    sortOrder: i,
    itemNumber: l.itemNumber,
    bureau: l.bureau,
    team: l.team,
    kan: l.kan,
    kou: l.kou,
    moku: l.moku,
    setsu: l.setsu,
    quantity: l.quantity,
    amount: l.budgetAmount,
    vendor: l.vendor,
    link: l.link,
    plannedTiming: l.plannedTiming,
    remark: l.remark,
    spec: '',
    unitPrice: null as number | null,
    isNew: false,
    preExecution: false,
    ...extras.get(l.key),
  }))
  const db = useDb()
  const total = rows.reduce((s, r) => s + r.amount, 0)
  const CHUNK = 100
  await db.batch([
    db.delete(schema.budgetReferences).where(eq(schema.budgetReferences.kind, kind)),
    ...Array.from({ length: Math.ceil(rows.length / CHUNK) }, (_, i) => db.insert(schema.budgetReferences).values(rows.slice(i * CHUNK, (i + 1) * CHUNK))),
    db.insert(schema.budgetReferenceFiles)
      .values({ kind, fileName, count: rows.length, total, importedAt: new Date(), importedBy: user.email })
      .onConflictDoUpdate({ target: schema.budgetReferenceFiles.kind, set: { fileName, count: rows.length, total, importedAt: new Date(), importedBy: user.email } }),
  ] as const)
  return { count: rows.length, total }
}

/** 取り込んだファイルの一覧（だれが取り込んだかは出さない） */
export async function referenceFiles() {
  const files = await useDb().select().from(schema.budgetReferenceFiles)
  return files.map(({ importedBy: _b, ...f }) => f)
}

/**
 * その担当の昨年の本予算の明細と、決算額。
 * 決算は項目番号で本予算の明細に合わせる（同じ番号が複数あれば、その番号の決算の合計を最初の明細に付ける）。
 * 本予算にない番号の決算は「予算外の決算」として並べる（これもコピーできる）。
 */
/** 取り込んだ明細の担当名として合わせる名前（英語の担当名と日本語名） */
export const teamNamesOf = (team: Pick<BudgetTeam, 'team' | 'nameJa'>) => [...new Set([team.team, team.nameJa].filter(Boolean))]

export async function referenceFor(round: BudgetRound, team: Pick<BudgetTeam, 'bureau' | 'team' | 'nameJa'>) {
  const db = useDb()
  const [rows, state, files] = await Promise.all([
    db.select().from(schema.budgetReferences)
      .where(and(eq(schema.budgetReferences.bureau, team.bureau), inArray(schema.budgetReferences.team, teamNamesOf(team))))
      .orderBy(asc(schema.budgetReferences.kind), asc(schema.budgetReferences.sortOrder)),
    roundState(round),
    referenceFiles(),
  ])
  // コピーすると、取り込んだ明細の項目番号のまま①に行を足すので、その番号の項目がこの集約にあればコピー済み
  const inRound = new Set([...state.latest.values()].filter(r => !r.deleted).map(r => r.itemNumber))
  const copiedIds = new Set(rows.filter(r => inRound.has(r.itemNumber)).map(r => r.id))
  const budget = rows.filter(r => r.kind === 'budget')
  const settlement = rows.filter(r => r.kind === 'settlement')
  const actualBy = new Map<string, number>()
  for (const s of settlement) actualBy.set(s.itemNumber, (actualBy.get(s.itemNumber) ?? 0) + s.amount)
  const given = new Set<string>()
  const items = budget.map((b) => {
    // 同じ番号の明細が複数あるときは、決算は最初の明細にまとめて付ける
    const actual = given.has(b.itemNumber) ? null : (actualBy.get(b.itemNumber) ?? 0)
    given.add(b.itemNumber)
    return { ...b, budget: b.amount, actual, outside: false, copied: copiedIds.has(b.id) }
  })
  const budgetNumbers = new Set(budget.map(b => b.itemNumber))
  const outside = settlement.filter(s => !budgetNumbers.has(s.itemNumber))
    .map(s => ({ ...s, budget: null, actual: s.amount, outside: true, copied: copiedIds.has(s.id) }))
  return { files, items: [...items, ...outside] }
}
