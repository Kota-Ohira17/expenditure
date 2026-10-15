import { eq } from 'drizzle-orm'

/**
 * 画面がセッションを取り直す（/api/_auth/session）ときに、権限を DB から読み直す。
 * 管理者が権限を変えたら、本人の画面の表示（メニューなど）にも反映される。
 */
export default defineNitroPlugin(() => {
  sessionHooks.hook('fetch', async (session, event) => {
    if (!session.user) return
    const user = await useDb().query.users.findFirst({ where: eq(schema.users.email, session.user.email) })
    if (!user) {
      await clearUserSession(event)
      throw createError({ statusCode: 401, message: 'もう一度ログインしてください。' })
    }
    const current = { email: user.email, name: user.name, role: user.role }
    session.user = current
    await setUserSession(event, { user: current, loggedInAt: session.loggedInAt })
  })
})
