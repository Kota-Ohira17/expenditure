export const PAYMENT_TYPES = ['振込', '発注', '立替', '現金執行', 'カード決済', 'その他'] as const
export type PaymentType = (typeof PAYMENT_TYPES)[number]
/** entries.type に入る値。収入の記録（kind=income）は「収入」 */
export const ENTRY_TYPES = [...PAYMENT_TYPES, '収入'] as const

// ---- 以下、Google フォーム「予算執行依頼フォーム」の選択肢に合わせたもの ----

/** 局（フォームの略称）と、本予算スプレッドシートの局名 */
export const BUREAUS = [
  { code: 'JIM', name: '事務局' },
  { code: 'ZAI', name: '財務局' },
  { code: 'SSK', name: '組織局' },
  { code: 'EVE', name: '企画局' },
  { code: 'PR', name: '広報局' },
  { code: 'SYS', name: 'システム局' },
] as const

/**
 * 予算の局名 → 申請に記録する局の値。略称が分かる局は略称（例: 財務局 → ZAI）、分からない局は局名のまま。
 * 局の選択肢は取り込んだ予算の局から作る（BureauField）。予算が変わって局が増減しても選べるように。
 */
export function bureauCodeOf(name: string) {
  return BUREAUS.find(b => b.name === name)?.code ?? name
}

/** 申請に記録した局の値（略称または局名） → 予算の局名 */
export function bureauNameOf(value: string) {
  return BUREAUS.find(b => b.code === value)?.name ?? value
}

/** 選択肢の表示（例: 「ZAI（財務局）」、略称のない局は局名だけ） */
export function bureauLabelOf(value: string) {
  const known = BUREAUS.find(b => b.code === value)
  return known ? `${known.code}（${known.name}）` : value
}

/** 執行形態の1段目（4つ目を選ぶと2段目で 現金執行 / カード決済 / その他 を選ぶ） */
export const METHOD_GROUPS = ['振込', '発注', '立替', '現金執行・カード決済（デビットカード）・その他'] as const
export const OTHER_METHODS = [
  { type: '現金執行', label: '現金執行' },
  { type: 'カード決済', label: 'カード決済（デビットカード）' },
  { type: 'その他', label: 'その他' },
] as const

/** 予算の期。1年ごとに変わるが、今は第100期で固定 */
export const BUDGET_TERM = '第100期'

export const BUDGET_CHANGES = ['大幅な増額（1万円以上）', '増額（1万円未満）', '減額', '変動なし'] as const
export type BudgetChange = (typeof BUDGET_CHANGES)[number]

/** 執行額と予算額の差から「予算からの変更」を決める（フォームの基準: 1万円以上の増額は「大幅な増額」） */
export function budgetChangeOf(actual: number, budget: number): BudgetChange {
  const d = actual - budget
  if (d >= 10000) return '大幅な増額（1万円以上）'
  if (d > 0) return '増額（1万円未満）'
  if (d < 0) return '減額'
  return '変動なし'
}

/** 1万円以上の増額は役員会の承認が要る */
export const LARGE_INCREASE: BudgetChange = '大幅な増額（1万円以上）'

/**
 * 執行額を入力した明細のうち、予算額と違うもの（予算の変更を申請するかを聞く対象）。
 * 申請フォームの表示とサーバーの両方で使う。
 */
export function changedItems<L extends { key: string, budgetAmount: number }>(
  lines: L[],
  amounts: Record<string, number | '' | undefined>,
) {
  return lines.flatMap((l) => {
    const actual = amounts[l.key]
    return typeof actual === 'number' && actual !== l.budgetAmount ? [{ line: l, actual }] : []
  })
}

/**
 * 選んだ予算明細の予算額の合計と、明細ごとの執行額（未入力なら予算額）の合計から「予算からの変更」を決める。
 * 申請フォームの表示とサーバーでの保存の両方で使う。
 */
export function budgetChangeOfItems(
  lines: { key: string, budgetAmount: number }[],
  amounts: Record<string, number | '' | undefined>,
) {
  const budget = lines.reduce((s, l) => s + l.budgetAmount, 0)
  const actual = lines.reduce((s, l) => s + (typeof amounts[l.key] === 'number' ? amounts[l.key] as number : l.budgetAmount), 0)
  return { budget, actual, change: budgetChangeOf(actual, budget) }
}

export const ACCOUNT_TYPES = ['普通', '当座'] as const
export const ONLINE_SITES = ['ASKUL', 'モノタロウ', 'Amazon', '楽天', 'アースダンボール'] as const
export const DELIVERY_PLACES = ['駒場（A103）', '本郷（6号）'] as const
export const PAPER_RECEIPT = ['有り', '無し'] as const
/** 台帳から付ける証憑の種類と、立替の返金時期 */
export const EVIDENCE_KINDS = ['領収書', '見積書', 'その他'] as const
/** 収入の受け取り方と、収入の証憑の種類 */
export const INCOME_METHODS = ['振込', '現金', 'その他'] as const
export const INCOME_FILE_KINDS = ['入金の明細', '領収書の控え', '契約書・請求書', 'その他'] as const
export const REFUND_TIMINGS = ['委員返金と同時', 'できる限り早く'] as const

export const TRANSFER_BANKS = ['SMBC', 'ゆうちょ'] as const

/** 出納帳で残高を見る口座（現金も1つの口座として扱う） */
export const CASH_ACCOUNTS = ['SMBC', 'ゆうちょ', 'MUFG', '現金'] as const
export type CashAccount = (typeof CASH_ACCOUNTS)[number]
/** 収入を振込で受け取る口座 */
export const BANK_ACCOUNTS = ['SMBC', 'ゆうちょ', 'MUFG'] as const
/** 複式簿記の勘定科目の区分。資産・支出は借方、負債・純資産・収入は貸方に残高が出る */
export const ACCOUNT_KINDS = ['資産', '負債', '純資産', '収入', '支出'] as const
export type AccountKind = (typeof ACCOUNT_KINDS)[number]
/** 口座の勘定科目名（出納帳の口座 → 帳簿の科目） */
export const CASH_ACCOUNT_TITLES: Record<CashAccount, string> = { SMBC: '普通預金（SMBC）', ゆうちょ: '普通預金（ゆうちょ）', MUFG: '普通預金（MUFG）', 現金: '現金' }

/** 出納帳に手で書く記録（期首の残高・口座間の移動・調整・残高の照合） */
export const CASHBOOK_KINDS = { opening: '期首の残高', transfer: '口座間の移動', adjust: '調整', check: '残高の照合' } as const
export type CashbookKind = keyof typeof CASHBOOK_KINDS

/** Vercel の関数は 4.5MB までしか受け取れないので、それより少し小さくする */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

/** 一覧画面のビュー。旧スプレッドシートのシートに対応する */
export const VIEWS = {
  number: '番号順',
  deadline: '期限順',
  pending: '執行待ち',
  noEvidence: '証憑未提出',
  evidenceCheck: '証憑確認待ち',
  振込: '振込',
  発注: '発注',
  立替: '立替',
  現金執行: '現金執行',
  カード決済: 'カード決済',
  その他: 'その他',
} as const
export type ViewKey = keyof typeof VIEWS
