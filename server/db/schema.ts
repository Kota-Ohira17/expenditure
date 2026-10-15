import { blob, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { PAYMENT_TYPES } from '../../shared/constants'
import { ROLES } from '../../shared/roles'

/**
 * 添付ファイル（請求書・証憑）。サーバーレス環境（Vercel）ではディスクに保存できないので DB に持つ。
 * 旧GASの folderTable（Drive フォルダIDのハードコード）は不要になり、項目番号で検索できる。
 */
export const attachments = sqliteTable('attachments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  fileName: text('file_name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

/**
 * 執行依頼と証憑提出をまとめて1テーブルで持つ。
 * 旧GASでは「形態別シート・番号順・申請順」に同じ行をコピーしていたが、
 * ここでは1行だけ保存し、一覧はクエリ（ビュー）で切り替える。
 */
export const entries = sqliteTable('entries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 表示用の通し番号（執行依頼: E-001 / 証憑: R-001） */
  seq: text('seq').notNull().unique(),
  kind: text('kind', { enum: ['execution', 'evidence'] }).notNull(),
  type: text('type', { enum: PAYMENT_TYPES }).notNull(),
  status: text('status', { enum: ['pending', 'done'] }).notNull().default('pending'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  applicantEmail: text('applicant_email').notNull(),
  applicantName: text('applicant_name').notNull(),
  department: text('department').notNull(),
  inCharge: text('in_charge').notNull(),
  itemNumber: text('item_number').notNull(),
  itemName: text('item_name').notNull(),
  amount: integer('amount'),
  quantity: text('quantity'),
  /** 振込期限・必要日・立替予定日・執行希望日・(証憑)立替日 */
  deadline: text('deadline'),
  remark: text('remark').notNull().default(''),
  /** 形態ごとの追加項目。口座情報は details.bank に入り、財務局長・管理者以外には返さない */
  details: text('details', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  attachmentId: integer('attachment_id').references(() => attachments.id),
  /** 執行時に確定する執行形態（振込（SMBC）/ 口座引落 / 立替 など） */
  paymentMethod: text('payment_method'),
  executedAt: integer('executed_at', { mode: 'timestamp_ms' }),
  executedBy: text('executed_by'),
})

export const counters = sqliteTable('counters', {
  name: text('name').primaryKey(),
  value: integer('value').notNull(),
})

export type Entry = typeof entries.$inferSelect

/**
 * 本予算または補正予算の「支出」シートの明細（金額のある行）。財務局長・管理者が CSV を取り込むたびに全件入れ替える。
 * key は「項目番号|名前|数量」で、取り込み直しても同じ明細なら同じ key になる。
 */
export const budgetLines = sqliteTable('budget_lines', {
  key: text('key').primaryKey(),
  sortOrder: integer('sort_order').notNull(),
  itemNumber: text('item_number').notNull(),
  bureauNo: text('bureau_no').notNull().default(''),
  bureau: text('bureau').notNull().default(''),
  team: text('team').notNull().default(''),
  // スプレッドシートと同じ表を組み立てるための階層。level はこの明細の行がどの階層の名前を持っていたか
  kanNo: text('kan_no').notNull().default(''),
  kan: text('kan').notNull().default(''),
  kouNo: text('kou_no').notNull().default(''),
  kou: text('kou').notNull().default(''),
  moku: text('moku').notNull().default(''),
  setsu: text('setsu').notNull().default(''),
  level: text('level', { enum: ['kan', 'kou', 'moku', 'setsu', 'none'] }).notNull().default('none'),
  /** 款 / 項 / 目 / 節 を「 / 」でつないだ表示名 */
  label: text('label').notNull(),
  quantity: text('quantity').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  budgetAmount: integer('budget_amount').notNull(),
  link: text('link').notNull().default(''),
  plannedTiming: text('planned_timing').notNull().default(''),
  remark: text('remark').notNull().default(''),
  importedAt: integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
  /** 取り込んだのが本予算か補正予算か（取り込みごとに全明細で同じ値） */
  budgetKind: text('budget_kind', { enum: ['本予算', '補正予算'] }).notNull().default('本予算'),
})

/**
 * 申請と予算明細の対応（1申請に複数明細）。予算を取り込み直しても過去の申請が崩れないよう、
 * 申請時点の明細の内容をコピーして持つ。
 */
export const entryItems = sqliteTable('entry_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entryId: integer('entry_id').notNull().references(() => entries.id),
  lineKey: text('line_key').notNull(),
  itemNumber: text('item_number').notNull(),
  label: text('label').notNull(),
  /** 予算での数量・取引先・金額（申請時点のコピー） */
  quantity: text('quantity').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  budgetAmount: integer('budget_amount').notNull(),
  /** 実際の数量・取引先・執行額（予算から変わることが多い）。未入力なら null */
  actualQuantity: text('actual_quantity'),
  actualVendor: text('actual_vendor'),
  actualAmount: integer('actual_amount'),
})

export type BudgetLine = typeof budgetLines.$inferSelect
export type EntryItem = typeof entryItems.$inferSelect

/**
 * ユーザーと権限。財務局長・管理者が画面で先に登録するか、初回ログイン時に「一般」で作られる。
 * 環境変数 NUXT_ADMIN_EMAILS のユーザーはログインのたびに管理者に戻る（最初の管理者を作るため）。
 */
export const users = sqliteTable('users', {
  email: text('email').primaryKey(),
  name: text('name').notNull(),
  role: text('role', { enum: ROLES }).notNull().default('member'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** 財務局長・管理者が先に登録して、まだログインしていない人は null */
  lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
  /** Slack の DM を受け取るか（自分の申請を受け付けたとき / 対応済みになったとき）。本人が通知設定で変える */
  dmOnCreated: integer('dm_on_created', { mode: 'boolean' }).notNull().default(true),
  dmOnExecuted: integer('dm_on_executed', { mode: 'boolean' }).notNull().default(true),
  /** Slack に登録しているメール（ECC のメールと違う人だけ）。空なら ECC のメールで Slack のユーザーを探す */
  slackEmail: text('slack_email').notNull().default(''),
})

export type User = typeof users.$inferSelect
