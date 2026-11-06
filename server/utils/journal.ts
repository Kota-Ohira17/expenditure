import { and, asc, eq, ne } from 'drizzle-orm'
import type { AccountKind } from '../../shared/constants'
import { CASH_ACCOUNT_TITLES } from '../../shared/constants'
import { accountOfIncome, accountOfPayment } from '../../shared/cashbook'

/**
 * 複式簿記の帳簿（現金主義：お金が動いたときに仕訳する）。
 * 執行済みの申請・確認済みの収入・出納帳の記録（期首の残高・移動・調整）から仕訳を作り、手で入れた仕訳を足す。
 * 収入・支出の科目は予算の款。口座は「普通預金（SMBC）」などの資産の科目。
 * 口座や金額が決まらない執行・収入は仕訳に入れない（出納帳の「出納帳に入っていない記録」と同じ）。
 */

export interface JournalLine {
  account: string
  kind: AccountKind
  debit: number
  credit: number
}

export interface Journal {
  /** 並べ替え・画面の key（e12 / i3 / r5 / m2） */
  key: string
  date: string
  source: 'execution' | 'income' | 'opening' | 'transfer' | 'adjust' | 'manual'
  /** 執行・収入の番号（E-001・I-001） */
  seq: string | null
  /** 手で入れた仕訳の id（取り消しに使う） */
  manualId: number | null
  memo: string
  lines: JournalLine[]
}

/** 予算にない支出・収入で款が分からないときの科目 */
const UNKNOWN_EXPENSE = '予算にない支出'
const UNKNOWN_INCOME = '予算にない収入'
/** 出納帳の調整（利息・手数料など）の科目 */
const ADJUST_GAIN = '雑収入'
const ADJUST_LOSS = '雑費'
/** 期首の残高の相手の科目 */
const OPENING = '前期繰越'

/** 同じ日の中の並び（期首の残高 → 収入 → 移動・調整 → 執行 → 手で入れた仕訳） */
const ORDER: Record<Journal['source'], number> = { opening: 0, income: 1, transfer: 2, adjust: 2, execution: 3, manual: 4 }

/** 借方か貸方の1行 */
const debit = (account: string, kind: AccountKind, amount: number): JournalLine => ({ account, kind, debit: amount, credit: 0 })
const credit = (account: string, kind: AccountKind, amount: number): JournalLine => ({ account, kind, debit: 0, credit: amount })

/** 同じ科目の行をまとめる（借方・貸方それぞれ） */
function merge(lines: JournalLine[]) {
  const map = new Map<string, JournalLine>()
  for (const l of lines) {
    const key = `${l.debit ? 'd' : 'c'}|${l.account}`
    const m = map.get(key)
    if (m) {
      m.debit += l.debit
      m.credit += l.credit
    }
    else map.set(key, { ...l })
  }
  return [...map.values()]
}

const pathKan = (details: unknown) => (details as { budgetPath?: { kan?: string } } | null)?.budgetPath?.kan?.trim() || ''

export async function buildJournals() {
  const db = useDb()
  const [done, incomes, records, manuals, budgetLines] = await Promise.all([
    db.select().from(schema.entries).where(and(eq(schema.entries.status, 'done'), ne(schema.entries.kind, 'income'))).then(withItems),
    listIncomes(eq(schema.entries.status, 'done')),
    db.select().from(schema.cashbookRecords).orderBy(asc(schema.cashbookRecords.date), asc(schema.cashbookRecords.id)),
    db.select().from(schema.manualJournals).orderBy(asc(schema.manualJournals.date), asc(schema.manualJournals.id)),
    db.select({ key: schema.budgetLines.key, kan: schema.budgetLines.kan }).from(schema.budgetLines),
  ])
  const kanOf = new Map(budgetLines.map(l => [l.key, l.kan]))
  const journals: Journal[] = []

  for (const e of done) {
    const amount = executedAmount(e)
    const account = accountOfPayment(e.paymentMethod)
    if (!e.executedAt || amount == null || !account) continue
    // 支出の科目は明細の款。明細ごとの執行額がすべて分かれば款ごとに分け、分からなければ最初の明細の款にまとめる
    const fallback = e.items.length ? (kanOf.get(e.items[0]!.lineKey) || UNKNOWN_EXPENSE) : (pathKan(e.details) || (e.itemNumber === '予算前執行' ? '予算前執行' : UNKNOWN_EXPENSE))
    const actuals = e.items.map(i => actualAmountOf(i, e))
    const byItems = e.items.length > 0 && actuals.every(a => a != null) && actuals.reduce((s, a) => s + a!, 0) === amount
    const expense = byItems
      ? e.items.map((i, n) => debit(kanOf.get(i.lineKey) || fallback, '支出', actuals[n]!))
      : [debit(fallback, '支出', amount)]
    journals.push({
      key: `e${e.id}`, date: dateInJapan(e.executedAt), source: 'execution', seq: e.seq, manualId: null,
      memo: `${e.itemName}（${e.department}/${e.inCharge}）`,
      lines: merge([...expense, credit(CASH_ACCOUNT_TITLES[account], '資産', amount)]),
    })
  }

  for (const i of incomes) {
    const account = accountOfIncome(i.method, i.account)
    if (!account) continue
    const kan = (i.lineKey && kanOf.get(i.lineKey)) || pathKan(i.details) || UNKNOWN_INCOME
    journals.push({
      key: `i${i.id}`, date: i.receivedOn, source: 'income', seq: i.seq, manualId: null,
      memo: `${i.itemName}${i.payer ? `（${i.payer}）` : ''}`,
      lines: [debit(CASH_ACCOUNT_TITLES[account], '資産', i.amount), credit(kan, '収入', i.amount)],
    })
  }

  for (const r of records) {
    const base = { key: `r${r.id}`, date: r.date, seq: null, manualId: null }
    const cash = CASH_ACCOUNT_TITLES[r.account]
    if (r.kind === 'opening' && r.amount > 0) {
      journals.push({ ...base, source: 'opening', memo: r.memo || '期首の残高', lines: [debit(cash, '資産', r.amount), credit(OPENING, '純資産', r.amount)] })
    }
    if (r.kind === 'transfer' && r.toAccount) {
      journals.push({ ...base, source: 'transfer', memo: `${r.account} → ${r.toAccount}${r.memo ? `（${r.memo}）` : ''}`, lines: [debit(CASH_ACCOUNT_TITLES[r.toAccount], '資産', r.amount), credit(cash, '資産', r.amount)] })
    }
    if (r.kind === 'adjust') {
      journals.push({
        ...base, source: 'adjust', memo: r.memo,
        lines: r.amount > 0
          ? [debit(cash, '資産', r.amount), credit(ADJUST_GAIN, '収入', r.amount)]
          : [debit(ADJUST_LOSS, '支出', -r.amount), credit(cash, '資産', -r.amount)],
      })
    }
  }

  for (const m of manuals) {
    journals.push({ key: `m${m.id}`, date: m.date, source: 'manual', seq: null, manualId: m.id, memo: m.memo, lines: m.lines })
  }

  journals.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.source] - ORDER[b.source] || a.key.localeCompare(b.key, undefined, { numeric: true }))
  return journals
}

/** 借方に残高が出る区分か（資産・支出） */
export const isDebitKind = (kind: AccountKind) => kind === '資産' || kind === '支出'

/**
 * 仕訳帳・総勘定元帳・試算表を出す。
 * 元帳は科目ごとの行と残高（資産・支出は借方−貸方、負債・純資産・収入は貸方−借方）、試算表は科目ごとの借方・貸方の合計と残高。
 */
export async function buildLedger() {
  const journals = await buildJournals()
  const accounts = new Map<string, { account: string, kind: AccountKind, debit: number, credit: number, rows: { key: string, date: string, memo: string, seq: string | null, debit: number, credit: number, balance: number }[] }>()
  for (const j of journals) {
    for (const l of j.lines) {
      const a = accounts.get(l.account) ?? { account: l.account, kind: l.kind, debit: 0, credit: 0, rows: [] }
      a.debit += l.debit
      a.credit += l.credit
      const balance = isDebitKind(a.kind) ? a.debit - a.credit : a.credit - a.debit
      a.rows.push({ key: j.key, date: j.date, memo: j.memo, seq: j.seq, debit: l.debit, credit: l.credit, balance })
      accounts.set(l.account, a)
    }
  }
  const order = ['資産', '負債', '純資産', '収入', '支出']
  const ledger = [...accounts.values()]
    .map(a => ({ ...a, balance: isDebitKind(a.kind) ? a.debit - a.credit : a.credit - a.debit }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.account.localeCompare(b.account, 'ja'))
  const totals = { debit: ledger.reduce((s, a) => s + a.debit, 0), credit: ledger.reduce((s, a) => s + a.credit, 0) }
  return { journals, ledger, totals }
}
