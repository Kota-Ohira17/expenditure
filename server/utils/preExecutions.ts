import { and, eq, inArray } from 'drizzle-orm'
import { BUDGET_TERM, bureauNameOf } from '../../shared/constants'
import type { BudgetItemRow, BudgetRound, BudgetTeam, Entry } from '../db/schema'
import type { ParsedBudgetLine } from './budget'
import type { SessionUser } from './auth'

/**
 * ④予算前執行DB。本予算が確定する前に、新しい年度の分を執行した記録。
 * 予算前執行は、ふつうの執行依頼（③）と同じフォームで、予算の表から選ばずに支出項目名を書いて出す（台帳で執行する）。
 * 本予算の集約では、担当の画面にその担当の予算前執行を出し、「明細に追加」で今年の明細にする（item_id で結ぶ）。
 * 本予算が確定したら、結んだ明細（なければ同じ局・担当で同じ名前の予算明細）に、その執行依頼を付け替える（決算でその項目の執行になる）。
 */

/** 予算前執行の執行依頼を受け付けたとき、④に記録する */
export async function recordPreExecution(entry: Entry, user: SessionUser) {
  const round = await openRound()
  await useDb().insert(schema.preExecutionRequests).values({
    id: newId(),
    term: BUDGET_TERM,
    roundId: round?.kind === '本予算' ? round.id : null,
    bureau: bureauNameOf(entry.department),
    team: entry.inCharge,
    itemName: entry.itemName,
    reason: String(entry.details.preExecutionReason ?? ''),
    amount: entry.amount ?? 0,
    status: 'approved',
    entryId: entry.id,
    createdAt: entry.createdAt,
    createdBy: user.email,
  })
}

/** 依頼に書いた担当名に合う担当（同じ局で、英語名か日本語名が同じもの。完全に同じものを先に探し、なければ大文字・小文字を区別しない） */
function teamOfPreExecution<T extends Pick<BudgetTeam, 'bureau' | 'team' | 'nameJa'>>(teams: T[], p: { bureau: string, team: string }) {
  const name = p.team.trim()
  const same = teams.filter(t => t.bureau === p.bureau)
  return same.find(t => t.team === name || t.nameJa === name)
    ?? same.find(t => [t.team, t.nameJa].some(n => n.toLowerCase() === name.toLowerCase()))
    ?? null
}

/**
 * 本予算の集約の画面に出す、まだ本予算に付け替えていない予算前執行。
 * teamId は依頼に書いた担当名に合う担当（合わなければ null。同じ局の担当の画面で明細にできる）。
 * itemNumber は結んだ明細の項目番号（明細を消していたら空＝未追加に戻る）。
 */
export async function pendingPreExecutions(round: BudgetRound, teams: BudgetTeam[], latest: Map<string, BudgetItemRow>) {
  if (round.kind !== '本予算') return []
  const db = useDb()
  const list = await db.select().from(schema.preExecutionRequests)
    .where(and(eq(schema.preExecutionRequests.term, round.term), eq(schema.preExecutionRequests.status, 'approved')))
  const ids = list.map(p => p.entryId).filter((id): id is number => id != null)
  const entries = ids.length ? await db.select().from(schema.entries).where(inArray(schema.entries.id, ids)) : []
  return list
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((p) => {
      const entry = entries.find(e => e.id === p.entryId)
      const linked = p.itemId ? latest.get(p.itemId) : undefined
      return {
        id: p.id,
        teamId: teamOfPreExecution(teams, p)?.id ?? null,
        bureau: p.bureau,
        team: p.team,
        seq: entry?.seq ?? '',
        itemName: p.itemName,
        amount: entry?.amount ?? p.amount,
        reason: p.reason,
        itemNumber: linked && !linked.deleted ? linked.itemNumber : '',
      }
    })
}

/** 予算前執行を明細にしてよいかを確かめる（同じ局の、その担当か担当の分からないもの。支出だけ。もう明細になっていないこと） */
export async function preExecutionToLink(round: BudgetRound, team: BudgetTeam, id: string, flow: string) {
  if (flow !== 'expense') throw createError({ statusCode: 400, message: '予算前執行は支出の明細にしてください。' })
  const { teams, latest } = await roundState(round)
  const found = (await pendingPreExecutions(round, teams, latest)).find(p => p.id === id)
  if (!found) throw createError({ statusCode: 404, message: '予算前執行が見つかりません。ページを再読み込みしてください。' })
  if (found.bureau !== team.bureau || (found.teamId != null && found.teamId !== team.id)) throw createError({ statusCode: 400, message: 'この予算前執行は、別の担当のものです。' })
  if (found.itemNumber) throw createError({ statusCode: 409, message: `この予算前執行は、もう明細（${found.itemNumber}）になっています。` })
}

/** 予算前執行と、足した明細を結ぶ */
export const linkPreExecution = (id: string, itemId: string) =>
  useDb().update(schema.preExecutionRequests).set({ itemId }).where(eq(schema.preExecutionRequests.id, id))

/** 支出項目名が、予算明細の名前に合うか（名前そのもの、または項・目・節のどれか） */
const matches = (line: ParsedBudgetLine, name: string) => {
  const n = name.trim()
  return !!n && (line.label === n || [line.kan, line.kou, line.moku, line.setsu].includes(n))
}

/**
 * 本予算が確定したとき：まだ付け替えていない予算前執行を、確定した予算明細に付け替える。
 * 「明細に追加」で結んだ明細を先に使い、なければ同じ局・担当で名前の合う明細を探す。
 * 執行依頼に、その明細との対応（entry_items）を足し、項目番号もその明細の番号にする。合う明細がなければ予算外のまま確定済みにする。
 */
export async function settlePreExecutions(lines: (ParsedBudgetLine & { itemId: string })[]) {
  const db = useDb()
  const list = await db.select().from(schema.preExecutionRequests)
    .where(and(eq(schema.preExecutionRequests.status, 'approved')))
  const entryIds = list.map(p => p.entryId).filter((id): id is number => id != null)
  const entries = entryIds.length ? await db.select().from(schema.entries).where(inArray(schema.entries.id, entryIds)) : []
  for (const p of list) {
    const entry = entries.find(e => e.id === p.entryId)
    const candidates = lines.filter(l => l.bureau === p.bureau && l.team === p.team)
    const line = (p.itemId ? lines.find(l => l.itemId === p.itemId) : undefined) ?? candidates.find(l => matches(l, p.itemName)) ?? null
    await db.batch([
      db.update(schema.preExecutionRequests).set({ status: 'settled', lineKey: line?.key ?? null }).where(eq(schema.preExecutionRequests.id, p.id)),
      ...(line && entry
        ? [
            db.insert(schema.entryItems).values({
              entryId: entry.id, lineKey: line.key, itemId: line.itemId, itemNumber: line.itemNumber, label: line.label,
              quantity: line.quantity, vendor: line.vendor, budgetAmount: line.budgetAmount, actualAmount: entry.amount,
            }),
            db.update(schema.entries).set({ itemNumber: line.itemNumber }).where(eq(schema.entries.id, entry.id)),
          ]
        : []),
    ])
  }
}
