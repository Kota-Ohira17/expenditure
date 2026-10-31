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

/**
 * 予算の集約の段階：集約中（各担当が入力・提出）→ 集約終了（入力を締め切る）→ 査定中（財務管理部が査定、要修正だけ担当が直す）→ 確定
 */
export const BUDGET_ROUND_STATUSES = ['collecting', 'closed', 'reviewing', 'confirmed'] as const
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
  /** 担当者の氏名 */
  person: text('person').notNull().default(''),
  sortOrder: real('sort_order').notNull(),
})

export type BudgetRound = typeof budgetRounds.$inferSelect
export type BudgetTeam = typeof budgetTeams.$inferSelect

/**
 * ①予算項目DB と ⑦補正予算項目DB の列（同じ形）。
 * 行は書き換えず、直すたびに1行足す。項目番号ごとに、いちばん新しい行（作成日時）が今の値。
 * 消すときも「削除」の行を足す（いちばん新しい行が削除なら、その項目はない扱い）。
 */
const budgetItemColumns = () => ({
  /** ランダムな id */
  id: text('id').primaryKey(),
  /** 期（例: 第100期） */
  term: text('term').notNull(),
  /** この行を書いた集約（予算の変更・最初の取り込みは null） */
  roundId: integer('round_id'),
  /** 項目番号（例: out01-01-01 ＝ 局-款-項目）。行を足すときに自動で付け、以後はこの番号で同じ項目を追う */
  itemNumber: text('item_number').notNull(),
  bureau: text('bureau').notNull(),
  team: text('team').notNull(),
  /** 項目名＝款・項・目・節 */
  kan: text('kan').notNull().default(''),
  kou: text('kou').notNull().default(''),
  moku: text('moku').notNull().default(''),
  setsu: text('setsu').notNull().default(''),
  amount: integer('amount').notNull(),
  quantity: text('quantity').notNull().default(''),
  unitPrice: integer('unit_price'),
  /** 仕様等 */
  spec: text('spec').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  remark: text('remark').notNull().default(''),
  link: text('link').notNull().default(''),
  plannedTiming: text('planned_timing').notNull().default(''),
  isNew: integer('is_new', { mode: 'boolean' }).notNull().default(false),
  preExecution: integer('pre_execution', { mode: 'boolean' }).notNull().default(false),
  /** 削除の行 */
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
  /** 案（集約中）／承認済み（予算として確定・承認された） */
  status: text('status', { enum: ['draft', 'approved'] }).notNull().default('draft'),
  sortOrder: real('sort_order').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  /** 作成者（予算の変更は、承認した財務管理部の人） */
  createdBy: text('created_by').notNull(),
})

/** ①予算項目DB（本予算の集約・予算の変更・補正予算の承認で行が増える） */
export const mainBudgetItems = sqliteTable('main_budget_items', budgetItemColumns())
/** ⑦補正予算項目DB（①と同じ形。補正予算の集約で、①の今の値を写してから行を足していく） */
export const revisedBudgetItems = sqliteTable('revised_budget_items', budgetItemColumns())
export type BudgetItemRow = typeof mainBudgetItems.$inferSelect

/**
 * ②予算変更申請DB。担当の人が申請し、財務管理部が承認すると①に行を足す（補正予算の集約中は⑦にも）。
 * 財務管理部は直接変更できる（申請と承認を同時に行った扱い）。だれが変えたかは画面に出さない（メールは記録だけ）。
 */
export const BUDGET_CHANGE_REQUEST_KINDS = ['add', 'edit', 'delete'] as const
export const budgetChangeRequests = sqliteTable('budget_change_requests', {
  id: text('id').primaryKey(),
  term: text('term').notNull(),
  /** 項目番号（新規は承認したときに付いた番号） */
  itemNumber: text('item_number').notNull().default(''),
  bureau: text('bureau').notNull(),
  team: text('team').notNull(),
  /** 新規／変更／削除 */
  kind: text('kind', { enum: BUDGET_CHANGE_REQUEST_KINDS }).notNull(),
  /** 変更後の情報（①とほぼ同じ項目。削除は null） */
  after: text('after', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  /** 変更前の情報（履歴で比べるため。新規は null） */
  before: text('before', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  reason: text('reason').notNull().default(''),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').notNull(),
  sortOrder: real('sort_order').notNull().default(0),
  /** 承認状況：承認待ち／承認／却下／取り下げ */
  status: text('status', { enum: ['pending', 'approved', 'rejected', 'withdrawn'] }).notNull().default('pending'),
  /** 財務管理部が直接変更したもの */
  direct: integer('direct', { mode: 'boolean' }).notNull().default(false),
  reviewComment: text('review_comment').notNull().default(''),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  reviewedBy: text('reviewed_by'),
})
export type BudgetChangeRequest = typeof budgetChangeRequests.$inferSelect

/**
 * ④予算前執行DB。本予算が確定する前に新しい年度の分を執行するための枠。
 * 担当が申請し、財務管理部が承認すると、執行依頼で選べる（予算明細に「予算前執行」の行として出る）。
 * 本予算が確定したら、同じ項目番号（なければ同じ款・項・目・節）の予算項目に、その枠で執行した申請を付け替える。
 */
export const PRE_EXECUTION_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn', 'settled'] as const
export const preExecutionRequests = sqliteTable('pre_execution_requests', {
  id: text('id').primaryKey(),
  term: text('term').notNull(),
  /** 申請したときの本予算の集約 */
  roundId: integer('round_id'),
  bureau: text('bureau').notNull(),
  team: text('team').notNull(),
  /** 集約中の項目に対応するなら、その項目番号 */
  itemNumber: text('item_number').notNull().default(''),
  kan: text('kan').notNull().default(''),
  kou: text('kou').notNull().default(''),
  moku: text('moku').notNull().default(''),
  setsu: text('setsu').notNull().default(''),
  quantity: text('quantity').notNull().default(''),
  vendor: text('vendor').notNull().default(''),
  /** 申請額（枠の上限） */
  amount: integer('amount').notNull(),
  reason: text('reason').notNull().default(''),
  neededBy: text('needed_by').notNull().default(''),
  /** 承認待ち／承認済み／却下／取り下げ／確定済み（本予算の項目に付け替えた） */
  status: text('status', { enum: PRE_EXECUTION_STATUSES }).notNull().default('pending'),
  /** 認めた額（申請額から減らせる） */
  approvedAmount: integer('approved_amount'),
  reviewComment: text('review_comment').notNull().default(''),
  /** 本予算が確定したあとに付け替えた予算明細（予算にない場合は null） */
  lineKey: text('line_key'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').notNull(),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp_ms' }),
  reviewedBy: text('reviewed_by'),
})
export type PreExecutionRequest = typeof preExecutionRequests.$inferSelect

/**
 * ⑤査定DB。提出・承認・要修正・修正・返事を、項目ごとに1行ずつ残す（書き換えない）。
 * 項目の査定の状態は、その集約での最新の行の status。
 */
export const BUDGET_REVIEW_ACTIONS = ['create', 'edit', 'submit', 'approve', 'return', 'reply', 'reflect'] as const
export const budgetReviews = sqliteTable('budget_reviews', {
  id: text('id').primaryKey(),
  roundId: integer('round_id').notNull(),
  itemNumber: text('item_number').notNull(),
  /** 追加／修正／提出／承認／要修正／返事／財務管理部の修正（折衝の反映） */
  action: text('action', { enum: BUDGET_REVIEW_ACTIONS }).notNull(),
  /** この行のあとの査定の状態 */
  status: text('status', { enum: BUDGET_ITEM_STATUSES }).notNull(),
  comment: text('comment').notNull().default(''),
  /** そのときの①⑦の行（どの版を見たか） */
  rowId: text('row_id'),
  /** まとめて行った操作（担当のすべて提出・まとめて承認・すべて承認・集約終了の自動提出） */
  bulk: text('bulk'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  createdBy: text('created_by').notNull(),
})
export type BudgetReview = typeof budgetReviews.$inferSelect

/**
 * 本予算の集約で参考にする、取り込んだ昨年の本予算・決算の明細。
 * 本予算は「支出」シート、決算は「支出詳細」シートの CSV から取り込む。種類ごとに、取り込み直すと入れ替える。
 */
export const BUDGET_REFERENCE_KINDS = ['budget', 'settlement'] as const
export const budgetReferences = sqliteTable('budget_references', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kind: text('kind', { enum: BUDGET_REFERENCE_KINDS }).notNull(),
  sortOrder: integer('sort_order').notNull(),
  itemNumber: text('item_number').notNull().default(''),
  bureau: text('bureau').notNull().default(''),
  team: text('team').notNull().default(''),
  kan: text('kan').notNull().default(''),
  kou: text('kou').notNull().default(''),
  moku: text('moku').notNull().default(''),
  setsu: text('setsu').notNull().default(''),
  quantity: text('quantity').notNull().default(''),
  unitPrice: integer('unit_price'),
  amount: integer('amount').notNull(),
  vendor: text('vendor').notNull().default(''),
  spec: text('spec').notNull().default(''),
  link: text('link').notNull().default(''),
  plannedTiming: text('planned_timing').notNull().default(''),
  remark: text('remark').notNull().default(''),
  isNew: integer('is_new', { mode: 'boolean' }).notNull().default(false),
  preExecution: integer('pre_execution', { mode: 'boolean' }).notNull().default(false),
})

/** 取り込んだ昨年の本予算・決算のファイル（種類ごとに1つ） */
export const budgetReferenceFiles = sqliteTable('budget_reference_files', {
  kind: text('kind', { enum: BUDGET_REFERENCE_KINDS }).primaryKey(),
  fileName: text('file_name').notNull(),
  count: integer('count').notNull(),
  total: integer('total').notNull(),
  importedAt: integer('imported_at', { mode: 'timestamp_ms' }).notNull(),
  importedBy: text('imported_by').notNull(),
})
