/**
 * 予算の画面に出すもの。集約中の予算があればそれ、なければ最新の確定した予算。
 * 以前に取り込んだ予算明細しかなければ、それを最初の確定した予算として記録してから返す。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await ensureInitialRound(user)
  const round = (await collectingRound()) ?? (await latestConfirmedRound())
  return round ? await roundView(round, user) : null
})
