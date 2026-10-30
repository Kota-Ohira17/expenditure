import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'
import { assignItemNumbers, confirmSheetRows } from '../../shared/budgetCompile'
import { can } from '../../shared/roles'
import type { BudgetItem, BudgetRound, BudgetTeam } from '../db/schema'
import type { BudgetKind, ParsedBudgetLine, ParsedSheetRow } from './budget'
import type { SessionUser } from './auth'

/**
 * 予算の集約（本予算・補正予算）。
 * 集約開始 → 最新の確定した予算を写す。各担当が直して提出 → 集約終了（入力の締め切り）→ 査定開始 → 全部承認したら確定。
 * 確定すると「支出」シートの行を作り、取り込みと同じ読み方で予算明細（budget_lines）を入れ替える。
 */

const CHUNK = 100

/** 予算明細と「支出」シートの行を入れ替える（確定したとき・最初の予算を取り込んだとき） */
export async function replaceBudgetLines(lines: ParsedBudgetLine[], sheetRows: ParsedSheetRow[], budgetKind: BudgetKind) {
  await useDb().batch(replaceBudgetLinesStatements(lines, sheetRows, budgetKind))
}

/** 予算明細を入れ替える文（ほかの書き込みと1回のバッチで送れるように） */
function replaceBudgetLinesStatements(lines: ParsedBudgetLine[], sheetRows: ParsedSheetRow[], budgetKind: BudgetKind) {
  const db = useDb()
  const importedAt = new Date()
  return [
    db.delete(schema.budgetLines),
    db.delete(schema.budgetSheetRows),
    ...Array.from({ length: Math.ceil(lines.length / CHUNK) }, (_, i) =>
      db.insert(schema.budgetLines).values(lines.slice(i * CHUNK, (i + 1) * CHUNK).map(l => ({ ...l, importedAt, budgetKind }))),
    ),
    ...Array.from({ length: Math.ceil(sheetRows.length / CHUNK) }, (_, i) =>
      db.insert(schema.budgetSheetRows).values(sheetRows.slice(i * CHUNK, (i + 1) * CHUNK)),
    ),
  ] as const
}

/** 確定していない集約（集約中・集約終了・査定中。なければ null）。一度に進められるのは1つだけ */
export async function openRound() {
  return (await useDb().query.budgetRounds.findFirst({ where: ne(schema.budgetRounds.status, 'confirmed') })) ?? null
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

/** 最新の確定した予算（なければ null） */
export async function latestConfirmedRound() {
  return (await useDb().query.budgetRounds.findFirst({
    where: eq(schema.budgetRounds.status, 'confirmed'),
    orderBy: [desc(schema.budgetRounds.confirmedAt), desc(schema.budgetRounds.id)],
  })) ?? null
}

/** 項目番号から局の番号（out01-04-12 → out01、out-03-02-06 → out-03） */
const bureauNoOf = (itemNumber: string) => itemNumber.match(/^[a-z]+-?\d+/i)?.[0] ?? ''

/**
 * 集約の記録がまだなく、予算明細（以前に取り込んだもの）があれば、それを最初の確定した予算として記録する。
 * これで「最新の確定した予算を写して始める」ができるようになる。
 */
export async function ensureInitialRound(user: SessionUser) {
  const db = useDb()
  if (await db.query.budgetRounds.findFirst()) return
  const lines = await db.select().from(schema.budgetLines).orderBy(asc(schema.budgetLines.sortOrder))
  if (!lines.length) return
  const sheetRows = await db.select().from(schema.budgetSheetRows).orderBy(asc(schema.budgetSheetRows.sortOrder))
  const extras = sheetExtras(sheetRows)
  const now = new Date()

  const [round] = await db.insert(schema.budgetRounds).values({
    term: '最初の予算', kind: lines[0]!.budgetKind, status: 'confirmed', createdAt: now, createdBy: user.email, confirmedAt: now,
  }).returning()

  // 局・担当を、予算の並び順に1つずつ
  const teamKeys: string[] = []
  const teamValues: (typeof schema.budgetTeams.$inferInsert)[] = []
  for (const l of lines) {
    const key = `${l.bureau}|${l.team}`
    if (teamKeys.includes(key)) continue
    teamKeys.push(key)
    teamValues.push({
      roundId: round!.id, bureauNo: l.bureauNo || bureauNoOf(l.itemNumber), bureau: l.bureau, team: l.team,
      sortOrder: teamValues.length,
    })
  }
  const teams = await db.insert(schema.budgetTeams).values(teamValues).returning()
  const teamId = new Map(teams.map(t => [`${t.bureau}|${t.team}`, t.id]))

  const items = lines.map((l, i) => {
    const x = extras.items.get(l.key)
    return {
      roundId: round!.id, teamId: teamId.get(`${l.bureau}|${l.team}`)!, itemNumber: l.itemNumber,
      kan: l.kan, kou: l.kou, moku: l.moku, setsu: l.setsu, quantity: l.quantity, unitPrice: x?.unitPrice ?? null,
      amount: l.budgetAmount, vendor: l.vendor, spec: x?.spec ?? '', link: l.link, plannedTiming: l.plannedTiming, remark: l.remark,
      isNew: x?.isNew ?? false, preExecution: x?.preExecution ?? false, sortOrder: i, status: 'approved' as const,
      updatedAt: now, updatedBy: user.email,
    }
  })
  for (let i = 0; i < items.length; i += CHUNK) await db.insert(schema.budgetItems).values(items.slice(i, i + CHUNK))
}

/** 取り込んだ「支出」シートの行から、予算明細には持っていない 仕様・単価・新規・予算前執行 を拾う（担当者の氏名は持たない） */
function sheetExtras(stored: { role: string, cells: string[], lineKey: string | null }[]) {
  const header = stored.find(r => r.role === 'header')?.cells.map(normalizeHeader) ?? []
  const col = (...names: string[]) => names.map(n => header.indexOf(n)).find(i => i >= 0) ?? -1
  const c = { spec: col('仕様・詳細', '仕様等', '仕様'), unit: col('単価'), isNew: col('新規'), pre: col('予算前執行') }
  const items = new Map<string, { spec: string, unitPrice: number | null, isNew: boolean, preExecution: boolean }>()
  for (const r of stored.filter(r => r.role === 'row')) {
    const at = (i: number) => (i >= 0 ? (r.cells[i] ?? '').trim() : '')
    if (r.lineKey) items.set(r.lineKey, { spec: at(c.spec), unitPrice: parseMoney(at(c.unit)), isNew: at(c.isNew) === 'TRUE', preExecution: at(c.pre) === 'TRUE' })
  }
  return { items }
}

/**
 * 集約を始める：最新の確定した予算の局・担当と明細を写す。
 * 本予算は全明細を担当が確かめて出し直す（未提出から）。補正予算は写した明細を承認済みのままにし、直したものだけ査定する。
 */
export async function startRound(kind: BudgetKind, term: string, user: SessionUser) {
  const db = useDb()
  if (await openRound()) throw createError({ statusCode: 409, message: '確定していない集約があります。確定するか取りやめてから始めてください。' })
  const pending = await db.select({ id: schema.budgetChanges.id }).from(schema.budgetChanges).where(eq(schema.budgetChanges.status, 'pending'))
  if (pending.length) throw createError({ statusCode: 409, message: `承認待ちの予算の変更が${pending.length}件あります。「予算の変更」で承認か却下をしてから始めてください。` })
  await ensureInitialRound(user)
  const base = await latestConfirmedRound()
  if (!base) throw createError({ statusCode: 400, message: 'もとにする予算がありません。最初の予算を取り込んでください。' })

  const now = new Date()
  const [round] = await db.insert(schema.budgetRounds).values({ term, kind, status: 'collecting', baseRoundId: base.id, createdAt: now, createdBy: user.email }).returning()
  const baseTeams = await db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, base.id)).orderBy(asc(schema.budgetTeams.sortOrder))
  const newTeams = baseTeams.length
    ? await db.insert(schema.budgetTeams).values(baseTeams.map(({ id: _, ...t }) => ({ ...t, roundId: round!.id }))).returning()
    : []
  const teamMap = new Map(baseTeams.map((t, i) => [t.id, newTeams[i]!.id]))

  const baseItems = await db.select().from(schema.budgetItems)
    .where(and(eq(schema.budgetItems.roundId, base.id), eq(schema.budgetItems.deleted, false)))
  const items = baseItems.map(({ id, ...b }) => ({
    ...b,
    roundId: round!.id,
    teamId: teamMap.get(b.teamId)!,
    // 本予算は番号を付け直すので、もとの番号は持たない
    itemNumber: kind === '補正予算' ? b.itemNumber : '',
    status: kind === '補正予算' ? 'approved' as const : 'draft' as const,
    reviewComment: '',
    baseItemId: id,
    baseAmount: b.amount,
    updatedAt: now,
    updatedBy: user.email,
  }))
  for (let i = 0; i < items.length; i += CHUNK) await db.insert(schema.budgetItems).values(items.slice(i, i + CHUNK))
  return round!
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

/** 確定する：全部承認済みなら番号を付け、「支出」シートの行から予算明細を作って入れ替える */
export async function confirmRound(round: BudgetRound) {
  const db = useDb()
  const teams = await db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id))
  const items = await db.select().from(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id))
  const waiting = items.filter(i => i.status !== 'approved')
  if (waiting.length) {
    throw createError({ statusCode: 400, message: `承認していない明細が${waiting.length}件あります。すべて承認してから確定してください。` })
  }
  // 番号の書き込み・予算明細の入れ替え・確定の印を、DB への1回のやりとりでまとめて行う（途中で失敗したら全部取り消される）
  const { lines, statements } = budgetFromItems(round, teams, items, round.kind === '補正予算')
  await db.batch([
    db.update(schema.budgetRounds).set({ status: 'confirmed', confirmedAt: new Date() }).where(eq(schema.budgetRounds.id, round.id)),
    ...statements,
  ])
  return { count: lines.length, total: lines.reduce((s, l) => s + l.budgetAmount, 0) }
}

/**
 * 集約の明細から予算明細（budget_lines）と「支出」シートの行を作り直す文。確定したときと、予算の変更を反映したときに使う。
 * 付けた番号は明細に残す（次に補正予算を写すとき、この番号を引き継ぐ）。keepNumbers なら今の番号を残し、番号のない明細にだけ付ける。
 */
export function budgetFromItems(round: Pick<BudgetRound, 'kind'>, teams: BudgetTeam[], items: BudgetItem[], keepNumbers: boolean) {
  const db = useDb()
  const numbers = assignItemNumbers(teams, items, keepNumbers)
  const { lines, sheetRows } = parseBudgetRows(confirmSheetRows(teams, items, numbers))
  if (!lines.length) throw createError({ statusCode: 400, message: '明細がありません。' })
  const changed = items.filter(i => !i.deleted && i.itemNumber !== (numbers.get(i.id) ?? ''))
  const numberUpdates = Array.from({ length: Math.ceil(changed.length / CHUNK) }, (_, c) => {
    const chunk = changed.slice(c * CHUNK, (c + 1) * CHUNK)
    const cases = sql.join(chunk.map(i => sql`when ${i.id} then ${numbers.get(i.id) ?? ''}`), sql` `)
    return db.update(schema.budgetItems)
      .set({ itemNumber: sql`case ${schema.budgetItems.id} ${cases} end` })
      .where(inArray(schema.budgetItems.id, chunk.map(i => i.id)))
  })
  return { lines, numbers, statements: [...numberUpdates, ...replaceBudgetLinesStatements(lines, sheetRows, round.kind)] }
}

/** 集約をやめる（集約中の明細と担当を消す。確定した予算は変わらない） */
export async function cancelRound(round: BudgetRound) {
  const db = useDb()
  await db.batch([
    db.delete(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id)),
    db.delete(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id)),
    db.delete(schema.budgetRounds).where(eq(schema.budgetRounds.id, round.id)),
  ])
}

/** 画面に渡す集約の中身（局・担当、明細、仮の項目番号、自分が入力できる担当） */
export async function roundView(round: BudgetRound, user: SessionUser) {
  const db = useDb()
  // DB への問い合わせは同時に送る（1つずつ待つと、その回数だけ往復の時間がかかる）
  const [teams, items, me, members] = await Promise.all([
    db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id)).orderBy(asc(schema.budgetTeams.sortOrder)),
    db.select().from(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id)).orderBy(asc(schema.budgetItems.sortOrder)),
    db.query.users.findFirst({ where: eq(schema.users.email, user.email) }),
    db.select({ email: schema.users.email, name: schema.users.name, bureau: schema.users.budgetBureau, team: schema.users.budgetTeam })
      .from(schema.users).where(ne(schema.users.budgetTeam, '')),
  ])
  const numbers = round.status === 'confirmed'
    ? new Map(items.map(i => [i.id, i.itemNumber]))
    : assignItemNumbers(teams, items, round.kind === '補正予算')
  const editable = teams.filter(t => can(user.role, 'reviewBudget') || (me?.budgetBureau === t.bureau && me?.budgetTeam === t.team)).map(t => t.id)
  return {
    round,
    teams: teams.map(t => ({ ...t, members: members.filter(m => m.bureau === t.bureau && m.team === t.team).map(m => ({ email: m.email, name: m.name })) })),
    // 画面で使わない列（集約の番号・最後に直した人のメール）は返さない
    items: items.map(({ roundId: _r, updatedBy: _u, ...i }) => ({ ...i, number: numbers.get(i.id) ?? '' })),
    editableTeamIds: editable,
  }
}

/** 確定していない集約の明細と、その担当を読む（なければ 404、確定済みなら 409） */
export async function openItemOr404(itemId: number) {
  const item = await useDb().query.budgetItems.findFirst({ where: eq(schema.budgetItems.id, itemId) })
  if (!item) throw createError({ statusCode: 404, message: '明細が見つかりません。' })
  return { item, ...(await openTeamOr404(item.teamId)) }
}

/**
 * 担当が明細を直してよいか。財務管理部は確定までいつでも直せる。担当の人は
 * - 集約中：査定待ち以外の明細
 * - 査定中：要修正の明細（直して未提出に戻ったものも）だけ
 * - 集約終了：直せない
 */
export async function assertCanChangeItem(user: SessionUser, item: { status: string }, team: Pick<BudgetTeam, 'bureau' | 'team'>, round: Pick<BudgetRound, 'status'>) {
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は直せません。' })
  if (can(user.role, 'reviewBudget')) return
  if (round.status === 'collecting' && item.status !== 'submitted') return
  if (round.status === 'reviewing' && (item.status === 'returned' || item.status === 'draft')) return
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
