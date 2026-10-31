import { and, eq, inArray } from 'drizzle-orm'
import { BUDGET_TERM, bureauNameOf } from '../../shared/constants'
import type { Entry } from '../db/schema'
import type { ParsedBudgetLine } from './budget'
import type { SessionUser } from './auth'

/**
 * ④予算前執行DB。本予算が確定する前に、新しい年度の分を執行した記録。
 * 予算前執行は、ふつうの執行依頼（③）と同じフォームで、予算の表から選ばずに支出項目名を書いて出す（台帳で執行する）。
 * 本予算が確定したら、同じ局・担当で同じ名前の予算明細に、その執行依頼を付け替える（決算でその項目の執行になる）。
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
    amount: entry.amount ?? 0,
    status: 'approved',
    entryId: entry.id,
    createdAt: entry.createdAt,
    createdBy: user.email,
  })
}

/** 支出項目名が、予算明細の名前に合うか（名前そのもの、または項・目・節のどれか） */
const matches = (line: ParsedBudgetLine, name: string) => {
  const n = name.trim()
  return !!n && (line.label === n || [line.kan, line.kou, line.moku, line.setsu].includes(n))
}

/**
 * 本予算が確定したとき：まだ付け替えていない予算前執行を、確定した予算明細に付け替える。
 * 執行依頼に、その明細との対応（entry_items）を足し、項目番号もその明細の番号にする。合う明細がなければ予算外のまま確定済みにする。
 */
export async function settlePreExecutions(lines: ParsedBudgetLine[]) {
  const db = useDb()
  const list = await db.select().from(schema.preExecutionRequests)
    .where(and(eq(schema.preExecutionRequests.status, 'approved')))
  const entryIds = list.map(p => p.entryId).filter((id): id is number => id != null)
  const entries = entryIds.length ? await db.select().from(schema.entries).where(inArray(schema.entries.id, entryIds)) : []
  for (const p of list) {
    const entry = entries.find(e => e.id === p.entryId)
    const candidates = lines.filter(l => l.bureau === p.bureau && l.team === p.team)
    const line = candidates.find(l => matches(l, p.itemName)) ?? null
    await db.batch([
      db.update(schema.preExecutionRequests).set({ status: 'settled', lineKey: line?.key ?? null }).where(eq(schema.preExecutionRequests.id, p.id)),
      ...(line && entry
        ? [
            db.insert(schema.entryItems).values({
              entryId: entry.id, lineKey: line.key, itemNumber: line.itemNumber, label: line.label,
              quantity: line.quantity, vendor: line.vendor, budgetAmount: line.budgetAmount, actualAmount: entry.amount,
            }),
            db.update(schema.entries).set({ itemNumber: line.itemNumber }).where(eq(schema.entries.id, entry.id)),
          ]
        : []),
    ])
  }
}
