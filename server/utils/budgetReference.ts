import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm'
import type { BudgetRound, BudgetTeam } from '../db/schema'

/**
 * 本予算の集約で参考にする「昨年の予算・決算」。
 * 予算は集約のもとにした確定済みの予算（補正があれば補正後）の明細、決算はその明細で執行した額（対応済みの申請の執行額の合計）。
 * 担当は局・担当の名前が同じものを昨年の担当とみなす。
 */

/** 決算に数える申請の始まり（昨年の本予算が確定した日。最初に取り込んだ予算なら区切らない） */
async function termStart(baseRoundId: number) {
  const db = useDb()
  const base = await db.query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, baseRoundId) })
  if (!base) return null
  const main = base.kind === '本予算'
    ? base
    : await db.query.budgetRounds.findFirst({
        where: and(eq(schema.budgetRounds.kind, '本予算'), eq(schema.budgetRounds.status, 'confirmed')),
        orderBy: [desc(schema.budgetRounds.confirmedAt)],
      })
  return main && main.baseRoundId != null ? main.confirmedAt : null
}

/** 項目番号ごとの決算額（対応済みの申請の執行額。執行額が未入力の申請は数えず、件数だけ返す） */
async function actualsByNumber(since: Date | null) {
  const db = useDb()
  const entries = await db.select().from(schema.entries)
    .where(since ? and(eq(schema.entries.status, 'done'), gte(schema.entries.createdAt, since)) : eq(schema.entries.status, 'done'))
  if (!entries.length) return new Map<string, { amount: number, unknown: number }>()
  const items = await db.select().from(schema.entryItems).where(inArray(schema.entryItems.entryId, entries.map(e => e.id)))
  const itemsOf = new Map<number, typeof items>()
  for (const i of items) itemsOf.set(i.entryId, [...(itemsOf.get(i.entryId) ?? []), i])
  const result = new Map<string, { amount: number, unknown: number }>()
  const add = (no: string, amount: number | null) => {
    const r = result.get(no) ?? { amount: 0, unknown: 0 }
    if (amount == null) r.unknown++
    else r.amount += amount
    result.set(no, r)
  }
  for (const e of entries) {
    const list = itemsOf.get(e.id) ?? []
    if (!list.length) add(e.itemNumber, e.amount)
    for (const i of list) add(i.itemNumber, actualAmountOf(i, { ...e, items: list }))
  }
  return result
}

/** その担当の昨年の明細と決算額。集約していない・もとの予算がないときは null */
export async function referenceFor(round: Pick<BudgetRound, 'id' | 'baseRoundId'>, team: Pick<BudgetTeam, 'bureau' | 'team'>) {
  if (round.baseRoundId == null) return null
  const db = useDb()
  const [baseRound, baseTeam] = await Promise.all([
    db.query.budgetRounds.findFirst({ where: eq(schema.budgetRounds.id, round.baseRoundId) }),
    db.query.budgetTeams.findFirst({
      where: and(eq(schema.budgetTeams.roundId, round.baseRoundId), eq(schema.budgetTeams.bureau, team.bureau), eq(schema.budgetTeams.team, team.team)),
    }),
  ])
  if (!baseRound) return null
  if (!baseTeam) return { round: baseRound, items: [] }
  const [items, copied, actuals] = await Promise.all([
    db.select().from(schema.budgetItems)
      .where(and(eq(schema.budgetItems.teamId, baseTeam.id), eq(schema.budgetItems.deleted, false)))
      .orderBy(asc(schema.budgetItems.sortOrder)),
    db.select({ baseItemId: schema.budgetItems.baseItemId }).from(schema.budgetItems).where(eq(schema.budgetItems.roundId, round.id)),
    termStart(round.baseRoundId).then(actualsByNumber),
  ])
  const copiedIds = new Set(copied.map(c => c.baseItemId))
  return {
    round: baseRound,
    items: items.map(({ roundId: _r, updatedBy: _u, status: _s, reviewComment: _c, ...i }) => ({
      ...i,
      actual: actuals.get(i.itemNumber)?.amount ?? 0,
      actualUnknown: actuals.get(i.itemNumber)?.unknown ?? 0,
      copied: copiedIds.has(i.id),
    })),
  }
}
