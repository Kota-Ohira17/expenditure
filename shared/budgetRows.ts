/**
 * 予算明細を、本予算スプレッドシート「支出」シートと同じ並び（見出しの行＋明細の行）に組み立てる。
 * 画面の予算表（BudgetTable）と、決算シートの出力（/api/settlement.xlsx）の両方で使う。
 */

export const SHEET_COLUMNS = ['number', 'bureau', 'team', 'kan', 'kou', 'moku', 'setsu'] as const
export type SheetCol = (typeof SHEET_COLUMNS)[number]

export const SHEET_COLUMN_LABELS: Record<SheetCol, string> = {
  number: '項目番号',
  bureau: '局',
  team: '担当',
  kan: '款',
  kou: '項',
  moku: '目',
  setsu: '節',
}

export const LEVELS = ['bureau', 'team', 'kan', 'kou', 'moku', 'setsu'] as const
export type Level = (typeof LEVELS)[number]

/** まとめて選べる・小計を出す見出しの階層（局・担当は範囲が広すぎるので対象外） */
export const GROUP_LEVELS: readonly Level[] = ['kan', 'kou', 'moku', 'setsu']

export const LEVEL_LABELS: Partial<Record<Level, string>> = { kan: '款', kou: '項', moku: '目', setsu: '節' }

/** 組み立てに必要な明細の項目 */
export interface SheetLine {
  key: string
  /** 明細の項目番号（明細の行に出す） */
  itemNumber?: string
  bureauNo: string
  bureau: string
  team: string
  kanNo: string
  kan: string
  kouNo: string
  kou: string
  moku: string
  setsu: string
  level: 'kan' | 'kou' | 'moku' | 'setsu' | 'none'
}

export interface SheetRow<L extends SheetLine> {
  id: string
  kind: 'group' | 'line'
  level: Level
  cells: Partial<Record<SheetCol, string>>
  line?: L
  /** 見出しの行: 局から自分までの階層をつないだもの（同じ見出しの判定に使う） */
  path?: string
}

function value(l: SheetLine, level: Level) {
  switch (level) {
    case 'bureau': return l.bureau ? `${l.bureauNo}|${l.bureau}` : ''
    case 'team': return l.team
    case 'kan': return l.kan ? `${l.kanNo}|${l.kan}` : ''
    // 項は名前で見分ける（項の番号は明細ごとに違うことがあり、同じ項が別々に分かれてしまうため）
    case 'kou': return l.kou
    case 'moku': return l.moku
    case 'setsu': return l.setsu
  }
}

/**
 * 見出しの行。項目番号は明細ごとに付いているので、番号は局・款の見出しだけに出す
 * （項・目・節の見出しに番号を出すと、その下の最初の明細の番号が見出しに付いてずれて見える）。
 */
function headerCells(l: SheetLine, level: Level): SheetRow<SheetLine>['cells'] {
  switch (level) {
    case 'bureau': return { number: l.bureauNo, bureau: l.bureau }
    case 'team': return { team: l.team }
    case 'kan': return { number: l.kanNo, kan: l.kan }
    case 'kou': return { kou: l.kou }
    case 'moku': return { moku: l.moku }
    case 'setsu': return { setsu: l.setsu }
  }
}

const NAME_LEVELS = ['kou', 'moku', 'setsu'] as const

/**
 * 明細の行そのもの。番号はその明細の項目番号。
 * 名前は、見出しの行を出さなかった階層（その明細だけの項・目）から、その明細の階層までを同じ行に出す。
 */
function lineCells(l: SheetLine, inline: Set<Level>): SheetRow<SheetLine>['cells'] {
  const number = l.itemNumber || (l.level === 'kan' ? l.kanNo : l.kouNo)
  if (l.level === 'kan') return { number, kan: l.kan }
  const cells: SheetRow<SheetLine>['cells'] = { number }
  for (const level of NAME_LEVELS) {
    if (level === l.level || inline.has(level)) cells[level] = l[level]
    if (level === l.level) break
  }
  return cells
}

/**
 * 見出しの行と明細の行を並べ、見出しごとにその下（孫以下も含む）の明細の key を返す。
 * lines は予算の並び順（sortOrder）で渡すこと。
 */
export function buildSheetRows<L extends SheetLine>(lines: readonly L[]) {
  const rows: SheetRow<L>[] = []
  const descendants = new Map<string, string[]>()
  const prefixesOf = (l: L) => {
    const prefixes: string[] = []
    LEVELS.forEach((level, i) => { prefixes[i] = `${prefixes[i - 1] ?? ''}/${value(l, level)}` })
    return prefixes
  }
  // 項・目・節の見出しは、その下に明細が2件以上あるときだけ出す（1件だけなら明細の行に名前を並べる）
  const count = new Map<string, number>()
  for (const l of lines) {
    const own = l.level === 'none' ? LEVELS.length : LEVELS.indexOf(l.level)
    prefixesOf(l).forEach((p, i) => { if (i < own && value(l, LEVELS[i]!)) count.set(p, (count.get(p) ?? 0) + 1) })
  }
  let prev: string[] = []
  for (const l of lines) {
    // この明細より上の階層（数量だけの行なら節まで）を見出しとして出す
    const own = l.level === 'none' ? LEVELS.length : LEVELS.indexOf(l.level)
    const prefixes = prefixesOf(l)
    const inline = new Set<Level>()
    let changed = false
    LEVELS.forEach((level, i) => {
      if (i >= own || !value(l, level)) return
      if (GROUP_LEVELS.includes(level)) descendants.set(prefixes[i]!, [...(descendants.get(prefixes[i]!) ?? []), l.key])
      if ((NAME_LEVELS as readonly Level[]).includes(level) && (count.get(prefixes[i]!) ?? 0) < 2) {
        inline.add(level)
        return
      }
      if (!changed && prefixes[i] === prev[i]) return
      changed = true
      rows.push({ id: `g${rows.length}`, kind: 'group', level, cells: headerCells(l, level), path: prefixes[i] })
    })
    rows.push({ id: l.key, kind: 'line', level: l.level === 'none' ? 'setsu' : l.level, cells: lineCells(l, inline), line: l })
    prev = prefixes
  }
  return { rows, descendants }
}
