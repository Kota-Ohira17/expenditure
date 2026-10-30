/**
 * 予算の変更の画面に出すもの：変えられる予算（最新の確定した予算の局・担当と明細）、自分が申請できる担当、変更の一覧。
 * 集約中は open: true（変更はできない）。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const [open, round] = await Promise.all([openRound(), latestConfirmedRound()])
  const [view, changes, pending] = await Promise.all([
    round ? roundView(round, user) : null,
    changeList(user),
    pendingItemIds(),
  ])
  return {
    open: !!open,
    round: view?.round ?? null,
    teams: view?.teams.map(({ members: _m, ...t }) => t) ?? [],
    items: view?.items.filter(i => !i.deleted) ?? [],
    editableTeamIds: view?.editableTeamIds ?? [],
    pendingItemIds: pending,
    changes,
  }
})
