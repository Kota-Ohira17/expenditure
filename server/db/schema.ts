import { blob, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
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
 * 取り込んだ「支出」シートの行をそのまま（見出しより上の行・見出しの行・金額のない見出しの行も含めて）持つ。
 * 決算シートを元のシートと同じ形で出力するために使う。予算を取り込むたびに入れ替える。
 */
export const budgetSheetRows = sqliteTable('budget_sheet_rows', {
  sortOrder: integer('sort_order').primaryKey(),
  /** preamble: 見出しより上の行（「支出の部」）／ header: 見出しの行／ row: それより下の行 */
  role: text('role', { enum: ['preamble', 'header', 'row'] }).notNull(),
  /** セルの文字列の配列（JSON） */
  cells: text('cells', { mode: 'json' }).$type<string[]>().notNull(),
  /** この行が明細（金額の入った行）なら、その明細の key */
  lineKey: text('line_key'),
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
 * 申請に付けた証憑（領収書など）。台帳から、誰でもどの申請にも付けられる。
 * 1つの申請に複数付けられる（立替で領収書が何枚もある場合など）。
 */
export const evidenceFiles = sqliteTable('evidence_files', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  entryId: integer('entry_id').notNull().references(() => entries.id),
  attachmentId: integer('attachment_id').notNull().references(() => attachments.id),
  /** 領収書 / 見積書 / その他（以前に付けたものには「レシート」もある） */
  kind: text('kind').notNull(),
  /** 証憑の金額・日付（立替なら立替金額・立替日）。分からなければ null */
  amount: integer('amount'),
  date: text('date'),
  uploadedBy: text('uploaded_by').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
})

export type EvidenceFile = typeof evidenceFiles.$inferSelect

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
  /** Slack に登録しているメール（本人が通知設定で入力する）。未入力の人は ECC のメールで Slack のユーザーを探す */
  slackEmail: text('slack_email').notNull().default(''),
  /** 予算の集約で、この人が入力する担当（局名と担当名）。財務管理部が「予算の設定」で割り当てる。空なら未割り当て */
  budgetBureau: text('budget_bureau').notNull().default(''),
  budgetTeam: text('budget_team').notNull().default(''),
})

export type User = typeof users.$inferSelect

/** 予算の集約の状態：各担当が入力・提出し、財務管理部が査定する（collecting）→ 確定（confirmed） */
export const BUDGET_ROUND_STATUSES = ['collecting', 'confirmed'] as const
/** 明細の査定の状態：未提出 → 査定待ち → 承認済み、または要修正（担当に戻る） */
export const BUDGET_ITEM_STATUSES = ['draft', 'submitted', 'returned', 'approved'] as const

/**
 * 予算の集約の1回分（本予算・補正予算）。始めるときに、最新の確定した予算をまるごと写す。
 * 確定すると、その明細が予算明細（budget_lines）になる。
 */
export const budgetRounds = sqliteTable('budget_rounds', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** 期（例: 第100期）。補正予算は本予算と同じ期 */
  term: text('term').notNull(),
  kind: text('kind', { enum: ['本予算', '補正予算'] }).notNull(),
  status: text('status', { enum: BUDGET_ROUND_STATUSES }).notNull().default('collecting'),
  /** 写したもとの集約（最初の予算は null） */
  baseRoundId: integer('base_round_id'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').notNull(),
  confirmedAt: integer('confirmed_at', { mode: 'timestamp_ms' }),
})

/** 集約ごとの局・担当（担当者の名前つき）。並び順は予算の表の順 */
export const budgetTeams = sqliteTable('budget_teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roundId: integer('round_id').notNull().references(() => budgetRounds.id),
  /** 局の番号（例: out01）。項目番号の頭になる */
  bureauNo: text('bureau_no').notNull(),
  bureau: text('bureau').notNull(),
  team: text('team').notNull(),
  /** 担当者（例: 室賀慎太郎） */
  person: text('person').notNull().default(''),
  sortOrder: real('sort_order').notNull(),
})

/** 集約中の予算の明細。担当が入力し、財務管理部が査定する */
export const budgetItems = sqliteTable('budget_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  roundId: integer('round_id').notNull().references(() => budgetRounds.id),
  teamId: integer('team_id').notNull().references(() => budgetTeams.id),
  /** 確定したときの項目番号（写した明細はもとの番号。新しい明細は確定まで空） */
  itemNumber: text('item_number').notNull().default(''),
  kan: text('kan').notNull().default(''),
  kou: text('kou').notNull().default(''),
  moku: text('moku').notNull().default(''),
  setsu: text('setsu').notNull().default(''),
  quantity: text('quantity').notNull().default(''),
  unitPrice: integer('unit_price'),
  amount: integer('amount').notNull(),
  vendor: text('vendor').notNull().default(''),
  /** 仕様・詳細 */
  spec: text('spec').notNull().default(''),
  link: text('link').notNull().default(''),
  plannedTiming: text('planned_timing').notNull().default(''),
  remark: text('remark').notNull().default(''),
  isNew: integer('is_new', { mode: 'boolean' }).notNull().default(false),
  preExecution: integer('pre_execution', { mode: 'boolean' }).notNull().default(false),
  sortOrder: real('sort_order').notNull(),
  status: text('status', { enum: BUDGET_ITEM_STATUSES }).notNull().default('draft'),
  /** 財務管理部からのコメント（要修正の理由など） */
  reviewComment: text('review_comment').notNull().default(''),
  /** 削除する（確定すると予算から消える）。写した明細を消すときに付ける */
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  /** 写したもとの明細と、その金額（差額を出すため）。新しい明細は null */
  baseItemId: integer('base_item_id'),
  baseAmount: integer('base_amount'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  updatedBy: text('updated_by').notNull(),
})

export type BudgetRound = typeof budgetRounds.$inferSelect
export type BudgetTeam = typeof budgetTeams.$inferSelect
export type BudgetItem = typeof budgetItems.$inferSelect
