import ExcelJS from 'exceljs'
import type { Table } from '../utils/settlement'

/** 決算シート（Excel）。中身は server/utils/settlement.ts（スプレッドシート出力と共通） */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'exportSettlement')
  const tables = await buildSettlementTables(getRequestURL(event).origin)

  const wb = new ExcelJS.Workbook()
  wb.creator = '財務管理システム'
  wb.created = new Date()
  for (const t of tables) writeTable(wb, t)

  const buffer = await wb.xlsx.writeBuffer()
  const stamp = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' }).replaceAll('-', '')
  setResponseHeaders(event, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="settlement_${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(`決算_${stamp}.xlsx`)}`,
    'Cache-Control': 'private, no-store',
  })
  return Buffer.from(buffer)
})

const NUM_FMT = { yen: '#,##0;[Red]-#,##0', currency: '[$¥-411]#,##0', rate: '0.0%', date: 'yyyy/mm/dd' } as const
/** 元の予算シートと同じフォント */
const SHEET_FONT = { name: 'Arial', size: 10 }

function writeTable(wb: ExcelJS.Workbook, table: Table) {
  const preamble = table.preamble ?? []
  const headerRow = preamble.length + 1
  const ws = wb.addWorksheet(table.name, { views: [{ state: 'frozen', ySplit: headerRow }] })
  ws.columns = table.columns.map(c => ({
    key: c.key,
    width: c.width,
    style: c.format && c.format !== 'check' ? { numFmt: NUM_FMT[c.format] } : undefined,
  }))
  const font = (extra: Partial<ExcelJS.Font> = {}) => (table.sheetStyle ? { ...SHEET_FONT, ...extra } : extra)

  // 見出しより上の行（「支出の部」）は、元のシートと同じく太字・12pt
  for (const cells of preamble) {
    const r = ws.addRow(cells)
    r.font = font({ bold: true, size: 12 })
  }
  const head = ws.addRow(table.columns.map(c => c.header))
  head.font = font({ bold: !table.sheetStyle })
  table.columns.forEach((_, i) => {
    head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${HEADER_FILL}` } }
  })
  if (!table.sheetStyle) head.border = { bottom: { style: 'thin' } }

  for (const row of table.rows) {
    const values = Object.fromEntries(Object.entries(row.values).map(([k, v]) => [
      k,
      v && typeof v === 'object' && 'url' in v ? { text: v.text, hyperlink: v.url } : v,
    ]))
    const r = ws.addRow(values)
    r.font = font({ bold: row.bold })
    for (const f of row.fills ?? []) {
      for (let ci = f.from; ci < f.to; ci++) {
        r.getCell(ci + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${f.color}` } }
      }
    }
    if (row.topBorder) r.border = { top: { style: 'double' } }
    table.columns.forEach((c, i) => {
      const v = row.values[c.key]
      // リンクのセルは青字・下線
      if (v && typeof v === 'object' && 'url' in v) r.getCell(i + 1).font = font({ color: { argb: 'FF0B6BCB' }, underline: true })
      // TRUE・FALSE は元のシートと同じく中央に
      if (c.format === 'check') r.getCell(i + 1).alignment = { horizontal: 'center' }
    })
  }
  // 元の予算シートと同じ形の表にはフィルタを付けない
  if (!table.sheetStyle) ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: headerRow, column: table.columns.length } }
}
