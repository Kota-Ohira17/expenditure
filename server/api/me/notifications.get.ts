import { eq } from 'drizzle-orm'

/** 自分の通知設定（Slack の DM） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const row = await useDb().query.users.findFirst({ where: eq(schema.users.email, user.email) })
  return {
    email: user.email,
    dmOnCreated: row?.dmOnCreated ?? true,
    dmOnExecuted: row?.dmOnExecuted ?? true,
    slackEmail: row?.slackEmail ?? '',
  }
})
