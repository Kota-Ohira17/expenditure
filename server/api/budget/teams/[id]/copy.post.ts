import { and, eq, inArray } from 'drizzle-orm'
import { budgetCopySchema } from '../../../../../shared/schemas'

/**
 * 取り込んだ昨年の本予算・決算の明細を、この担当の明細にコピーする（本予算の集約。その担当の人・財務管理部）。
 * コピーした明細は未提出から始まる。本予算の明細は昨年の予算額と比べられる（baseAmount）。予算外の決算からコピーしたものは新規。
 * すでにコピーした明細は飛ばす。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team, round } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は入力できません。' })
  assertCanAddItem(user, round)
  if (round.kind !== '本予算') throw createError({ statusCode: 409, message: 'コピーできるのは本予算の集約のときだけです。' })
  const { ids } = parseOr400(budgetCopySchema.safeParse(await readBody(event)))
  const db = useDb()
  const [sources, mine] = await Promise.all([
    db.select().from(schema.budgetReferences).where(and(
      inArray(schema.budgetReferences.id, ids),
      eq(schema.budgetReferences.bureau, team.bureau),
      eq(schema.budgetReferences.team, team.team),
    )),
    db.select({ referenceId: schema.budgetItems.referenceId, sortOrder: schema.budgetItems.sortOrder }).from(schema.budgetItems).where(eq(schema.budgetItems.teamId, team.id)),
  ])
  const done = new Set(mine.map(m => m.referenceId))
  // 本予算の明細を先に、それぞれ取り込んだ順に
  const todo = sources.filter(s => !done.has(s.id))
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder)
  if (!todo.length) return { count: 0 }
  // 担当のいちばん後ろに足す（番号は確定するときに付け直す）
  const start = Math.max(-1, ...mine.map(i => i.sortOrder)) + 1
  const now = new Date()
  await db.insert(schema.budgetItems).values(todo.map((s, i) => ({
    roundId: round.id,
    teamId: team.id,
    kan: s.kan,
    kou: s.kou,
    moku: s.moku,
    setsu: s.setsu,
    quantity: s.quantity,
    unitPrice: s.unitPrice,
    amount: s.amount,
    vendor: s.vendor,
    spec: s.spec,
    link: s.link,
    plannedTiming: s.plannedTiming,
    remark: s.remark,
    isNew: s.isNew,
    preExecution: s.preExecution,
    sortOrder: start + i,
    status: 'draft' as const,
    referenceId: s.id,
    baseAmount: s.kind === 'budget' ? s.amount : null,
    updatedAt: now,
    updatedBy: user.email,
  })))
  return { count: todo.length }
})
