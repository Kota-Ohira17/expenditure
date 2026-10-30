import { eq } from 'drizzle-orm'
import { can } from '../../../../shared/roles'
import { budgetChangeSchema } from '../../../../shared/schemas'

/**
 * 予算の変更（修正・追加・削除）。その担当の人は申請（承認待ち）、財務管理部はそのまま予算に反映する。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = parseOr400(budgetChangeSchema.safeParse(await readBody(event)))
  const round = await changeableRound()
  const draft = { kind: body.kind, teamId: body.teamId, itemId: body.kind === 'add' ? null : body.itemId!, after: body.values ?? null }
  const { team, item } = await checkChange(draft, round.id)
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の予算は変更を申請できません。' })
  await assertNoPending(draft.itemId)

  const direct = can(user.role, 'reviewBudget')
  const [change] = await useDb().insert(schema.budgetChanges).values({
    ...draft,
    roundId: round.id,
    itemNumber: item?.itemNumber ?? '',
    before: item ? itemValues(item) : null,
    after: body.kind === 'delete' ? null : body.values!,
    reason: body.reason,
    direct,
    createdAt: new Date(),
    createdBy: user.email,
  }).returning()
  if (direct) {
    try {
      await applyChange(change!, user)
    }
    catch (error) {
      // 反映できなかった直接の変更は、記録にも残さない
      await useDb().delete(schema.budgetChanges).where(eq(schema.budgetChanges.id, change!.id))
      throw error
    }
  }
  return { id: change!.id, applied: direct }
})
