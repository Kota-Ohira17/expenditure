import { eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { bureauNameOf } from '../../shared/constants'
import type { SessionUser } from './auth'

/**
 * 集約の段取り（局・部・担当と入力する人の設定）と、昨年の本予算・決算の取り込みができる人：
 * 管理者と、財務局長補佐（財務局 ZAI の zas）に割り当てられた人（ユーザー管理の「予算を入力する担当」）。
 * 財務管理部・財務局長でも、zas に割り当てられていなければできない。
 */
export async function canArrangeBudget(user: SessionUser) {
  if (user.role === 'admin') return true
  const me = await useDb().query.users.findFirst({ where: eq(schema.users.email, user.email) })
  return !!me && me.budgetBureau === bureauNameOf('ZAI') && me.budgetTeam.toLowerCase() === 'zas'
}

/** 段取りができる人でなければ 403 */
export async function requireArrangeBudget(event: H3Event) {
  const user = await requireUser(event)
  if (!(await canArrangeBudget(user))) throw createError({ statusCode: 403, message: 'この操作は、管理者と財務局長補佐（ZAI の zas）だけができます。' })
  return user
}
