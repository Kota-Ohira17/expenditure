import { and, asc, eq, inArray } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { bureauNameOf } from '../../shared/constants'
import { flowOf } from '../../shared/budgetCompile'
import { BUDGET_REFERENCE_KINDS } from '../db/schema'
import type { BudgetRound, BudgetTeam } from '../db/schema'
import type { SessionUser } from './auth'

/**
 * 本予算の集約で参考にする「昨年の本予算・決算」。支出・収入とも、財務管理部が CSV で取り込む。
 * - 本予算：「支出」「収入」シート（予算の取り込みと同じ形）
 * - 決算：「支出詳細」「収入詳細」シート（MF99_決算の形。このシステムが出す決算シートと同じ）
 * 担当の画面には、局・担当の名前が同じ明細を出し、決算は項目番号で本予算の明細に合わせる。
 */

export type ReferenceKind = typeof BUDGET_REFERENCE_KINDS[number]
export const REFERENCE_LABELS: Record<ReferenceKind, string> = { budget: '本予算（支出）', settlement: '決算（支出）', incomeBudget: '本予算（収入）', incomeSettlement: '決算（収入）' }
/** 決算の種類か（決算は決算シートの見出し名で読む） */
const isSettlementKind = (kind: ReferenceKind) => kind === 'settlement' || kind === 'incomeSettlement'
/** 収入の種類か（項目番号が in から始まる明細だけを読む） */
const isIncomeKind = (kind: ReferenceKind) => kind === 'incomeBudget' || kind === 'incomeSettlement'
const SHEET_NAMES: Record<ReferenceKind, string> = { budget: '「支出」シート', settlement: '「支出詳細」シート', incomeBudget: '「収入」シート', incomeSettlement: '「収入詳細」シート' }

/** CSV を読んで、種類ごとに入れ替える */
export async function importReference(kind: ReferenceKind, fileName: string, data: Uint8Array, user: SessionUser) {
  // 決算は決算シートの見出し名（金額＝決算額）で読む
  const parsed = parseBudgetRows(parseCsv(decodeCsv(data)), isSettlementKind(kind) ? SETTLEMENT_COLUMNS : BUDGET_COLUMNS)
  // 収入は in、支出は out から始まる項目番号の明細だけを読む（違うシートを選んだときに混ざらないように）
  const lines = parsed.lines.filter(l => flowOf(l.itemNumber) === (isIncomeKind(kind) ? 'income' : 'expense'))
  const sheetRows = parsed.sheetRows
  if (!lines.length) {
    throw createError({ statusCode: 400, message: `${isIncomeKind(kind) ? '項目番号が in から始まる' : '項目番号が out から始まる'}、金額の入った明細が見つかりませんでした。${SHEET_NAMES[kind]}の CSV か確認してください。` })
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
  const budget = rows.filter(r => r.kind === 'budget' || r.kind === 'incomeBudget')
  const settlement = rows.filter(r => r.kind === 'settlement' || r.kind === 'incomeSettlement')
  const actualBy = new Map<string, number>()
  for (const s of settlement) actualBy.set(s.itemNumber, (actualBy.get(s.itemNumber) ?? 0) + s.amount)
  const given = new Set<string>()
  const items = budget.map((b) => {
    // 同じ番号の明細が複数あるときは、決算は最初の明細にまとめて付ける
    const actual = given.has(b.itemNumber) ? null : (actualBy.get(b.itemNumber) ?? 0)
    given.add(b.itemNumber)
    return { ...b, flow: flowOf(b.itemNumber), budget: b.amount, actual, outside: false, copied: copiedIds.has(b.id) }
  })
  const budgetNumbers = new Set(budget.map(b => b.itemNumber))
  const outside = settlement.filter(s => !budgetNumbers.has(s.itemNumber))
    .map(s => ({ ...s, flow: flowOf(s.itemNumber), budget: null, actual: s.amount, outside: true, copied: copiedIds.has(s.id) }))
  return { files, items: [...items, ...outside] }
}

/**
 * 昨年の本予算・決算を取り込める・消せる人：管理者と、財務局（ZAI）の zas 担当に割り当てられた人（ユーザー管理の「予算を入力する担当」）。
 * 財務管理部・財務局長でも、zas に割り当てられていなければできない。
 */
export async function canImportReferences(user: SessionUser) {
  if (user.role === 'admin') return true
  const me = await useDb().query.users.findFirst({ where: eq(schema.users.email, user.email) })
  return !!me && me.budgetBureau === bureauNameOf('ZAI') && me.budgetTeam.toLowerCase() === 'zas'
}

/** 取り込める人でなければ 403 */
export async function requireImportReferences(event: H3Event) {
  const user = await requireUser(event)
  if (!(await canImportReferences(user))) throw createError({ statusCode: 403, message: '昨年の本予算・決算の取り込みは、管理者と財務局（ZAI）の zas 担当だけができます。' })
  return user
}
