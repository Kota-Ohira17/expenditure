import { asc, eq, inArray } from 'drizzle-orm'
import type { Entry, EntryItem } from '../db/schema'
import type { EvidenceView } from './evidence'

/**
 * 決算シートの中身。Excel（/api/settlement.xlsx）とGoogleスプレッドシート（/api/settlement/sheets）の
 * 両方に同じ表を書き出すため、書き出し方に依存しない形で作る。
 * - 「決算」: 取り込んだ「支出」シートと同じ行・列・色のまま、右に執行額・差額・執行率・申請番号と、款・担当・局ごとの執行額の合計
 * - 「証憑」: 同じく「支出」シートと同じ形のまま、右に明細ごとの執行額・申請番号・証憑（1件1列のリンク）
 * - 「執行一覧」: 対応済みの申請を明細ごとに1行ずつ（証憑へのリンクつき）
 */

export type CellValue = string | number | boolean | Date | null | { text: string, url: string }

export interface TableColumn {
  key: string
  header: string
  /** 文字数の目安（13.3 で元のシートと同じ 100px） */
  width: number
  /** yen: 1,234 ／ currency: ¥1,234（元のシートと同じ）／ check: TRUE・FALSE（スプレッドシートではチェックボックス） */
  format?: 'yen' | 'currency' | 'rate' | 'date' | 'check'
}

export interface TableRow {
  values: Record<string, CellValue>
  bold?: boolean
  /** 背景色（RRGGBB）を塗る列の範囲（from 以上 to 未満の列番号） */
  fills?: { from: number, to: number, color: string }[]
  /** 上に二重線（総計の行） */
  topBorder?: boolean
}

export interface Table {
  name: string
  columns: TableColumn[]
  rows: TableRow[]
  /** 列見出しより上に置く行（元のシートの「支出の部」など） */
  preamble?: string[][]
  /** 元の予算シートと同じ見た目にする（Arial 10、見出しは太字にしない、フィルタなし） */
  sheetStyle?: boolean
}

/** 列見出しの行の色（シートと同じグレー） */
export const HEADER_FILL = 'D9D9D9'

/** 元のシートで100pxの列の幅 */
const SHEET_COLUMN_WIDTH = 13.3
const SEQS_WIDTH = 16

type DoneEntry = Entry & { items: EntryItem[], evidences: EvidenceView[], attachmentName: string | null }
type Link = { text: string, url: string }

/**
 * 申請の証憑へのリンク（ファイル名を表示）。
 * - 執行依頼：台帳から付けた証憑。まだなければ請求書（振込で添付されたもの）
 * - 以前の証憑提出フォームの申請：その添付
 */
function evidenceLinks(e: DoneEntry, origin: string): Link[] {
  if (e.kind === 'execution' && e.evidences.length) {
    return e.evidences.map(f => ({ text: f.fileName, url: `${origin}/api/entries/${e.id}/evidences/${f.id}` }))
  }
  if (e.attachmentId) return [{ text: e.attachmentName ?? `${e.seq} 添付`, url: `${origin}/api/entries/${e.id}/attachment` }]
  return []
}

/** 1つのセルに入れる証憑：1件ならリンク、複数なら最初のファイルへのリンクに「ほかN件」を添える */
function evidenceCellOf(links: Link[]): CellValue {
  if (!links.length) return null
  if (links.length === 1) return links[0]!
  return { text: `${links[0]!.text} ほか${links.length - 1}件`, url: links[0]!.url }
}

export async function buildSettlementTables(origin: string): Promise<Table[]> {
  const db = useDb()
  const sheetRows = await db.select().from(schema.budgetSheetRows).orderBy(asc(schema.budgetSheetRows.sortOrder))
  if (!sheetRows.some(r => r.role === 'header')) {
    throw createError({
      statusCode: 400,
      message: '決算シートは、取り込んだ予算の「支出」シートと同じ形で作ります。「予算」の画面から「支出」シートの CSV を取り込み直してください。',
    })
  }
  const rows = await withEvidences(await withItems(
    await db.select().from(schema.entries).where(eq(schema.entries.status, 'done')).orderBy(asc(schema.entries.createdAt)),
  ))
  // 請求書・以前の証憑提出の添付のファイル名
  const attachmentIds = rows.map(r => r.attachmentId).filter((id): id is number => id != null)
  const names = new Map(attachmentIds.length
    ? (await db.select({ id: schema.attachments.id, fileName: schema.attachments.fileName }).from(schema.attachments).where(inArray(schema.attachments.id, attachmentIds))).map(a => [a.id, a.fileName])
    : [])
  const done: DoneEntry[] = rows.map(r => ({ ...r, attachmentName: r.attachmentId ? names.get(r.attachmentId) ?? null : null }))
  const sheet = budgetSheetOf(sheetRows)
  return [settlementTable(sheet, done), evidenceTable(sheet, done, origin), executionTable(done, origin)]
}

type StoredSheetRow = { role: 'preamble' | 'header' | 'row', cells: string[], lineKey: string | null }

/** 元のシートの見出しから探す列（見出しの書き方の違いは normalizeHeader でそろえる） */
const NAME_COLUMNS = { bureau: ['局'], team: ['担当', '担当名'], kan: ['款'], kou: ['項'] } as const
/** 階層ごとの色と、塗り終わりの列（元のシートでは、局の行は局合計まで・担当の行は担当合計まで…と塗られている） */
const LEVEL_STYLE = {
  bureau: { color: 'FFF2CC', until: '局合計' },
  team: { color: 'D9EAD3', until: '担当合計' },
  kan: { color: 'C9DAF8', until: '款合計' },
  kou: { color: 'FCE5CD', until: '備考' },
} as const
type GroupLevel = keyof typeof LEVEL_STYLE

/**
 * 取り込んだ「支出」シートを、列（見出し・書式）と行に分ける。
 * 金額の列は数値、TRUE/FALSE だけの列は真偽値にして、元のシートと同じ表示にする。
 */
function budgetSheetOf(stored: StoredSheetRow[]) {
  const header = stored.find(r => r.role === 'header')!.cells
  const body = stored.filter(r => r.role === 'row')
  const width = Math.max(header.length, ...body.map(r => r.cells.length))
  const names = Array.from({ length: width }, (_, i) => normalizeHeader(header[i] ?? ''))
  const indexOf = (candidates: readonly string[]) => candidates.map(c => names.indexOf(c)).find(i => i >= 0) ?? -1

  const isCheck = (i: number) => {
    const values = body.map(r => (r.cells[i] ?? '').trim()).filter(Boolean)
    return values.length > 0 && values.every(v => v === 'TRUE' || v === 'FALSE')
  }
  const isMoney = (i: number) => /予算額|金額|合計$/.test(names[i]!)
  const formats = names.map((_, i) => (isMoney(i) ? 'currency' as const : isCheck(i) ? 'check' as const : undefined))

  const columns: TableColumn[] = names.map((_, i) => ({ key: `c${i}`, header: header[i] ?? '', width: SHEET_COLUMN_WIDTH, format: formats[i] }))
  const nameIndex = Object.fromEntries(Object.entries(NAME_COLUMNS).map(([k, v]) => [k, indexOf(v)])) as Record<GroupLevel, number>
  const untilIndex = (level: GroupLevel) => {
    const i = names.indexOf(LEVEL_STYLE[level].until)
    return i >= 0 ? i + 1 : width
  }

  const rows = body.map((r) => {
    const values: Record<string, CellValue> = {}
    r.cells.forEach((raw, i) => {
      const v = raw.trim()
      if (!v) return
      if (formats[i] === 'currency') values[`c${i}`] = parseMoney(v) ?? raw
      else if (formats[i] === 'check') values[`c${i}`] = v === 'TRUE'
      else values[`c${i}`] = raw
    })
    // 局・担当・款・項の名前がある行は、元のシートと同じくその列から右を塗る
    const level = (Object.keys(LEVEL_STYLE) as GroupLevel[]).find(l => nameIndex[l] >= 0 && (r.cells[nameIndex[l]] ?? '').trim())
    const fills = level ? [{ from: nameIndex[level], to: untilIndex(level), color: LEVEL_STYLE[level].color }] : undefined
    return { values, fills, level, lineKey: r.lineKey }
  })

  return {
    preamble: stored.filter(r => r.role === 'preamble').map(r => r.cells),
    columns,
    rows,
    /** 「予算にない項目」で名前を書く列（項の列。なければ2列目） */
    nameColumn: `c${nameIndex.kou >= 0 ? nameIndex.kou : 1}`,
  }
}
type BudgetSheet = ReturnType<typeof budgetSheetOf>

/** 明細ごとの執行額・申請。予算に載っていない申請（手入力・取り込み直しで消えた明細）は別にまとめる */
function aggregate(sheet: BudgetSheet, done: DoneEntry[]) {
  const lineKeys = new Set(sheet.rows.map(r => r.lineKey).filter(Boolean))
  const byLine = new Map<string, { actual: number, unknown: number, entries: DoneEntry[] }>()
  const outside: { itemNumber: string, name: string, actual: number | null, entry: DoneEntry }[] = []
  for (const entry of done) {
    if (!entry.items.length) {
      outside.push({ itemNumber: entry.itemNumber, name: entry.itemName, actual: entry.amount, entry })
      continue
    }
    for (const item of entry.items) {
      const actual = actualAmountOf(item, entry)
      if (!lineKeys.has(item.lineKey)) {
        outside.push({ itemNumber: item.itemNumber, name: item.label, actual, entry })
        continue
      }
      const rec = byLine.get(item.lineKey) ?? { actual: 0, unknown: 0, entries: [] }
      if (actual == null) rec.unknown++
      else rec.actual += actual
      if (!rec.entries.includes(entry)) rec.entries.push(entry)
      byLine.set(item.lineKey, rec)
    }
  }
  return { byLine, outside }
}

function settlementTable(sheet: BudgetSheet, done: DoneEntry[]): Table {
  const { byLine, outside } = aggregate(sheet, done)
  const columns: TableColumn[] = [
    ...sheet.columns,
    { key: 'actual', header: '執行額', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'diff', header: '差額（予算−執行）', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'rate', header: '執行率', width: 8, format: 'rate' },
    { key: 'seqs', header: '申請番号', width: SEQS_WIDTH },
    { key: 'kanActual', header: '款執行合計', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'teamActual', header: '担当執行合計', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'bureauActual', header: '局執行合計', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'note', header: '執行の備考', width: SHEET_COLUMN_WIDTH },
  ]
  const budgetColumn = sheet.columns.find(c => /予算額|金額/.test(normalizeHeader(c.header)))?.key

  // 款・担当・局の行に、その下の明細の執行額の合計を出す（元のシートの款合計・担当合計・局合計と同じ考え方）
  const totals = new Map<number, number>()
  const current: Partial<Record<'bureau' | 'team' | 'kan', number>> = {}
  sheet.rows.forEach((r, i) => {
    if (r.level === 'bureau') {
      current.bureau = i
      delete current.team
      delete current.kan
    }
    else if (r.level === 'team') {
      current.team = i
      delete current.kan
    }
    else if (r.level === 'kan') current.kan = i
    const actual = r.lineKey ? byLine.get(r.lineKey)?.actual ?? 0 : 0
    for (const g of Object.values(current)) totals.set(g, (totals.get(g) ?? 0) + actual)
  })
  const totalKey = { bureau: 'bureauActual', team: 'teamActual', kan: 'kanActual' } as const

  const rows: TableRow[] = sheet.rows.map((r, i) => {
    const values = { ...r.values }
    if (r.level && r.level !== 'kou') values[totalKey[r.level]] = totals.get(i) ?? 0
    const a = r.lineKey ? byLine.get(r.lineKey) : undefined
    if (a) {
      const budget = budgetColumn ? r.values[budgetColumn] : null
      values.actual = a.actual
      if (typeof budget === 'number') {
        values.diff = budget - a.actual
        values.rate = budget ? a.actual / budget : null
      }
      values.seqs = a.entries.map(e => e.seq).join(', ')
      if (a.unknown) values.note = `執行額未入力 ${a.unknown}件`
    }
    return { values, fills: r.fills }
  })

  if (outside.length) {
    rows.push({ values: {} }, { values: { c0: '予算にない項目' } })
    for (const o of outside) {
      rows.push({ values: { c0: o.itemNumber, [sheet.nameColumn]: o.name, actual: o.actual, seqs: o.entry.seq } })
    }
  }
  return { name: '決算', columns, rows, preamble: sheet.preamble, sheetStyle: true }
}

function evidenceTable(sheet: BudgetSheet, done: DoneEntry[], origin: string): Table {
  const { byLine, outside } = aggregate(sheet, done)
  /** 明細ごとの証憑（同じファイルは1回だけ） */
  const linksOf = (entries: DoneEntry[]) => {
    const links = entries.flatMap(e => evidenceLinks(e, origin))
    return links.filter((l, i) => links.findIndex(x => x.url === l.url) === i)
  }
  const lineLinks = new Map([...byLine].map(([key, a]) => [key, linksOf(a.entries)]))
  const outsideLinks = outside.map(o => linksOf([o.entry]))
  const count = Math.max(1, ...[...lineLinks.values(), ...outsideLinks].map(l => l.length))

  const columns: TableColumn[] = [
    ...sheet.columns,
    { key: 'actual', header: '執行額', width: SHEET_COLUMN_WIDTH, format: 'currency' },
    { key: 'seqs', header: '申請番号', width: SEQS_WIDTH },
    ...Array.from({ length: count }, (_, i) => ({ key: `ev${i}`, header: `証憑${i + 1}`, width: 30 })),
  ]
  const evidenceValues = (links: Link[]) => Object.fromEntries(links.map((l, i) => [`ev${i}`, l]))

  const rows: TableRow[] = sheet.rows.map((r) => {
    const a = r.lineKey ? byLine.get(r.lineKey) : undefined
    if (!a) return { values: r.values, fills: r.fills }
    return {
      values: { ...r.values, actual: a.actual, seqs: a.entries.map(e => e.seq).join(', '), ...evidenceValues(lineLinks.get(r.lineKey!)!) },
      fills: r.fills,
    }
  })

  if (outside.length) {
    rows.push({ values: {} }, { values: { c0: '予算にない項目' } })
    outside.forEach((o, i) => {
      rows.push({ values: { c0: o.itemNumber, [sheet.nameColumn]: o.name, actual: o.actual, seqs: o.entry.seq, ...evidenceValues(outsideLinks[i]!) } })
    })
  }
  return { name: '証憑', columns, rows, preamble: sheet.preamble, sheetStyle: true }
}

function executionTable(done: DoneEntry[], origin: string): Table {
  const columns: TableColumn[] = [
    { key: 'seq', header: '申請番号', width: 10 },
    { key: 'kind', header: '種別', width: 10 },
    { key: 'createdAt', header: '申請日', width: 12, format: 'date' },
    { key: 'executedAt', header: '執行日', width: 12, format: 'date' },
    { key: 'paymentMethod', header: '執行形態', width: 14 },
    { key: 'department', header: '局', width: 8 },
    { key: 'inCharge', header: '担当', width: 10 },
    { key: 'applicantName', header: '申請者', width: 12 },
    { key: 'itemName', header: '支出項目名', width: 28 },
    { key: 'itemNumber', header: '項目番号', width: 14 },
    { key: 'label', header: '予算明細', width: 40 },
    { key: 'quantity', header: '数量', width: 10 },
    { key: 'vendor', header: '取引先', width: 14 },
    { key: 'budget', header: '予算額', width: 12, format: 'yen' },
    { key: 'actual', header: '執行額', width: 12, format: 'yen' },
    { key: 'entryAmount', header: '申請の金額', width: 12, format: 'yen' },
    { key: 'evidence', header: '証憑', width: 40 },
    { key: 'remark', header: '備考', width: 30 },
  ]
  const rows: TableRow[] = []
  for (const e of done) {
    const base = {
      seq: e.seq,
      kind: e.kind === 'evidence' ? '証憑（立替）' : '執行依頼',
      createdAt: e.createdAt,
      executedAt: e.executedAt,
      paymentMethod: e.paymentMethod ?? e.type,
      department: e.department,
      inCharge: e.inCharge,
      applicantName: e.applicantName,
      itemName: e.itemName,
      entryAmount: e.amount,
      evidence: evidenceCellOf(evidenceLinks(e, origin)),
      remark: e.remark,
    }
    if (!e.items.length) {
      rows.push({ values: { ...base, itemNumber: e.itemNumber, label: '（予算にない項目）', actual: e.amount } })
      continue
    }
    for (const i of e.items) {
      rows.push({
        values: {
          ...base,
          itemNumber: i.itemNumber,
          label: i.label,
          // 実際の数量・取引先（入力がなければ予算のもの）
          quantity: i.actualQuantity ?? i.quantity,
          vendor: i.actualVendor ?? i.vendor,
          budget: i.budgetAmount,
          actual: actualAmountOf(i, e),
        },
      })
    }
  }
  return { name: '執行一覧', columns, rows }
}
