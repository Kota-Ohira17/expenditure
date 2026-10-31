import { can } from '../../../../shared/roles'

/**
 * 予算の変更の画面に出すもの：今の予算の局・担当と項目（①の承認済みの最新の行）、自分が申請できる担当、変更の一覧。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const [{ round, teams, rows }, changes, pending, me] = await Promise.all([
    currentBudget(), changeList(user), pendingItemNumbers(),
    useDb().query.users.findFirst({ where: (u, { eq }) => eq(u.email, user.email) }),
  ])
  const reviewer = can(user.role, 'reviewBudget')
  // 局・担当：確定した集約の局・担当（今の予算にしかない担当も足す。id は負の数）
  const list = teams.map(t => ({ id: t.id, bureauNo: t.bureauNo, bureau: t.bureau, team: t.team, sortOrder: t.sortOrder }))
  for (const r of rows) {
    if (!list.some(t => t.bureau === r.bureau && t.team === r.team)) list.push({ id: -list.length - 1, bureauNo: '', bureau: r.bureau, team: r.team, sortOrder: 1e6 + list.length })
  }
  const teamIdOf = (r: { bureau: string, team: string }) => list.find(t => t.bureau === r.bureau && t.team === r.team)!.id
  return {
    round,
    teams: list,
    items: rows.sort((a, b) => a.sortOrder - b.sortOrder).map(r => ({ id: r.id, number: r.itemNumber, teamId: teamIdOf(r), ...itemValues(r) })),
    editableTeamIds: list.filter(t => reviewer || (me?.budgetBureau === t.bureau && me?.budgetTeam === t.team)).map(t => t.id),
    pendingItemNumbers: pending,
    changes,
  }
})
