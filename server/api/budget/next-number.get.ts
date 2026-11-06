import { bureauNameOf } from '../../../shared/constants'

/**
 * 予算にない項目の執行依頼で、項目番号の候補を出す（局の略称・担当名・款から）。
 * 予算の番号の付け方（nextItemNumber）と同じで、同じ担当・同じ款が予算か、これまでの予算にない執行依頼にあればその款の番号の続き、
 * なければその局の新しい款の番号にする。担当が今の予算の担当に見つからなければ、候補は出さない。
 */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const query = getQuery(event)
  const bureau = bureauNameOf(String(query.bureau ?? '').trim())
  const name = String(query.team ?? '').trim().toLowerCase()
  const kan = String(query.kan ?? '').trim()
  const flow = query.flow === 'income' ? 'income' : 'expense'
  if (!bureau || !name) return { itemNumber: '' }

  const round = (await openRound()) ?? (await latestConfirmedRound())
  if (!round) return { itemNumber: '' }
  const { teams } = await teamsOf(round.id)
  // 担当名は英語の略称でも日本語名でもよく、大文字・小文字は区別しない
  const team = teams.find(t => t.bureau === bureau && teamNamesOf(t).some(x => x.toLowerCase() === name))
  if (!team) return { itemNumber: '' }

  // 候補なので、番号は取らない（避ける番号は、予算の明細を足すときと同じ）
  const { used, reserved } = await numbersInUse(round.status === 'confirmed' ? null : round, teams)
  return { itemNumber: nextItemNumber(used, team, kan, flow, reserved) }
})
