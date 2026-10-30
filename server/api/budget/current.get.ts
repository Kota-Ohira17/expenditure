/**
 * 予算の画面に出すもの。確定していない集約（集約中・集約終了・査定中）があればそれ、なければ最新の確定した予算。
 * 以前に取り込んだ予算明細しかなければ、それを最初の確定した予算として記録してから返す。
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  await ensureInitialRound(user)
  const round = (await openRound()) ?? (await latestConfirmedRound())
  return round ? await roundView(round, user) : null
})
