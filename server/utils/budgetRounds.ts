import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { BUDGET_TERM } from '../../shared/constants'
import { confirmSheetRows } from '../../shared/budgetCompile'
import type { BudgetItemStatus } from '../../shared/budgetCompile'
import { can } from '../../shared/roles'
import type { BudgetItemRow, BudgetRound, BudgetTeam } from '../db/schema'
import type { BudgetKind, ParsedBudgetLine, ParsedSheetRow } from './budget'
import type { SessionUser } from './auth'

/**
 * 予算の集約（本予算・補正予算）と、①予算項目DB・⑤査定DB・⑦補正予算項目DB の読み書き。
 *
 * - ①⑦の行は書き換えず、直すたびに1行足す。項目番号ごとにいちばん新しい行が今の値（削除も行で表す）。
 * - 本予算の集約：①に案の行を足していく → 査定・折衝（⑤）→ 確定すると、その集約の行が承認済みになり、ほかの項目は削除の行で消す。
 * - 補正予算の集約：①の今の値を⑦に写す → ⑦に行を足していく → 査定・折衝（⑤）→ 確定すると、変わった行を①に写す。
 * - 項目の査定の状態は、⑤のその集約での最新の行（⑤に行がない写しただけの項目は承認済み）。
 * - 執行依頼で選ぶ予算（budget_lines）は、①の承認済みの最新の行から作り直す。
 */

const CHUNK = 100

/** ランダムな id（①②④⑤⑦の行） */
export const newId = () => crypto.randomUUID().replaceAll('-', '')

/** 集約の種類で、行を書く表（本予算は①、補正予算は⑦） */
export const tableOf = (round: Pick<BudgetRound, 'kind'>) => (round.kind === '補正予算' ? schema.revisedBudgetItems : schema.mainBudgetItems)
type ItemTable = ReturnType<typeof tableOf>

/** ①⑦の行のうち、明細の中身の項目（直す・写す・比べるときに使う） */
export const ITEM_FIELDS = ['kan', 'kou', 'moku', 'setsu', 'quantity', 'unitPrice', 'amount', 'vendor', 'spec', 'link', 'plannedTiming', 'remark', 'isNew', 'preExecution'] as const
export type ItemValues = Pick<BudgetItemRow, typeof ITEM_FIELDS[number]>
export const itemValues = (r: ItemValues): ItemValues => Object.fromEntries(ITEM_FIELDS.map(k => [k, r[k] ?? null])) as unknown as ItemValues
const sameItem = (a: BudgetItemRow, b: BudgetItemRow) =>
  a.deleted === b.deleted && a.bureau === b.bureau && a.team === b.team && ITEM_FIELDS.every(k => (a[k] ?? null) === (b[k] ?? null))

/** 行を書いた順に読む（同じ時刻なら足した順） */
async function rowsOf(table: ItemTable, where: ReturnType<typeof and>) {
  return useDb().select().from(table).where(where).orderBy(asc(table.createdAt), sql`rowid`)
}
/** 項目番号ごとの最新の行 */
export function latestByNumber(rows: BudgetItemRow[]) {
  const latest = new Map<string, BudgetItemRow>()
  for (const r of rows) latest.set(r.itemNumber, r)
  return latest
}

/** 今の予算：①の承認済みの最新の行（削除を除く）。執行依頼で選ぶ予算・予算の変更のもと */
export async function currentRows(term = BUDGET_TERM) {
  const rows = await rowsOf(schema.mainBudgetItems, and(eq(schema.mainBudgetItems.term, term), eq(schema.mainBudgetItems.status, 'approved')))
  return [...latestByNumber(rows).values()].filter(r => !r.deleted)
}

/** 予算明細と「支出」シートの行を入れ替える */
export async function replaceBudgetLines(lines: ParsedBudgetLine[], sheetRows: ParsedSheetRow[], budgetKind: BudgetKind) {
  const db = useDb()
  const importedAt = new Date()
  await db.batch([
    db.delete(schema.budgetLines),
    db.delete(schema.budgetSheetRows),
    ...Array.from({ length: Math.ceil(lines.length / CHUNK) }, (_, i) =>
      db.insert(schema.budgetLines).values(lines.slice(i * CHUNK, (i + 1) * CHUNK).map(l => ({ ...l, importedAt, budgetKind }))),
    ),
    ...Array.from({ length: Math.ceil(sheetRows.length / CHUNK) }, (_, i) =>
      db.insert(schema.budgetSheetRows).values(sheetRows.slice(i * CHUNK, (i + 1) * CHUNK)),
    ),
  ] as const)
}

/** 確定していない集約（集約中・集約終了・査定中。なければ null）。一度に進められるのは1つだけ */
export async function openRound() {
  return (await useDb().query.budgetRounds.findFirst({ where: ne(schema.budgetRounds.status, 'confirmed') })) ?? null
}

/** 最新の確定した予算（なければ null） */
export async function latestConfirmedRound() {
  return (await useDb().query.budgetRounds.findFirst({
    where: eq(schema.budgetRounds.status, 'confirmed'),
    orderBy: [desc(schema.budgetRounds.confirmedAt), desc(schema.budgetRounds.id)],
  })) ?? null
}

/** 集約の段階を確かめる（違えば 409 と、その段階でできることの案内） */
export function assertPhase(round: Pick<BudgetRound, 'status'>, phase: BudgetRound['status']) {
  if (round.status === phase) return
  const messages: Record<BudgetRound['status'], string> = {
    collecting: '集約中ではありません。',
    closed: '集約終了の段階ではありません。',
    reviewing: '査定中ではありません。「集約終了」のあと「査定開始」で査定できます。',
    confirmed: 'この予算はまだ確定していません。',
  }
  throw createError({ statusCode: 409, message: messages[phase] })
}

/** 確定していない集約を id で読む（なければ 404） */
export async function openRoundOr404(id: number) {
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, id) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 404, message: '確定していない集約が見つかりません。' })
  return round
}

/**
 * 集約の局・部・担当を、予算の表の順で読む。
 * 並びは 局の並び → 局の直属の担当 → 部の並び → 部の中の担当の並び。
 */
export async function teamsOf(roundId: number) {
  const db = useDb()
  const [bureaus, departments, teams] = await Promise.all([
    db.select().from(schema.budgetBureaus).where(eq(schema.budgetBureaus.roundId, roundId)).orderBy(asc(schema.budgetBureaus.sortOrder)),
    db.select().from(schema.budgetDepartments).where(eq(schema.budgetDepartments.roundId, roundId)).orderBy(asc(schema.budgetDepartments.sortOrder)),
    db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, roundId)),
  ])
  const bureauOrder = new Map(bureaus.map((b, i) => [b.id, i]))
  const deptOrder = new Map(departments.map((d, i) => [d.id, i + 1]))
  teams.sort((a, b) => (bureauOrder.get(a.bureauId ?? -1) ?? 1e9) - (bureauOrder.get(b.bureauId ?? -1) ?? 1e9)
    || (deptOrder.get(a.departmentId ?? -1) ?? 0) - (deptOrder.get(b.departmentId ?? -1) ?? 0)
    || a.sortOrder - b.sortOrder)
  return { bureaus, departments, teams }
}

/** 項目番号から局の番号（out01-04-12 → out01、out-03-02-06 → out-03） */
const bureauNoOf = (itemNumber: string) => itemNumber.match(/^[a-z]+-?\d+/i)?.[0] ?? ''
const pad2 = (n: number) => String(n).padStart(2, '0')
/** 項目番号の最後の数（out01-04-12 → 12）と、款の番号（out01-04） */
const lastSeq = (no: string) => Number(no.split('-').at(-1)) || 0
const parentOf = (no: string) => no.split('-').slice(0, -1).join('-')

/**
 * 新しい項目の番号（局-款-項目）。同じ担当に同じ款があればその款の続き、なければその局の次の款の 01。
 * used は、その期で使っている番号と、その番号の行（款・担当を見るため）。
 */
export function nextItemNumber(used: Map<string, Pick<BudgetItemRow, 'bureau' | 'team' | 'kan'>>, team: Pick<BudgetTeam, 'bureauNo' | 'bureau' | 'team'>, kan: string) {
  const inBureau = [...used.keys()].filter(no => bureauNoOf(no) === team.bureauNo)
  const sameKan = inBureau.find((no) => {
    const r = used.get(no)!
    return r.bureau === team.bureau && r.team === team.team && r.kan === kan
  })
  const kanNo = sameKan ? parentOf(sameKan) : `${team.bureauNo}-${pad2(Math.max(0, ...inBureau.map(no => lastSeq(parentOf(no)))) + 1)}`
  const seq = Math.max(0, ...inBureau.filter(no => parentOf(no) === kanNo).map(lastSeq)) + 1
  return `${kanNo}-${pad2(seq)}`
}

/** その期で使っている番号（①のすべての行と、補正予算の集約なら⑦の行） */
export async function usedNumbers(round: Pick<BudgetRound, 'id' | 'kind' | 'term'> | null, term = BUDGET_TERM) {
  const db = useDb()
  const pick = { itemNumber: schema.mainBudgetItems.itemNumber, bureau: schema.mainBudgetItems.bureau, team: schema.mainBudgetItems.team, kan: schema.mainBudgetItems.kan }
  const main = await db.select(pick).from(schema.mainBudgetItems).where(eq(schema.mainBudgetItems.term, term)).orderBy(asc(schema.mainBudgetItems.createdAt), sql`rowid`)
  const revised = round?.kind === '補正予算'
    ? await db.select({ itemNumber: schema.revisedBudgetItems.itemNumber, bureau: schema.revisedBudgetItems.bureau, team: schema.revisedBudgetItems.team, kan: schema.revisedBudgetItems.kan })
      .from(schema.revisedBudgetItems).where(eq(schema.revisedBudgetItems.roundId, round.id)).orderBy(asc(schema.revisedBudgetItems.createdAt), sql`rowid`)
    : []
  return new Map([...main, ...revised].map(r => [r.itemNumber, r]))
}

/** ⑤に行を足すときの値 */
export function reviewRow(roundId: number, itemNumber: string, action: typeof schema.budgetReviews.$inferInsert['action'], status: BudgetItemStatus, user: SessionUser, extra: { comment?: string, rowId?: string | null, bulk?: string | null, at?: Date } = {}) {
  return {
    id: newId(), roundId, itemNumber, action, status,
    comment: extra.comment ?? '', rowId: extra.rowId ?? null, bulk: extra.bulk ?? null,
    createdAt: extra.at ?? new Date(), createdBy: user.email,
  }
}

/** 集約の中身：局・担当、項目ごとの最新の行と⑤の状態、もとの予算の金額 */
export async function roundState(round: BudgetRound) {
  const db = useDb()
  const table = tableOf(round)
  const [{ bureaus, departments, teams }, rows, reviews, before] = await Promise.all([
    teamsOf(round.id),
    // 確定した集約は、今の予算（①の承認済みの行。予算の変更も入る）を出す
    round.status === 'confirmed'
      ? rowsOf(schema.mainBudgetItems, and(eq(schema.mainBudgetItems.term, round.term), eq(schema.mainBudgetItems.status, 'approved')))
      : rowsOf(table, eq(table.roundId, round.id)),
    db.select().from(schema.budgetReviews).where(eq(schema.budgetReviews.roundId, round.id)).orderBy(asc(schema.budgetReviews.createdAt), sql`rowid`),
    // もとの予算：集約を始める前の、①の承認済みの最新の行
    rowsOf(schema.mainBudgetItems, and(eq(schema.mainBudgetItems.term, round.term), eq(schema.mainBudgetItems.status, 'approved'), sql`${schema.mainBudgetItems.createdAt} < ${round.createdAt.getTime()}`)),
  ])
  const latest = latestByNumber(rows)
  const base = new Map([...latestByNumber(before)].filter(([, r]) => !r.deleted))
  const state = new Map<string, { status: BudgetItemStatus, comment: string, count: number }>()
  for (const r of reviews) {
    const s = state.get(r.itemNumber) ?? { status: 'approved' as BudgetItemStatus, comment: '', count: 0 }
    s.status = r.status
    if (r.action === 'return') s.comment = r.comment
    if (r.action !== 'create' && r.action !== 'edit' && r.action !== 'reflect') s.count++
    state.set(r.itemNumber, s)
  }
  // ⑤に行がない項目（補正予算で写しただけのもの）は承認済み
  const statusOf = (no: string): BudgetItemStatus => state.get(no)?.status ?? 'approved'
  return { bureaus, departments, teams, latest, base, state, statusOf }
}

/** 担当（局・担当の名前）に合う局・担当の行 */
const teamFor = (teams: BudgetTeam[], r: Pick<BudgetItemRow, 'bureau' | 'team'>) => teams.find(t => t.bureau === r.bureau && t.team === r.team)

/** 画面に渡す集約の中身（局・担当、項目、自分が入力できる担当） */
export async function roundView(round: BudgetRound, user: SessionUser) {
  const db = useDb()
  const [{ bureaus, departments, teams, latest, base, state, statusOf }, me, members, referenced] = await Promise.all([
    roundState(round),
    db.query.users.findFirst({ where: eq(schema.users.email, user.email) }),
    db.select({ email: schema.users.email, name: schema.users.name, bureau: schema.users.budgetBureau, team: schema.users.budgetTeam })
      .from(schema.users).where(ne(schema.users.budgetTeam, '')),
    db.select({ bureau: schema.budgetReferences.bureau, team: schema.budgetReferences.team, kind: schema.budgetReferences.kind, itemNumber: schema.budgetReferences.itemNumber, amount: schema.budgetReferences.amount })
      .from(schema.budgetReferences),
  ])
  // 本予算の「昨年から」は、取り込んだ昨年の本予算の同じ項目番号の金額（同じ番号が複数あれば合計）と比べる
  const lastYear = new Map<string, number>()
  for (const r of referenced) if (r.kind === 'budget') lastYear.set(r.itemNumber, (lastYear.get(r.itemNumber) ?? 0) + r.amount)
  // 集約・査定に出す担当：昨年の本予算・決算（取り込んだ参考）に明細がある担当と、この集約に項目がある担当。
  // 参考をまだ取り込んでいなければ、すべての担当を出す
  const refKeys = new Set(referenced.map(r => `${r.bureau}|${r.team}`))
  const withItems = new Set([...latest.values()].filter(r => !r.deleted).map(r => `${r.bureau}|${r.team}`))
  const listed = (t: BudgetTeam) => !refKeys.size || withItems.has(`${t.bureau}|${t.team}`)
    || teamNamesOf(t).some(n => refKeys.has(`${t.bureau}|${n}`))
  const teamOrder = new Map(teams.map((t, i) => [t.id, i]))
  const items = [...latest.values()].flatMap((r) => {
    const b = base.get(r.itemNumber)
    // 削除の行が最新の項目は、補正予算で写したもの（もとの予算にあるもの）だけ「削除」として出す
    if (r.deleted && (round.kind === '本予算' || !b)) return []
    const team = teamFor(teams, r)
    if (!team) return []
    const s = state.get(r.itemNumber)
    const status = statusOf(r.itemNumber)
    return [{
      id: r.id,
      teamId: team.id,
      itemNumber: r.itemNumber,
      number: r.itemNumber,
      ...itemValues(r),
      deleted: r.deleted,
      sortOrder: r.sortOrder,
      status,
      reviewComment: status === 'approved' ? '' : (s?.comment ?? ''),
      reviewCount: s?.count ?? 0,
      baseAmount: round.kind === '本予算' ? (lastYear.get(r.itemNumber) ?? null) : b ? b.amount : null,
      baseItemId: b ? b.id : null,
      updatedAt: r.createdAt,
    }]
  }).sort((a, b) => (teamOrder.get(a.teamId)! - teamOrder.get(b.teamId)!) || a.sortOrder - b.sortOrder)
  const editable = teams.filter(t => can(user.role, 'reviewBudget') || (me?.budgetBureau === t.bureau && me?.budgetTeam === t.team)).map(t => t.id)
  return {
    round,
    bureaus,
    departments,
    teams: teams.map(t => ({ ...t, listed: listed(t), department: departments.find(d => d.id === t.departmentId) ?? null, members: members.filter(m => m.bureau === t.bureau && m.team === t.team).map(m => ({ email: m.email, name: m.name })) })),
    items,
    editableTeamIds: editable,
  }
}

/** その担当の明細を入力できるか（その担当に割り当てられた人と、財務管理部・財務局長・管理者） */
export async function canEditTeam(user: SessionUser, team: Pick<BudgetTeam, 'bureau' | 'team'>) {
  if (can(user.role, 'reviewBudget')) return true
  const me = await useDb().query.users.findFirst({ where: eq(schema.users.email, user.email) })
  return !!me && me.budgetBureau === team.bureau && me.budgetTeam === team.team
}

/** 確定していない集約の担当を読む（なければ 404、確定済みなら 409） */
export async function openTeamOr404(teamId: number) {
  const team = await useDb().query.budgetTeams.findFirst({ where: eq(schema.budgetTeams.id, teamId) })
  if (!team) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  const round = await useDb().query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, team.roundId) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 409, message: 'この予算は確定しているので、直せません。' })
  return { team, round }
}

/**
 * 確定していない集約の項目を、画面に出した行の id で読む（なければ 404）。
 * 渡された行がもう最新でなければ（ほかの人が直したあと）、読み直してもらう。
 */
export async function openItemOr404(rowId: string) {
  const db = useDb()
  const row = (await db.query.mainBudgetItems.findFirst({ where: eq(schema.mainBudgetItems.id, rowId) }))
    ?? (await db.query.revisedBudgetItems.findFirst({ where: eq(schema.revisedBudgetItems.id, rowId) }))
  if (!row || row.roundId == null) throw createError({ statusCode: 404, message: '明細が見つかりません。' })
  const round = await db.query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, row.roundId) })
  if (!round || round.status === 'confirmed') throw createError({ statusCode: 409, message: 'この予算は確定しているので、直せません。' })
  const st = await roundState(round)
  const latest = st.latest.get(row.itemNumber)
  if (latest?.id !== row.id) throw createError({ statusCode: 409, message: 'この明細はほかの人が直しました。画面を読み込み直してください。' })
  const team = teamFor(st.teams, row)
  if (!team) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  return { row, round, team, status: st.statusOf(row.itemNumber), base: st.base.get(row.itemNumber) ?? null }
}

/**
 * 担当が明細を直してよいか。財務管理部は確定までいつでも直せる。担当の人は
 * - 集約中：査定待ち以外の明細
 * - 査定中：要修正の明細（直して未提出に戻ったものも）だけ
 * - 集約終了：直せない
 */
export async function assertCanChangeItem(user: SessionUser, status: BudgetItemStatus, team: Pick<BudgetTeam, 'bureau' | 'team'>, round: Pick<BudgetRound, 'status'>) {
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は直せません。' })
  if (can(user.role, 'reviewBudget')) return
  if (round.status === 'collecting' && status !== 'submitted') return
  if (round.status === 'reviewing' && (status === 'returned' || status === 'draft')) return
  const message = round.status === 'collecting'
    ? '提出した明細は直せません。財務管理部の査定を待ってください。'
    : round.status === 'closed'
      ? '集約は終了しました。査定が始まると、要修正になった明細だけ直せます。'
      : '査定中は、要修正になった明細だけ直せます。'
  throw createError({ statusCode: 409, message })
}

/** 担当の人が明細を足してよいか（集約中だけ。財務管理部は確定までいつでも） */
export function assertCanAddItem(user: SessionUser, round: Pick<BudgetRound, 'status'>) {
  if (can(user.role, 'reviewBudget') || round.status === 'collecting') return
  throw createError({ statusCode: 409, message: '集約は終了したので、明細は足せません。' })
}

/**
 * 項目を直す（①⑦に行を足し、⑤にも残す）。
 * 直すと未提出に戻る。ただし査定中に財務管理部が直すのは「折衝の反映」で、査定の状態は変えない。
 */
export async function writeItem(
  round: BudgetRound, prev: BudgetItemRow | null, values: ItemValues & Partial<Pick<BudgetItemRow, 'deleted' | 'itemNumber' | 'bureau' | 'team' | 'sortOrder'>>,
  user: SessionUser, status: BudgetItemStatus,
) {
  const db = useDb()
  const table = tableOf(round)
  // 査定中に財務管理部が直すのは「折衝の反映」（査定の状態は変えない）。それ以外の修正は未提出に戻る
  const reviewer = can(user.role, 'reviewBudget') && round.status === 'reviewing'
  const now = new Date()
  const row = {
    id: newId(),
    term: round.term,
    roundId: round.id,
    itemNumber: values.itemNumber ?? prev!.itemNumber,
    bureau: values.bureau ?? prev!.bureau,
    team: values.team ?? prev!.team,
    ...itemValues(values),
    deleted: values.deleted ?? false,
    status: 'draft' as const,
    sortOrder: values.sortOrder ?? prev!.sortOrder,
    createdAt: now,
    createdBy: user.email,
  }
  const action = !prev ? 'create' : reviewer ? 'reflect' : 'edit'
  const next: BudgetItemStatus = !prev ? (reviewer && status === 'approved' ? 'approved' : 'draft') : reviewer ? status : 'draft'
  await db.batch([
    db.insert(table).values(row),
    db.insert(schema.budgetReviews).values(reviewRow(round.id, row.itemNumber, action, next, user, { rowId: row.id, at: now })),
  ])
  return row
}

/** 担当のいちばん後ろ（同じ款があればその款の後ろ）の並び順 */
export function sortOrderFor(rows: BudgetItemRow[], team: Pick<BudgetTeam, 'bureau' | 'team'>, kan: string) {
  const mine = rows.filter(r => r.bureau === team.bureau && r.team === team.team)
  const sameKan = mine.filter(r => r.kan === kan)
  const after = Math.max(-1, ...(sameKan.length ? sameKan : mine).map(r => r.sortOrder))
  const next = mine.filter(r => r.sortOrder > after).map(r => r.sortOrder)
  return next.length ? (after + Math.min(...next)) / 2 : after + 1
}

/** 項目の状態をまとめて変える（提出・承認など）。⑤に1項目1行ずつ足す */
export async function setStatuses(round: BudgetRound, numbers: string[], action: 'submit' | 'approve', user: SessionUser, bulk: string | null) {
  if (!numbers.length) return 0
  const status: BudgetItemStatus = action === 'submit' ? 'submitted' : 'approved'
  const now = new Date()
  const rows = numbers.map(no => reviewRow(round.id, no, action, status, user, { bulk, at: now }))
  const db = useDb()
  for (let i = 0; i < rows.length; i += CHUNK) await db.insert(schema.budgetReviews).values(rows.slice(i, i + CHUNK))
  return rows.length
}

/** 画面に出す項目（roundView の items）のうち、条件に合う項目番号 */
export async function numbersWhere(round: BudgetRound, test: (status: BudgetItemStatus, teamId: number) => boolean) {
  const { teams, latest, base, statusOf } = await roundState(round)
  return [...latest.values()]
    .filter(r => !(r.deleted && (round.kind === '本予算' || !base.get(r.itemNumber))))
    .filter((r) => {
      const team = teamFor(teams, r)
      return team && test(statusOf(r.itemNumber), team.id)
    })
    .map(r => r.itemNumber)
}

/**
 * 集約を始める（財務管理部）。期は第100期で固定。最新の確定した予算の局・担当を写す。
 * 本予算は明細を空から作る（取り込んだ昨年の本予算・決算を参考にコピーできる）。
 * 補正予算は①の今の値を⑦に写す（写しただけの項目は承認済み。直した・足した・消した項目だけが査定に回る）。
 */
export async function startRound(kind: BudgetKind, user: SessionUser) {
  const db = useDb()
  if (await openRound()) throw createError({ statusCode: 409, message: '確定していない集約があります。確定するか中止してから始めてください。' })
  const [base, current] = await Promise.all([latestConfirmedRound(), currentRows()])
  if (!base && !current.length) throw createError({ statusCode: 400, message: 'もとにする予算がありません。最初の予算を取り込んでください。' })

  const now = new Date()
  const [round] = await db.insert(schema.budgetRounds).values({ term: BUDGET_TERM, kind, status: 'collecting', baseRoundId: base?.id ?? null, createdAt: now, createdBy: user.email }).returning()
  // 局・担当：前の集約のもの（局ごとに担当をまとめて）。今の予算にしかない局・担当も足す
  const prev = base ? await teamsOf(base.id) : { bureaus: [], departments: [], teams: [] }
  const bureauRows = prev.bureaus.map(b => ({ oldId: b.id as number | null, bureauNo: b.bureauNo, name: b.name, sortOrder: b.sortOrder }))
  const teamRows = prev.teams.map(t => ({ ...t, bureauName: prev.bureaus.find(b => b.id === t.bureauId)?.name ?? t.bureau }))
  for (const r of current) {
    if (!bureauRows.some(b => b.name === r.bureau)) bureauRows.push({ oldId: null, bureauNo: bureauNoOf(r.itemNumber), name: r.bureau, sortOrder: bureauRows.length + 1e6 })
    if (!teamRows.some(t => t.bureauName === r.bureau && t.team === r.team)) {
      teamRows.push({ id: 0, roundId: 0, bureauId: null, departmentId: null, bureauNo: bureauNoOf(r.itemNumber), bureau: r.bureau, team: r.team, nameJa: '', person: '', sortOrder: teamRows.length + 1e6, bureauName: r.bureau })
    }
  }
  const newBureaus = bureauRows.length
    ? await db.insert(schema.budgetBureaus).values(bureauRows.map(b => ({ roundId: round!.id, bureauNo: b.bureauNo, name: b.name, sortOrder: b.sortOrder }))).returning()
    : []
  // 部：前の集約の部を、写した局の中に写す
  const deptRows = prev.departments.flatMap((d) => {
    const name = prev.bureaus.find(b => b.id === d.bureauId)?.name
    const b = newBureaus.find(x => x.name === name)
    return b ? [{ oldId: d.id, roundId: round!.id, bureauId: b.id, code: d.code, nameJa: d.nameJa, sortOrder: d.sortOrder }] : []
  })
  const newDepts = deptRows.length ? await db.insert(schema.budgetDepartments).values(deptRows.map(({ oldId: _, ...d }) => d)).returning() : []
  const deptIdOf = (oldId: number | null) => {
    const i = deptRows.findIndex(d => d.oldId === oldId)
    return i >= 0 ? newDepts[i]!.id : null
  }
  if (teamRows.length) {
    await db.insert(schema.budgetTeams).values(teamRows.map((t) => {
      const b = newBureaus.find(x => x.name === t.bureauName)!
      return { roundId: round!.id, bureauId: b.id, departmentId: deptIdOf(t.departmentId), bureauNo: b.bureauNo, bureau: b.name, team: t.team, nameJa: t.nameJa, person: '', sortOrder: t.sortOrder }
    }))
  }
  if (kind === '本予算') return round!

  const copies = current.map(r => ({ ...r, id: newId(), roundId: round!.id, status: 'draft' as const, createdAt: now, createdBy: user.email }))
  for (let i = 0; i < copies.length; i += CHUNK) await db.insert(schema.revisedBudgetItems).values(copies.slice(i, i + CHUNK))
  return round!
}

/**
 * 確定する（予算提出・承認）。すべて承認済みのときだけ。
 * - 本予算：この集約の各項目の最新の行を承認済みにする（その後に予算の変更で行が足されていれば、写して足す）。この集約にない項目は削除の行で消す。
 * - 補正予算：⑦の最新の行を承認済みにし、①の今の値と違う項目だけ①に写す。
 * そのあと、執行依頼で選ぶ予算を作り直し、予算前執行の枠を本予算の項目に付け替える。
 */
export async function confirmRound(round: BudgetRound, user: SessionUser) {
  const db = useDb()
  const { latest, base, statusOf } = await roundState(round)
  const live = [...latest.values()].filter(r => !(r.deleted && (round.kind === '本予算' || !base.get(r.itemNumber))))
  const waiting = live.filter(r => statusOf(r.itemNumber) !== 'approved')
  if (waiting.length) throw createError({ statusCode: 400, message: `承認していない明細が${waiting.length}件あります。すべて承認してから確定してください。` })
  if (!live.some(r => !r.deleted)) throw createError({ statusCode: 400, message: '明細がありません。' })

  const now = new Date()
  const current = await rowsOf(schema.mainBudgetItems, eq(schema.mainBudgetItems.term, round.term))
  const mainLatest = latestByNumber(current)
  const approvedLatest = latestByNumber(current.filter(r => r.status === 'approved'))
  const markIds: string[] = []
  const appends: (typeof schema.mainBudgetItems.$inferInsert)[] = []
  const copy = (r: BudgetItemRow) => ({ ...r, id: newId(), status: 'approved' as const, createdAt: now, createdBy: user.email })

  if (round.kind === '本予算') {
    for (const r of latest.values()) {
      if (mainLatest.get(r.itemNumber)?.id === r.id) markIds.push(r.id)
      else appends.push(copy(r))
    }
    // この集約にない項目（今の予算に残っているもの）は削除の行で消す
    for (const r of approvedLatest.values()) {
      if (!r.deleted && !latest.has(r.itemNumber)) appends.push({ ...copy(r), deleted: true, roundId: round.id })
    }
  }
  else {
    for (const r of latest.values()) {
      const now1 = approvedLatest.get(r.itemNumber)
      if (now1 ? !sameItem(now1, r) : !r.deleted) appends.push({ ...copy(r), roundId: round.id })
    }
  }
  const table = tableOf(round)
  const latestIds = [...latest.values()].map(r => r.id)
  await db.batch([
    db.update(schema.budgetRounds).set({ status: 'confirmed', confirmedAt: now }).where(eq(schema.budgetRounds.id, round.id)),
    ...Array.from({ length: Math.ceil(markIds.length / CHUNK) }, (_, i) =>
      db.update(schema.mainBudgetItems).set({ status: 'approved' }).where(inArray(schema.mainBudgetItems.id, markIds.slice(i * CHUNK, (i + 1) * CHUNK)))),
    ...Array.from({ length: Math.ceil(appends.length / CHUNK) }, (_, i) => db.insert(schema.mainBudgetItems).values(appends.slice(i * CHUNK, (i + 1) * CHUNK))),
    // 補正予算：⑦の最新の行も承認済みにしておく
    ...(round.kind === '補正予算'
      ? Array.from({ length: Math.ceil(latestIds.length / CHUNK) }, (_, i) =>
          db.update(table).set({ status: 'approved' }).where(inArray(table.id, latestIds.slice(i * CHUNK, (i + 1) * CHUNK))))
      : []),
  ] as const)
  const { lines } = await rebuildCurrentBudget({ settlePreExecutions: round.kind === '本予算' })
  return { count: lines.length, total: lines.reduce((s, l) => s + l.budgetAmount, 0) }
}

/** 集約を中止する（その集約で書いた案の行・⑤・局・担当を消す。①の承認済みの行と、確定した予算は変わらない） */
export async function cancelRound(round: BudgetRound) {
  const db = useDb()
  await db.batch([
    db.delete(schema.mainBudgetItems).where(and(eq(schema.mainBudgetItems.roundId, round.id), eq(schema.mainBudgetItems.status, 'draft'))),
    db.delete(schema.revisedBudgetItems).where(eq(schema.revisedBudgetItems.roundId, round.id)),
    db.delete(schema.budgetReviews).where(eq(schema.budgetReviews.roundId, round.id)),
    db.delete(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id)),
    db.delete(schema.budgetDepartments).where(eq(schema.budgetDepartments.roundId, round.id)),
    db.delete(schema.budgetBureaus).where(eq(schema.budgetBureaus.roundId, round.id)),
    db.delete(schema.budgetRounds).where(eq(schema.budgetRounds.id, round.id)),
  ])
}

/**
 * 執行依頼で選ぶ予算（budget_lines）と「支出」シートの行を、①の承認済みの最新の行から作り直す（予算提出・承認の出力）。
 * settlePreExecutions なら（本予算の確定のとき）、予算前執行の執行依頼を本予算の項目に付け替える。
 */
export async function rebuildCurrentBudget(options: { settlePreExecutions?: boolean } = {}) {
  const db = useDb()
  const [rows, confirmed] = await Promise.all([currentRows(), latestConfirmedRound()])
  const roundTeams = confirmed ? (await teamsOf(confirmed.id)).teams : []
  // 局・担当の並び：確定した集約の順（局の並び → 担当の並び）。そこにない担当は、項目の並びで後ろに足す
  const teams = roundTeams.map((t, i) => ({ id: t.id, bureauNo: t.bureauNo, bureau: t.bureau, team: t.team, person: '', sortOrder: i }))
  for (const r of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!teams.some(t => t.bureau === r.bureau && t.team === r.team)) {
      teams.push({ id: -teams.length - 1, bureauNo: bureauNoOf(r.itemNumber), bureau: r.bureau, team: r.team, person: '', sortOrder: 1e6 + teams.length })
    }
  }
  const items = rows.map(r => ({ ...r, teamId: teams.find(t => t.bureau === r.bureau && t.team === r.team)!.id }))
  const numbers = new Map(items.map(i => [i.id, i.itemNumber]))
  const { lines, sheetRows } = parseBudgetRows(confirmSheetRows(teams, items, numbers))
  await replaceBudgetLines(lines, sheetRows, confirmed?.kind ?? '本予算')
  if (options.settlePreExecutions) await settlePreExecutions(lines)
  return { lines }
}
