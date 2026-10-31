import { and, desc, eq, inArray, like } from 'drizzle-orm'
import type { ParsedBudgetLine } from './budget'
import type { SessionUser } from './auth'

/**
 * ④予算前執行DB。本予算が確定する前に、新しい年度の分を執行するための枠。
 * 担当が申請（本予算の集約中だけ）→ 財務管理部が承認（認める額を決める）→ 執行依頼で「予算前執行」の予算明細として選べる
 * → 本予算が確定したら、同じ項目番号（なければ同じ局・担当・款・項・目・節）の予算明細に、その枠で執行した申請を付け替える。
 */

/** 予算明細での枠の key */
export const preLineKey = (id: string) => `pre:${id}`

/** 承認済みの枠を、執行依頼で選べる予算明細の形にする（予算明細のいちばん後ろに並べる） */
export async function preExecutionLines(offset: number): Promise<ParsedBudgetLine[]> {
  const list = await useDb().select().from(schema.preExecutionRequests).where(eq(schema.preExecutionRequests.status, 'approved'))
  return list.map((p, i) => {
    const name = [p.kou || p.kan, p.moku, p.setsu].filter(Boolean).join(' / ')
    return {
      key: preLineKey(p.id),
      sortOrder: offset + i,
      itemNumber: p.itemNumber || '予算前執行',
      bureauNo: '',
      bureau: p.bureau,
      team: p.team,
      kanNo: '',
      kan: p.kan,
      kouNo: '',
      kou: p.kou,
      moku: p.moku,
      setsu: p.setsu,
      level: 'none' as const,
      label: `【予算前執行】${name}`,
      quantity: p.quantity,
      vendor: p.vendor,
      budgetAmount: p.approvedAmount ?? p.amount,
      link: '',
      plannedTiming: p.neededBy,
      remark: p.reason,
    }
  })
}

/**
 * 本予算が確定したとき：承認済みの枠を、確定した予算明細に付け替える（その枠で執行した申請の明細の key・番号・名前も）。
 * 合う明細がない枠は、予算外のまま「確定済み」にする（決算では予算外の執行になる）。
 */
export async function settlePreExecutions(lines: ParsedBudgetLine[]) {
  const db = useDb()
  const list = await db.select().from(schema.preExecutionRequests).where(eq(schema.preExecutionRequests.status, 'approved'))
  for (const p of list) {
    const line = (p.itemNumber && lines.find(l => l.itemNumber === p.itemNumber && l.bureau === p.bureau && l.team === p.team))
      || lines.find(l => l.bureau === p.bureau && l.team === p.team && l.kan === p.kan && l.kou === p.kou && l.moku === p.moku && l.setsu === p.setsu)
      || null
    await db.batch([
      db.update(schema.preExecutionRequests).set({ status: 'settled', lineKey: line?.key ?? null }).where(eq(schema.preExecutionRequests.id, p.id)),
      ...(line
        ? [db.update(schema.entryItems).set({ lineKey: line.key, itemNumber: line.itemNumber, label: line.label }).where(eq(schema.entryItems.lineKey, preLineKey(p.id)))]
        : []),
    ])
  }
}

/** 枠ごとの、執行依頼で使った額（明細の執行額。未入力なら申請の金額）と件数 */
async function usage() {
  const db = useDb()
  const items = await db.select().from(schema.entryItems).where(like(schema.entryItems.lineKey, 'pre:%'))
  const entries = items.length
    ? await db.select({ id: schema.entries.id, amount: schema.entries.amount }).from(schema.entries).where(inArray(schema.entries.id, [...new Set(items.map(i => i.entryId))]))
    : []
  const amountOf = new Map(entries.map(e => [e.id, e.amount]))
  const result = new Map<string, { used: number, count: number }>()
  for (const i of items) {
    const id = i.lineKey.slice('pre:'.length)
    const r = result.get(id) ?? { used: 0, count: 0 }
    r.used += i.actualAmount ?? amountOf.get(i.entryId) ?? 0
    r.count++
    result.set(id, r)
  }
  return result
}

/** 画面に出す一覧（新しい順。だれが申請したかは出さず、自分の申請かどうかだけ） */
export async function preExecutionList(user: SessionUser) {
  const [list, used] = await Promise.all([
    useDb().select().from(schema.preExecutionRequests).orderBy(desc(schema.preExecutionRequests.createdAt)),
    usage(),
  ])
  return list.map(({ createdBy, reviewedBy: _r, ...p }) => ({ ...p, mine: createdBy === user.email, used: used.get(p.id)?.used ?? 0, usedCount: used.get(p.id)?.count ?? 0 }))
}

/** 申請（担当の人・財務管理部）。本予算の集約中だけ */
export async function createPreExecution(body: {
  teamId: number, itemNumber?: string | null, kan: string, kou: string, moku: string, setsu: string,
  quantity: string, vendor: string, amount: number, reason: string, neededBy: string,
}, user: SessionUser) {
  const db = useDb()
  const round = await openRound()
  if (!round || round.kind !== '本予算') throw createError({ statusCode: 409, message: '予算前執行は、本予算の集約中だけ申請できます。' })
  const team = await db.query.budgetTeams.findFirst({ where: and(eq(schema.budgetTeams.id, body.teamId), eq(schema.budgetTeams.roundId, round.id)) })
  if (!team) throw createError({ statusCode: 404, message: '担当が見つかりません。' })
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の予算前執行は申請できません。' })
  const [row] = await db.insert(schema.preExecutionRequests).values({
    id: newId(), term: round.term, roundId: round.id, bureau: team.bureau, team: team.team,
    itemNumber: body.itemNumber ?? '', kan: body.kan, kou: body.kou, moku: body.moku, setsu: body.setsu,
    quantity: body.quantity, vendor: body.vendor, amount: body.amount, reason: body.reason, neededBy: body.neededBy,
    createdAt: new Date(), createdBy: user.email,
  }).returning()
  return row!
}
