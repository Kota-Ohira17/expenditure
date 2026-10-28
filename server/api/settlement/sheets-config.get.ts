/** スプレッドシート出力の設定状況（Google の OAuth の設定があるか、本人の Google の許可がまだ有効か） */
export default defineEventHandler(async (event) => {
  const user = await requirePermission(event, 'exportSettlement')
  return { configured: sheetsOAuthConfigured(), email: user.email, connected: !!(await sheetsAccessToken(event)) }
})
