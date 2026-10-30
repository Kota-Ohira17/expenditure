import { and, eq, inArray, or } from 'drizzle-orm'
import type { BudgetItemInput } from '../../shared/schemas'
import type { BudgetChange, BudgetItem } from '../db/schema'
import type { SessionUser } from './auth'

/**
 * 予算の変更（集約とは別に、確定した予算の明細を直す・足す・消す）。
 * 変更は最新の確定した予算の明細に反映し、予算明細（執行依頼で選ぶもの）と「支出」シートの行を作り直す。
 * 集約中（確定していない集約があるとき）は変更できない（集約の明細で直す）。
 */

/** 変更前後に記録する明細の値（予算の明細の入力と同じ項目） */
const ITEM_FIELDS = ['kan', 'kou', 'moku', 'setsu', 'quantity', 'unitPrice', 'amount', 'vendor', 'spec', 'link', 'plannedTiming', 'remark', 'isNew', 'preExecution'] as const
export const itemValues = (i: Pick<BudgetItem, typeof ITEM_FIELDS[number]>) => Object.fromEntries(ITEM_FIELDS.map(k => [k, i[k]]))

/** 変えられる予算（最新の確定した予算）。集約中なら 409 */
export async function changeableRound() {
  if (await openRound()) throw createError({ statusCode: 409, message: '集約中は予算の変更はできません。集約の明細で直してください。' })
  const round = await latestConfirmedRound()
  if (!round) throw createError({ statusCode: 400, message: 'まだ確定した予算がありません。' })
  return round
}

/** 執行依頼で使われている明細か（使われていると、削除と名前の変更はできない） */
async function isExecuted(itemNumber: string) {
  if (!itemNumber) return false
  const db = useDb()
  const [item] = await db.select({ id: schema.entryItems.id }).from(schema.entryItems).where(eq(schema.entryItems.itemNumber, itemNumber)).limit(1)
  if (item) return true
  const [entry] = await db.select({ id: schema.entries.id }).from(schema.entries).where(eq(schema.entries.itemNumber, itemNumber)).limit(1)
  return !!entry
}

/** 変更を確かめる（明細があるか、執行依頼で使われていないか）。申請するときと反映するときに使う */
export async function checkChange(change: Pick<BudgetChange, 'kind' | 'teamId' | 'itemId' | 'after'>, roundId: number) {
  const db = useDb()
  const team = await db.query.budgetTeams.findFirst({ where: eq(schema.budgetTeams.id, change.teamId) })
  if (!team || team.roundId !== roundId) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  if (change.kind === 'add') return { team, item: null }
  const item = change.itemId ? await db.query.budgetItems.findFirst({ where: eq(schema.budgetItems.id, change.itemId) }) : undefined
  if (!item || item.roundId !== roundId || item.teamId !== team.id || item.deleted) {
    throw createError({ statusCode: 404, message: '変える明細が予算に見つかりません（ほかの変更で消えた可能性があります）。' })
  }
  if (await isExecuted(item.itemNumber)) {
    if (change.kind === 'delete') throw createError({ statusCode: 409, message: 'この明細は執行依頼で使われているので、削除できません。' })
    const after = change.after as BudgetItemInput
    const renamed = (['kan', 'kou', 'moku', 'setsu'] as const).some(k => (after[k] ?? '') !== item[k])
    if (renamed) throw createError({ statusCode: 409, message: 'この明細は執行依頼で使われているので、款・項・目・節の名前は変えられません。' })
  }
  return { team, item }
}

/** 承認待ちの変更がすでにある明細なら 409（同じ明細に申請が重ならないように） */
export async function assertNoPending(itemId: number | null | undefined) {
  if (!itemId) return
  const found = await useDb().query.budgetChanges.findFirst({
    where: and(eq(schema.budgetChanges.itemId, itemId), eq(schema.budgetChanges.status, 'pending')),
  })
  if (found) throw createError({ statusCode: 409, message: 'この明細には承認待ちの変更があります。承認か却下を待つか、取り下げてから申請してください。' })
}

/** 変更を予算に反映し、変更を承認済みにする */
export async function applyChange(change: BudgetChange, user: SessionUser, comment = '') {
  const db = useDb()
  const round = await changeableRound()
  if (change.roundId !== round.id) throw createError({ statusCode: 409, message: 'この変更のあとに予算が確定し直されたので、反映できません。却下してください。' })
  const { team, item } = await checkChange(change, round.id)
  const now = new Date()
  const after = change.after as BudgetItemInput | null

  // 明細を直す・足す・消す
  let itemId = item?.id ?? null
  if (change.kind === 'edit') {
    // 款を変えたら、その款の番号を付け直す
    const itemNumber = after!.kan === item!.kan ? item!.itemNumber : ''
    await db.update(schema.budgetItems).set({ ...after!, itemNumber, updatedAt: now, updatedBy: user.email } as Partial<BudgetItem>)
      .where(eq(schema.budgetItems.id, item!.id))
  }
  else if (change.kind === 'delete') {
    await db.update(schema.budgetItems).set({ deleted: true, updatedAt: now, updatedBy: user.email }).where(eq(schema.budgetItems.id, item!.id))
  }
  else {
    // 同じ款のいちばん後ろ（新しい款なら担当のいちばん後ろ）に入れる
    const rows = await db.select({ kan: schema.budgetItems.kan, sortOrder: schema.budgetItems.sortOrder })
      .from(schema.budgetItems).where(eq(schema.budgetItems.teamId, team.id))
    const sameKan = rows.filter(i => i.kan === after!.kan)
    const last = Math.max(-1, ...(sameKan.length ? sameKan : rows).map(i => i.sortOrder))
    const next = rows.filter(i => i.sortOrder > last).map(i => i.sortOrder)
    const [added] = await db.insert(schema.budgetItems).values({
      ...(after as typeof schema.budgetItems.$inferInsert), roundId: round.id, teamId: team.id, sortOrder: next.length ? (last + Math.min(...next)) / 2 : last + 1,
      status: 'approved', updatedAt: now, updatedBy: user.email,
    }).returning()
    itemId = added!.id
  }

  // 予算明細と「支出」シートの行を作り直し、変更を承認済みにする（1回のやりとりで）
  const [teams, items] = await Promise.all([
    db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id)),
    db.select().from(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id)),
  ])
  const { numbers, statements } = budgetFromItems(round, teams, items, true)
  await db.batch([
    db.update(schema.budgetChanges).set({
      status: 'approved', itemId, itemNumber: (itemId && numbers.get(itemId)) || item?.itemNumber || '',
      reviewComment: comment, reviewedAt: now, reviewedBy: user.email,
    }).where(eq(schema.budgetChanges.id, change.id)),
    ...statements,
  ])
}

/** 画面に渡す変更の一覧（新しい順。だれが変えたかは出さず、自分の申請かどうかだけ） */
export async function changeList(user: SessionUser) {
  const db = useDb()
  const changes = await db.select().from(schema.budgetChanges).orderBy(schema.budgetChanges.id)
  const teamIds = [...new Set(changes.map(c => c.teamId))]
  const teams = teamIds.length ? await db.select().from(schema.budgetTeams).where(inArray(schema.budgetTeams.id, teamIds)) : []
  const teamById = new Map(teams.map(t => [t.id, t]))
  return changes.reverse().map(({ createdBy, reviewedBy: _r, ...c }) => ({
    ...c,
    bureau: teamById.get(c.teamId)?.bureau ?? '',
    team: teamById.get(c.teamId)?.team ?? '',
    mine: createdBy === user.email,
  }))
}

/** 承認待ちの変更（明細ごと）。明細の一覧で「承認待ちあり」を出すため */
export async function pendingItemIds() {
  const rows = await useDb().select({ itemId: schema.budgetChanges.itemId }).from(schema.budgetChanges)
    .where(and(eq(schema.budgetChanges.status, 'pending'), or(eq(schema.budgetChanges.kind, 'edit'), eq(schema.budgetChanges.kind, 'delete'))))
  return rows.map(r => r.itemId).filter((id): id is number => id != null)
}
