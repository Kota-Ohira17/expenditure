/** 予算前執行の画面に出すもの：一覧、本予算の集約（申請できる担当）、集約中の項目（対応する項目を選ぶため） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const round = await openRound()
  const view = round?.kind === '本予算' ? await roundView(round, user) : null
  return {
    open: !!view,
    teams: view?.teams.map(({ members: _m, ...t }) => t) ?? [],
    editableTeamIds: view?.editableTeamIds ?? [],
    items: view?.items.filter(i => !i.deleted).map(i => ({ number: i.number, teamId: i.teamId, kan: i.kan, kou: i.kou, moku: i.moku, setsu: i.setsu, quantity: i.quantity, vendor: i.vendor, amount: i.amount })) ?? [],
    list: await preExecutionList(user),
  }
})
