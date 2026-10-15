import { eq } from 'drizzle-orm'
import { notificationSettingsSchema } from '../../../shared/schemas'

/** 自分の通知設定を変える（本人だけ） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = parseOr400(notificationSettingsSchema.safeParse(await readBody(event)))
  const [row] = await useDb()
    .update(schema.users)
    .set({ dmOnCreated: body.dmOnCreated, dmOnExecuted: body.dmOnExecuted, slackEmail: body.slackEmail })
    .where(eq(schema.users.email, user.email))
    .returning()
  return { email: user.email, dmOnCreated: row!.dmOnCreated, dmOnExecuted: row!.dmOnExecuted, slackEmail: row!.slackEmail }
})
