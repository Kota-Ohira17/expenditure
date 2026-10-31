/** 担当の未提出・要修正の明細をまとめて提出する（査定待ちになる）。集約終了の間は提出できない */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { team, round } = await openTeamOr404(Number(getRouterParam(event, 'id')))
  if (round.status === 'closed') throw createError({ statusCode: 409, message: '集約は終了しました。査定が始まると、要修正になった明細だけ出し直せます。' })
  if (!(await canEditTeam(user, team))) throw createError({ statusCode: 403, message: 'この担当の明細は提出できません。' })
  const numbers = await numbersWhere(round, (s, teamId) => teamId === team.id && (s === 'draft' || s === 'returned'))
  if (!numbers.length) throw createError({ statusCode: 400, message: '提出する明細がありません。' })
  return { count: await setStatuses(round, numbers, 'submit', user, '担当のすべて提出') }
})
