import { z } from 'zod'
import { PAPER_RECEIPT, TRANSFER_BANKS } from './constants'

const required = (label: string) => {
  const message = `${label}を入力してください`
  return z.string({ error: message }).trim().min(1, message)
}
const date = z.string({ error: '日付を入力してください' }).regex(/^\d{4}-\d{2}-\d{2}$/, '日付を入力してください')
/** 日付、または日付＋時刻（執行希望日時） */
const dateTime = z.string({ error: '日時を入力してください' }).regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, '日時を入力してください')
/** 局（略称、または略称のない局は予算の局名）。選択肢は取り込んだ予算によって変わるので文字列で受ける */
const bureau = z.string({ error: '局を選んでください' }).trim().min(1, '局を選んでください').max(30)
const yen = z.coerce.number({ error: '金額を数字で入力してください' }).int('整数で入力してください').positive('金額を入力してください')

export const ITEM_NUMBER_PATTERN = /^out-\d{2}(-\d{2}){1,2}$/

/**
 * 執行項目。予算明細から選ぶ（budgetLineKeys、複数可）か、予算にない場合は項目番号を手入力する。
 * どちらか一方が必要（checkItems で検証）。
 */
const items = {
  budgetLineKeys: z.array(z.string()).max(200, '選べる明細は200件までです').default([]),
  /** 明細ごとの実際の執行額（明細の key → 円）。予算額と違うことが多い */
  itemAmounts: z.record(z.string(), z.coerce.number({ error: '執行額は数字で入力してください' }).int('執行額は整数で入力してください')).default({}),
  /** 明細ごとの実際の数量・取引先（明細の key → 文字）。予算と違うことがある */
  itemQuantities: z.record(z.string(), z.string().trim().max(100)).default({}),
  itemVendors: z.record(z.string(), z.string().trim().max(100)).default({}),
  itemNumber: z.string().trim().default(''),
}

/**
 * 台帳で明細ごとの執行額・数量・取引先を直す（entry_items の id → 値。null で未入力に戻す）。
 * 送られてきた項目だけ書き換える。
 */
export const itemsUpdateSchema = z.object({
  amounts: z.record(z.string(), z.number().int('執行額は整数で入力してください').nullable()).default({}),
  quantities: z.record(z.string(), z.string().trim().max(100).nullable()).default({}),
  vendors: z.record(z.string(), z.string().trim().max(100).nullable()).default({}),
})

function checkItems(v: { budgetLineKeys: string[], itemNumber: string, quantity?: string }, ctx: z.RefinementCtx) {
  // 予算から選んだときの数量は明細ごとに入力する（予算の表に数量がある明細だけ必須。サーバーで確認する）
  if (v.budgetLineKeys.length) return
  if (v.quantity === '') ctx.addIssue({ code: 'custom', message: '数量を入力してください', path: ['quantity'] })
  if (!v.itemNumber) ctx.addIssue({ code: 'custom', message: '執行項目を予算から選んでください', path: ['budgetLineKeys'] })
  else if (!ITEM_NUMBER_PATTERN.test(v.itemNumber)) ctx.addIssue({ code: 'custom', message: '項目番号は out-03-02-06 の形式で入力してください', path: ['itemNumber'] })
}

const base = z.object({
  applicantName: required('申請者氏名'),
  department: bureau,
  inCharge: required('担当名'),
  ...items,
  itemName: required('支出項目名'),
  /** 1万円以上の増額のとき、予算委員会の承認を得たか（予算からの変更そのものはサーバーで金額から決める） */
  budgetCommitteeApproved: z.boolean().default(false),
  remark: z.string().trim().default(''),
})

export const bankAccountSchema = z.object({
  bankName: required('金融機関名'),
  branchName: required('支店名'),
  accountType: required('振込先の口座種別'), // 普通 / 当座 / その他（自由記述）
  accountNumber: z.string().regex(/^\d{1,8}$/, '口座番号は数字で入力してください'),
  accountName: required('口座名義'),
}, { error: '振込先の口座情報を入力してください' })

export const executionRequestSchema = z.discriminatedUnion('type', [
  base.extend({
    type: z.literal('振込'),
    deadline: date,
    amount: yen,
    bank: bankAccountSchema,
  }),
  base.extend({
    type: z.literal('発注'),
    site: required('通販サイト'),
    url: required('商品ページのリンク'), // 複数のリンクを改行で書いてよい
    quantity: z.string().trim().default(''), // 予算にない項目のときは必須（checkItems）
    deadline: date,
    deliveryPlace: required('配達場所'),
  }),
  base.extend({
    type: z.literal('立替'),
    amount: yen,
    purchase: required('購入先'),
    paperReceipt: z.enum(PAPER_RECEIPT, { error: '紙媒体の領収証の有無を選んでください' }),
    deadline: date, // 立替予定日
  }),
  base.extend({
    type: z.enum(['現金執行', 'カード決済', 'その他']),
    /** 執行形態で「その他」を選んだときの中身 */
    otherMethod: z.string().trim().default(''),
    amount: yen,
    deadline: dateTime, // 執行希望日時
    details: required('詳細'),
  }),
]).superRefine((v, ctx) => {
  checkItems(v, ctx)
  if (v.type === 'その他' && !v.otherMethod) {
    ctx.addIssue({ code: 'custom', message: '執行形態（その他）の内容を入力してください', path: ['otherMethod'] })
  }
})
export type ExecutionRequestInput = z.input<typeof executionRequestSchema>

export const evidenceSchema = z.object({
  advancedName: required('立替者氏名'),
  department: bureau,
  inCharge: required('担当名'),
  ...items,
  itemName: required('支出項目名（内訳）'),
  quantity: z.string().trim().default(''), // 予算にない項目のときは必須（checkItems）
  kindOfEvidence: z.enum(['領収書', 'レシート', '見積書', 'その他']),
  payDate: date,
  amount: yen,
  refundTiming: z.enum(['委員返金と同時', 'できる限り早く']),
}).superRefine(checkItems)
export type EvidenceInput = z.input<typeof evidenceSchema>

export const executeSchema = z.object({
  done: z.boolean(),
  /** 振込のときに使った口座 */
  bank: z.enum(TRANSFER_BANKS).optional(),
  /** 発注のとき確定した金額・数量 */
  amount: yen.optional(),
  quantity: z.string().trim().optional(),
})

/** 自分の通知設定（Slack の DM） */
export const notificationSettingsSchema = z.object({
  dmOnCreated: z.boolean(),
  dmOnExecuted: z.boolean(),
  /** Slack に登録しているメール（ECC のメールと同じなら空） */
  slackEmail: z.union([z.literal(''), z.string().trim().toLowerCase().pipe(z.email('Slack のメールアドレスの形式で入力してください'))]).default(''),
})
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>
