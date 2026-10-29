import { and, eq, inArray } from 'drizzle-orm'
import { budgetMembersSchema } from '../../../../../shared/schemas'

/** 担当に入力する人を割り当てる（財務管理部）。一覧にない人は、この担当から外れる。1人が持てる担当は1つ */
export default defineEventHandler(async (event) => {
  await requirePermission(event, 'reviewBudget')
  const { team } = await collectingTeamOr404(Number(getRouterParam(event, 'id')))
  const { emails } = parseOr400(budgetMembersSchema.safeParse(await readBody(event)))
  const db = useDb()
  const known = emails.length ? await db.select({ email: schema.users.email }).from(schema.users).where(inArray(schema.users.email, emails)) : []
  const missing = emails.filter(e => !known.some(k => k.email === e))
  if (missing.length) throw createError({ statusCode: 400, message: `登録されていない人がいます：${missing.join('、')}（先に「ユーザー」で登録してください）。` })
  const clear = db.update(schema.users).set({ budgetBureau: '', budgetTeam: '' })
    .where(and(eq(schema.users.budgetBureau, team.bureau), eq(schema.users.budgetTeam, team.team)))
  if (!emails.length) await clear
  else await db.batch([clear, db.update(schema.users).set({ budgetBureau: team.bureau, budgetTeam: team.team }).where(inArray(schema.users.email, emails))])
  return { ok: true }
})
