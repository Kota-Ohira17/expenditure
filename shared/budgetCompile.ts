/**
 * 予算の集約（本予算・補正予算）で、画面とサーバーの両方が使う決まりごと。
 * - 明細の査定の状態の名前
 * - 項目番号の付け方（入力中は仮の番号として表示し、確定するときにこの番号で付ける）
 * - 確定するときに作る「支出」シートの行（取り込みと同じ読み方で予算明細にする）
 */

export type BudgetItemStatus = 'draft' | 'submitted' | 'returned' | 'approved'

export const ITEM_STATUS_LABELS: Record<BudgetItemStatus, string> = {
  draft: '未提出',
  submitted: '査定待ち',
  returned: '要修正',
  approved: '承認済み',
}

/** 項目番号を付けるのに要る明細の項目 */
export interface NumberingTeam { id: number, bureauNo: string, bureau: string, team: string, person: string, sortOrder: number }
export interface NumberingItem { id: number | string, teamId: number, kan: string, itemNumber: string, sortOrder: number, deleted: boolean }

const pad2 = (n: number) => String(n).padStart(2, '0')
/** 項目番号の最後の数（out01-04-12 → 12） */
const lastSeq = (no: string) => Number(no.split('-').at(-1)) || 0
/** 項目番号から款の番号（out01-04-12 → out01-04） */
const parentOf = (no: string) => no.split('-').slice(0, -1).join('-')

/** 担当の並び → 明細の並び（予算の表の順）に並べる */
export function sortItems<T extends NumberingItem>(teams: NumberingTeam[], items: T[]) {
  const teamOrder = new Map(teams.map(t => [t.id, t.sortOrder]))
  return [...items].sort((a, b) => (teamOrder.get(a.teamId) ?? 0) - (teamOrder.get(b.teamId) ?? 0) || a.sortOrder - b.sortOrder)
}

/**
 * 項目番号を付ける（削除する明細は除く）。返り値は 明細の id → 項目番号。
 * - keepNumbers（補正予算）：写した明細はもとの番号のまま。新しい明細は、その款の続きの番号。新しい款は、その局の続きの番号
 * - それ以外（本予算）：局ごとに、款を 01 から、款の中の明細を 01 から付け直す
 * 番号の形は「局の番号-款-明細」（例: out01-04-12）。
 */
export function assignItemNumbers(teams: NumberingTeam[], items: NumberingItem[], keepNumbers: boolean) {
  const teamById = new Map(teams.map(t => [t.id, t]))
  const result = new Map<number | string, string>()
  const live = sortItems(teams, items).filter(i => !i.deleted)

  // 局ごとに、款の並び（初めて出てきた順）と、その款の明細
  const bureaus = new Map<string, Map<string, NumberingItem[]>>()
  for (const item of live) {
    const team = teamById.get(item.teamId)
    if (!team) continue
    const kans = bureaus.get(team.bureauNo) ?? new Map<string, NumberingItem[]>()
    const key = `${item.teamId}|${item.kan}`
    kans.set(key, [...(kans.get(key) ?? []), item])
    bureaus.set(team.bureauNo, kans)
  }

  for (const [bureauNo, kans] of bureaus) {
    // 補正予算：今ある款の番号を先に決め、新しい款はその続き
    const kanNos = new Map<string, string>()
    let maxKan = 0
    if (keepNumbers) {
      for (const [key, list] of kans) {
        const numbered = list.find(i => i.itemNumber)
        if (!numbered) continue
        const no = parentOf(numbered.itemNumber)
        kanNos.set(key, no)
        maxKan = Math.max(maxKan, lastSeq(no))
      }
    }
    for (const [key, list] of kans) {
      const kanNo = kanNos.get(key) ?? `${bureauNo}-${pad2(++maxKan)}`
      let maxItem = keepNumbers ? Math.max(0, ...list.filter(i => i.itemNumber).map(i => lastSeq(i.itemNumber))) : 0
      for (const item of list) {
        result.set(item.id, keepNumbers && item.itemNumber ? item.itemNumber : `${kanNo}-${pad2(++maxItem)}`)
      }
    }
  }
  return result
}

/** 確定するときに作る「支出」シートの見出し（取り込みの読み方で、そのまま予算明細になる） */
export const CONFIRM_SHEET_HEADER = [
  '項目番号', '局', '担当', '担当者', '款', '項', '目', '節', '数量', '単価', '予算額', '仕様等', '取引先', 'リンク', '新規', '予算前執行', '執行予定時期', '備考',
]

export interface SheetItem extends NumberingItem {
  kou: string
  moku: string
  setsu: string
  quantity: string
  unitPrice: number | null
  amount: number
  spec: string
  vendor: string
  link: string
  isNew: boolean
  preExecution: boolean
  plannedTiming: string
  remark: string
}

/** 確定した予算を「支出」シートの行（見出し＋局・担当・款の行＋明細の行）にする */
export function confirmSheetRows(teams: NumberingTeam[], items: SheetItem[], numbers: Map<number | string, string>) {
  const teamById = new Map(teams.map(t => [t.id, t]))
  const rows: string[][] = [['支出の部'], CONFIRM_SHEET_HEADER]
  const yen = (n: number | null) => (n == null ? '' : `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`)
  let bureau = ''
  let team = -1
  let kan = ''
  for (const item of sortItems(teams, items).filter(i => !i.deleted)) {
    const t = teamById.get(item.teamId)
    if (!t) continue
    const no = numbers.get(item.id) ?? ''
    if (t.bureauNo + t.bureau !== bureau) {
      bureau = t.bureauNo + t.bureau
      team = -1
      rows.push([t.bureauNo, t.bureau])
    }
    if (t.id !== team) {
      team = t.id
      kan = '\u0000'
      rows.push(['', '', t.team, t.person])
    }
    if (item.kan !== kan) {
      kan = item.kan
      if (item.kan) rows.push([parentOf(no), '', '', '', item.kan])
    }
    rows.push([
      no, '', '', '', '', item.kou, item.moku, item.setsu, item.quantity, yen(item.unitPrice), yen(item.amount),
      item.spec, item.vendor, item.link, item.isNew ? 'TRUE' : 'FALSE', item.preExecution ? 'TRUE' : 'FALSE', item.plannedTiming, item.remark,
    ])
  }
  return rows
}
