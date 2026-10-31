import { preExecutionSchema } from '../../../../shared/schemas'

/** 予算前執行の申請（担当の人・財務管理部。本予算の集約中だけ） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = parseOr400(preExecutionSchema.safeParse(await readBody(event)))
  return createPreExecution(body, user)
})
