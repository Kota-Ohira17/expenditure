/** 「削除」の印を外す（その担当の人・財務管理部）。消す前の内容の行を足す */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { row, team, round, status } = await openItemOr404(String(getRouterParam(event, 'id')))
  await assertCanChangeItem(user, status, team, round)
  await writeItem(round, row, { ...itemValues(row), deleted: false }, user, status)
  return { ok: true }
})
