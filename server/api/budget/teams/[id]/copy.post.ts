import { and, eq, inArray } from 'drizzle-orm'
import { budgetCopySchema } from '../../../../../shared/schemas'
import { flowOf } from '../../../../../shared/budgetCompile'

/**
 * 取り込んだ昨年の本予算・決算の明細を、この担当の明細として①に足す（本予算の集約。その担当の人・財務管理部）。
 * 項目番号は取り込んだ明細の番号のまま（その期でまだ使っていなければ。別の項目に使っていれば新しい番号）。未提出から始まる。
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
  const [sources, { latest }, used, issued] = await Promise.all([
    db.select().from(schema.budgetReferences).where(and(
      inArray(schema.budgetReferences.id, ids),
      eq(schema.budgetReferences.bureau, team.bureau),
      inArray(schema.budgetReferences.team, teamNamesOf(team)),
    )),
    roundState(round),
    usedNumbers(round),
    issuedNumbers(round.term),
  ])
  const inRound = new Set([...latest.values()].filter(r => !r.deleted).map(r => referenceNumberOf(r.itemNumber, issued)))
  // 本予算の明細を先に、それぞれ取り込んだ順に
  const todo = sources.filter(s => !inRound.has(s.itemNumber)).sort((a, b) => a.kind.localeCompare(b.kind) || a.sortOrder - b.sortOrder)
  const rows = [...latest.values()]
  for (const s of todo) {
    // 番号：取り込んだ番号が、その期の同じ担当の項目のもの（または未使用）ならそのまま
    const owner = used.get(s.itemNumber)
    const reusable = s.itemNumber && (!owner || (owner.bureau === team.bureau && owner.team === team.team)) && issued.get(s.itemNumber)?.source !== 'allocated'
    if (reusable) await claimCopiedNumber(round.term, s.itemNumber)
    const itemNumber = reusable ? s.itemNumber : await allocateItemNumber(round, team, s.kan, flowOf(s.itemNumber), s.itemNumber)
    const row = await writeItem(round, null, {
      // 前の予算に同じ番号の項目があれば、同じ項目として続ける
      itemId: reusable ? owner?.itemId : undefined,
      kan: s.kan, kou: s.kou, moku: s.moku, setsu: s.setsu, quantity: s.quantity, unitPrice: s.unitPrice, amount: s.amount,
      vendor: s.vendor, spec: s.spec, link: s.link, plannedTiming: s.plannedTiming, remark: s.remark, isNew: s.isNew, preExecution: s.preExecution,
      itemNumber, bureau: team.bureau, team: team.team, sortOrder: sortOrderFor(rows, team, s.kan),
    }, user, 'draft')
    rows.push(row)
    used.set(itemNumber, row)
    inRound.add(itemNumber)
  }
  return { count: todo.length }
})
