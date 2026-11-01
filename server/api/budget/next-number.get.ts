import { like } from 'drizzle-orm'
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
  if (!bureau || !name) return { itemNumber: '' }

  const round = (await openRound()) ?? (await latestConfirmedRound())
  if (!round) return { itemNumber: '' }
  const { teams } = await teamsOf(round.id)
  // 担当名は英語の略称でも日本語名でもよく、大文字・小文字は区別しない
  const teamOf = (b: string, n: string) => teams.find(t => t.bureau === b && teamNamesOf(t).some(x => x.toLowerCase() === n.trim().toLowerCase()))
  const team = teamOf(bureau, name)
  if (!team) return { itemNumber: '' }

  // 予算で使っている番号に、予算にない項目として出した執行依頼の番号も足す（同じ番号を2回出さない）
  const used = await usedNumbers(null)
  const outside = await useDb().select({ itemNumber: schema.entries.itemNumber, department: schema.entries.department, inCharge: schema.entries.inCharge, details: schema.entries.details })
    .from(schema.entries).where(like(schema.entries.itemNumber, 'out%'))
  for (const e of outside) {
    if (used.has(e.itemNumber)) continue
    const b = bureauNameOf(e.department)
    const t = teamOf(b, e.inCharge)
    const kanOf = (e.details as { budgetPath?: { kan?: string } }).budgetPath?.kan ?? ''
    used.set(e.itemNumber, { itemNumber: e.itemNumber, bureau: b, team: t?.team ?? e.inCharge, kan: kanOf })
  }
  return { itemNumber: nextItemNumber(used, team, kan) }
})
