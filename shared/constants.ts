export const PAYMENT_TYPES = ['振込', '発注', '立替', '現金執行', 'カード決済', 'その他'] as const
export type PaymentType = (typeof PAYMENT_TYPES)[number]

// ---- 以下、Google フォーム「予算執行依頼フォーム」の選択肢に合わせたもの ----

/** 局（フォームの略称）と、本予算スプレッドシートの局名 */
export const BUREAUS = [
  { code: 'JIM', name: '事務局' },
  { code: 'ZAI', name: '財務局' },
  { code: 'SSK', name: '組織局' },
  { code: 'SOM', name: '総務局' },
  { code: 'EVE', name: '企画局' },
  { code: 'PR', name: '広報局' },
  { code: 'NT', name: '渉外局' },
  { code: 'ECO', name: '環境局' },
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
export const REFUND_TIMINGS = ['委員返金と同時', 'できる限り早く'] as const

export const TRANSFER_BANKS = ['SMBC', 'ゆうちょ'] as const

/** Vercel の関数は 4.5MB までしか受け取れないので、それより少し小さくする */
export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024

/** 一覧画面のビュー。旧スプレッドシートのシートに対応する */
export const VIEWS = {
  number: '番号順',
  deadline: '期限順',
  pending: '執行待ち',
  noEvidence: '証憑未提出',
  振込: '振込',
  発注: '発注',
  立替: '立替',
  現金執行: '現金執行',
  カード決済: 'カード決済',
  その他: 'その他',
} as const
export type ViewKey = keyof typeof VIEWS
