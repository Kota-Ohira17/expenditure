import { ITEM_STATUS_LABELS } from '#shared/budgetCompile'

/** 予算の画面に出す集約（集約中のもの、なければ最新の確定した予算）。予算の画面どうしで同じデータを共有する */
export function useBudgetRound() {
  return useFetch('/api/budget/current', { key: 'budget-current' })
}

export type BudgetRoundView = NonNullable<Awaited<ReturnType<typeof useBudgetRound>>['data']['value']>
export type BudgetTeamView = BudgetRoundView['teams'][number]
export type BudgetItemView = BudgetRoundView['items'][number]
export type BudgetPhase = BudgetRoundView['round']['status']

/** 集約の段階の名前（集約開始 → 集約終了 → 査定開始 → 確定 の順に進む） */
export const PHASE_LABELS: Record<BudgetPhase, string> = {
  collecting: '集約中',
  closed: '集約終了',
  reviewing: '査定中',
  confirmed: '確定',
}

/** 明細の状態の表示（削除する明細は「削除」を添える） */
export const itemStatusLabel = (i: Pick<BudgetItemView, 'status' | 'deleted'>) =>
  `${ITEM_STATUS_LABELS[i.status]}${i.deleted ? '（削除）' : ''}`

/** もとの予算からの変わり方（新規・削除・増減・変更なし） */
export function changeOf(i: Pick<BudgetItemView, 'amount' | 'baseAmount' | 'baseItemId' | 'deleted'>) {
  if (i.deleted) return { label: '削除', kind: 'minus' as const }
  if (i.baseAmount == null) return { label: '新規', kind: 'plus' as const }
  const d = i.amount - (i.baseAmount ?? 0)
  if (d === 0) return { label: '変更なし', kind: 'same' as const }
  return { label: `${d > 0 ? '+' : '-'}¥${Math.abs(d).toLocaleString('ja-JP')}`, kind: d > 0 ? 'plus' as const : 'minus' as const }
}

/** 明細の名前（項 / 目 / 節） */
export const itemName = (i: Pick<BudgetItemView, 'kou' | 'moku' | 'setsu'>) => [i.kou, i.moku, i.setsu].filter(Boolean).join(' / ')

/** 担当ごとの集計（件数・金額・状態ごとの件数） */
export function teamSummary(items: BudgetItemView[]) {
  const live = items.filter(i => !i.deleted)
  const count = (s: BudgetItemView['status']) => items.filter(i => i.status === s).length
  return {
    total: live.reduce((s, i) => s + i.amount, 0),
    base: items.reduce((s, i) => s + (i.baseAmount ?? 0), 0),
    draft: count('draft'),
    submitted: count('submitted'),
    returned: count('returned'),
    approved: count('approved'),
  }
}
