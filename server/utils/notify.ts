import type { Entry } from '../db/schema'

type NotifyEvent = 'created' | 'executed'

const yen = (n: number | null) => (n == null ? '' : `¥${n.toLocaleString('ja-JP')}`)

/**
 * 申請者に送る Slack DM の本文。受け付けたとき（控え）と、対応済みになったときに送る。
 * 口座情報は入れない。
 */
export function dmTextOf(event: NotifyEvent, entry: Entry) {
  const name = entry.kind === 'evidence' ? '証憑提出' : '執行依頼'
  const lines = event === 'created'
    ? [`${name}を受け付けました（受付番号 ${entry.seq}）。`]
    : [`${name} ${entry.seq} が対応済みになりました。`]
  lines.push(`支出項目：${entry.itemName}（${entry.itemNumber}）`)
  lines.push(`執行形態：${event === 'executed' && entry.paymentMethod ? entry.paymentMethod : entry.type}`)
  if (entry.amount != null) lines.push(`金額：${yen(entry.amount)}`)
  if (event === 'created' && entry.deadline) lines.push(`期限・予定日：${entry.deadline}`)
  return lines.join('\n')
}

/**
 * n8n の Webhook に通知する（Slack 転送用）。失敗しても申請自体は成功扱いにする。
 * - entry: チャンネルに投稿する内容（口座情報・申請者のメールは除く）
 * - dm: 申請者本人への DM。n8n 側でメールから Slack のユーザーを探して送る（README 参照）
 */
export async function notifyN8n(event: NotifyEvent, entry: Entry) {
  const { n8nWebhookUrl, n8nWebhookSecret } = useRuntimeConfig()
  if (!n8nWebhookUrl) return
  try {
    await $fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: n8nWebhookSecret ? { 'X-Webhook-Secret': n8nWebhookSecret } : {},
      body: {
        event,
        entry: toNotification(entry),
        dm: { email: entry.applicantEmail, text: dmTextOf(event, entry) },
      },
      timeout: 10_000,
    })
  }
  catch (error) {
    console.error('[notifyN8n] 通知に失敗しました', entry.seq, error)
  }
}
