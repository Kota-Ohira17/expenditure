import { and, eq, or } from 'drizzle-orm'
import { BUDGET_TERM } from '../../shared/constants'
import type { BudgetItemInput } from '../../shared/schemas'
import type { BudgetChangeRequest, BudgetTeam } from '../db/schema'
import type { SessionUser } from './auth'

/**
 * ②予算変更申請DB。集約とは別に、今の予算（①の承認済みの最新の行）の項目を直す・足す・消す。
 * 申請 → 財務管理部が承認すると①に行を足す（作成者は承認した人）。補正予算の集約中は⑦にも行を足す。
 * 財務管理部は直接変更できる（申請と承認を同時に行った扱い）。足したら、執行依頼で選ぶ予算を作り直す。
 */

/** 今の予算の局・担当（最新の確定した集約の局・担当）と、今の予算の項目 */
export async function currentBudget() {
  const db = useDb()
  const [rows, round] = await Promise.all([currentRows(), latestConfirmedRound()])
  const teams = round ? await db.select().from(schema.budgetTeams).where(eq(schema.budgetTeams.roundId, round.id)) : []
  return { round, teams, rows }
}

/** 執行依頼で使われている項目か（使われていると、削除と名前の変更はできない） */
async function isExecuted(itemNumber: string) {
  if (!itemNumber) return false
  const db = useDb()
  const [item] = await db.select({ id: schema.entryItems.id }).from(schema.entryItems).where(eq(schema.entryItems.itemNumber, itemNumber)).limit(1)
  if (item) return true
  const [entry] = await db.select({ id: schema.entries.id }).from(schema.entries).where(eq(schema.entries.itemNumber, itemNumber)).limit(1)
  return !!entry
}

/** 変更を確かめる（担当と項目があるか、執行依頼で使われていないか）。申請するときと反映するときに使う */
export async function checkChange(change: { kind: BudgetChangeRequest['kind'], bureau: string, team: string, itemNumber: string, after: unknown }) {
  const { teams, rows } = await currentBudget()
  const team = teams.find(t => t.bureau === change.bureau && t.team === change.team)
    ?? (rows.some(r => r.bureau === change.bureau && r.team === change.team) ? { bureauNo: '', bureau: change.bureau, team: change.team } as BudgetTeam : null)
  if (!team) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  if (change.kind === 'add') return { team, row: null, rows }
  const row = rows.find(r => r.itemNumber === change.itemNumber && r.bureau === change.bureau && r.team === change.team)
  if (!row) throw createError({ statusCode: 404, message: '変える項目が予算に見つかりません（ほかの変更で消えた可能性があります）。' })
  if (await isExecuted(row.itemNumber)) {
    if (change.kind === 'delete') throw createError({ statusCode: 409, message: 'この項目は執行依頼で使われているので、削除できません。' })
    const after = change.after as BudgetItemInput
    const renamed = (['kan', 'kou', 'moku', 'setsu'] as const).some(k => (after[k] ?? '') !== row[k])
    if (renamed) throw createError({ statusCode: 409, message: 'この項目は執行依頼で使われているので、款・項・目・節の名前は変えられません。' })
  }
  return { team, row, rows }
}

/** 承認待ちの変更がすでにある項目なら 409（同じ項目に申請が重ならないように） */
export async function assertNoPending(itemNumber: string) {
  if (!itemNumber) return
  const found = await useDb().query.budgetChangeRequests.findFirst({
    where: and(eq(schema.budgetChangeRequests.itemNumber, itemNumber), eq(schema.budgetChangeRequests.status, 'pending')),
  })
  if (found) throw createError({ statusCode: 409, message: 'この項目には承認待ちの変更があります。承認か却下を待つか、取り下げてから申請してください。' })
}

/** 変更を承認して①に行を足す（補正予算の集約中は⑦にも）。執行依頼で選ぶ予算を作り直す */
export async function applyChange(change: BudgetChangeRequest, user: SessionUser, comment = '') {
  const db = useDb()
  const { team, row, rows } = await checkChange(change)
  const now = new Date()
  const after = change.after as BudgetItemInput | null
  const open = await openRound()
  const revising = open?.kind === '補正予算' ? open : null

  let itemNumber = change.itemNumber
  let values: typeof schema.mainBudgetItems.$inferInsert
  if (change.kind === 'add') {
    const used = await usedNumbers(revising)
    const bureauNo = team.bureauNo || rows.find(r => r.bureau === team.bureau)?.itemNumber.match(/^[a-z]+-?\d+/i)?.[0] || ''
    itemNumber = nextItemNumber(used, { bureauNo, bureau: team.bureau, team: team.team }, after!.kan as string)
    values = {
      id: newId(), term: BUDGET_TERM, roundId: null, itemNumber, bureau: team.bureau, team: team.team,
      ...itemValues(after as unknown as ItemValues), deleted: false, status: 'approved',
      sortOrder: sortOrderFor(rows, team, after!.kan as string), createdAt: now, createdBy: user.email,
    }
  }
  else {
    values = {
      ...row!, id: newId(), roundId: null, ...(change.kind === 'edit' ? itemValues(after as unknown as ItemValues) : {}),
      deleted: change.kind === 'delete', status: 'approved', createdAt: now, createdBy: user.email,
    }
  }
  await db.batch([
    db.insert(schema.mainBudgetItems).values(values),
    // 補正予算の集約中は⑦にも足す（査定の状態は変えない）
    ...(revising ? [db.insert(schema.revisedBudgetItems).values({ ...values, id: newId(), roundId: revising.id, status: 'draft' })] : []),
    db.update(schema.budgetChangeRequests).set({ status: 'approved', itemNumber, reviewComment: comment, reviewedAt: now, reviewedBy: user.email })
      .where(eq(schema.budgetChangeRequests.id, change.id)),
  ] as const)
  await rebuildCurrentBudget()
}

/** 画面に出す変更の一覧（新しい順。だれが変えたかは出さず、自分の申請かどうかだけ） */
export async function changeList(user: SessionUser) {
  const changes = await useDb().select().from(schema.budgetChangeRequests)
  return changes.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ createdBy, reviewedBy: _r, ...c }) => ({ ...c, mine: createdBy === user.email }))
}

/** 承認待ちの変更がある項目の番号（明細の一覧で「承認待ちあり」を出すため） */
export async function pendingItemNumbers() {
  const rows = await useDb().select({ itemNumber: schema.budgetChangeRequests.itemNumber }).from(schema.budgetChangeRequests)
    .where(and(eq(schema.budgetChangeRequests.status, 'pending'), or(eq(schema.budgetChangeRequests.kind, 'edit'), eq(schema.budgetChangeRequests.kind, 'delete'))))
  return rows.map(r => r.itemNumber).filter(Boolean)
}
