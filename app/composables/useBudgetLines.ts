import { flowOf } from '#shared/budgetCompile'

/** 支出の予算明細（執行依頼で選ぶもの）。フォームと選択部品で同じデータを共有する */
export function useBudgetLines() {
  return useFetch('/api/budget-lines', { key: 'budget-lines', default: () => [], transform: rows => rows.filter(l => flowOf(l.itemNumber) === 'expense') })
}

/** 収入の予算明細（収入の記録で選ぶもの。項目番号が in から始まる） */
export function useIncomeLines() {
  return useFetch('/api/budget-lines', { key: 'income-lines', default: () => [], transform: rows => rows.filter(l => flowOf(l.itemNumber) === 'income') })
}

/** 取り込んである予算が本予算か補正予算か（まだ取り込んでいなければ「予算」）。フォームの文言に使う */
export function useBudgetKind() {
  const { data } = useBudgetLines()
  return computed(() => data.value[0]?.budgetKind ?? '予算')
}

export type BudgetLineView =NonNullable<ReturnType<typeof useBudgetLines>['data']['value']>[number]

export const formatYen = (n: number | null | undefined) =>
  n == null ? '' : `${n < 0 ? '-' : ''}¥${Math.abs(n).toLocaleString('ja-JP')}`

/**
 * 取引先が空欄の明細に、フォームで入れた取引先（発注なら通販サイト、立替なら購入先）を入れる。
 * 自分で入力した取引先は上書きせず、ここで入れたものだけを入力に合わせて入れ替える。
 */
export function useVendorDefault(vendors: Ref<Record<string, string>>, source: Ref<string>) {
  /** ここで自動で入れた明細と、そのときの値 */
  const auto = reactive(new Map<string, string>())
  watch([vendors, source], ([v, s]) => {
    const next = { ...v }
    let changed = false
    for (const [key, value] of Object.entries(v)) {
      const wasAuto = auto.has(key) && auto.get(key) === value
      if (value !== '' && !wasAuto) {
        auto.delete(key)
        continue
      }
      if (value === s) continue
      next[key] = s
      if (s) auto.set(key, s)
      else auto.delete(key)
      changed = true
    }
    if (changed) vendors.value = next
  }, { deep: true, immediate: true })
  /** その明細の取引先が、ここで自動で入れたものか */
  return (key: string) => auto.has(key) && auto.get(key) === vendors.value[key]
}

/**
 * 入力欄に、表などから推測した値を入れておく。
 * 空欄か、前に自動で入れた値のままのときだけ入れ替え、自分で書き換えた値は上書きしない。
 */
export function useAutoFill(target: Ref<string>, source: Ref<string>) {
  let last = ''
  watch(source, (s) => {
    if (target.value !== '' && target.value !== last) return
    target.value = s
    last = s
  }, { immediate: true })
}

/** 明細ごとの数量を1つの文字列にまとめる（1件ならそのまま、複数なら「明細名 数量」を並べる） */
export function useQuantityOfItems(keys: Ref<string[]>, quantities: Ref<Record<string, string>>) {
  const { data: lines } = useBudgetLines()
  return computed(() => {
    const byKey = new Map(lines.value.map(l => [l.key, l]))
    const filled = keys.value.filter(k => quantities.value[k])
    if (filled.length === 1 && keys.value.length === 1) return quantities.value[filled[0]!]!
    return filled.map(k => `${byKey.get(k)?.label ?? k} ${quantities.value[k]}`).join('、')
  })
}

/** 取引先の書き方の揺れを、通販サイトの選択肢にそろえる */
const SITE_ALIASES: Record<string, string[]> = {
  ASKUL: ['askul', 'アスクル'],
  モノタロウ: ['モノタロウ', 'monotaro', 'ものたろう'],
  Amazon: ['amazon', 'アマゾン'],
  楽天: ['楽天', 'rakuten'],
  アースダンボール: ['アースダンボール'],
}
/** 取引先が通販サイトの選択肢のどれかならその名前、そうでなければ取引先をそのまま返す（「その他」に入る） */
export function siteOfVendor(vendor: string) {
  const v = vendor.toLowerCase()
  return Object.entries(SITE_ALIASES).find(([, names]) => names.some(n => v.includes(n.toLowerCase())))?.[0] ?? vendor
}

/**
 * 金額の入力を数値にする。カンマ・全角数字・「¥」「円」・空白を許す（例: 「１２,０００円」→ 12000）。
 * 空なら ''、数字として読めなければ null。
 */
export function parseYenInput(raw: string): number | '' | null {
  const s = raw.normalize('NFKC').replace(/[,\s¥￥円]/g, '').replace(/[−‐－]/g, '-')
  if (s === '') return ''
  return /^-?\d+$/.test(s) ? Number(s) : null
}

/** 送信用に、未入力（''）の執行額を取り除く */
export function filledAmounts(amounts: Record<string, number | ''>) {
  return Object.fromEntries(Object.entries(amounts).filter((e): e is [string, number] => e[1] !== ''))
}

/**
 * 明細ごとの執行額の合計を、申請の金額欄に自動で入れる。金額欄を手で直したら以降は上書きしない。
 * 戻り値は金額欄の @input に付ける関数。
 */
export function useTotalFromItems(amounts: Ref<Record<string, number | ''>>, total: Ref<string | number>) {
  const edited = ref(false)
  watch(amounts, (a) => {
    const values = Object.values(a)
    if (edited.value || !values.length || values.some(v => v === '')) return
    total.value = String((values as number[]).reduce((s, v) => s + v, 0))
  }, { deep: true })
  return () => { edited.value = true }
}

/** 款・項・目・節のまとまり。上の階層から順に「まるごと選ばれているか」を調べる */
const GROUPINGS: { key: (l: BudgetLineView) => string, name: (l: BudgetLineView) => string }[] = [
  { key: l => (l.kan ? `${l.kanNo}|${l.kan}` : ''), name: l => l.kan },
  { key: l => (l.kou ? `${l.kanNo}|${l.kan}|${l.kouNo}|${l.kou}` : ''), name: l => l.kou },
  { key: l => (l.moku ? `${l.kanNo}|${l.kan}|${l.kouNo}|${l.kou}|${l.moku}` : ''), name: l => l.moku },
  { key: l => (l.setsu ? `${l.kanNo}|${l.kan}|${l.kouNo}|${l.kou}|${l.moku}|${l.setsu}` : ''), name: l => l.setsu },
]

/**
 * 選んだ明細から支出項目名を作る。
 * - 款（または項・目・節）をまるごと選んでいるときは、その名前（例: 「委員会設備等関連費」）。
 *   款を複数まるごと選んでいるときは「手数料・委員会設備等関連費」
 * - それ以外は最初の明細の名前（例: 「インク代 / PFIー120M マゼンタ ほか1件」）
 */
export function itemNameFromLines(selected: BudgetLineView[], all: BudgetLineView[]) {
  if (!selected.length) return ''
  const picked = new Set(selected.map(l => l.key))
  for (const [level, g] of GROUPINGS.entries()) {
    const groups = new Set(selected.map(g.key))
    if (groups.has('')) continue
    // 名前を「・」でつなぐのは款だけ（項・目・節は1つをまるごと選んだときだけその名前にする）
    if (level > 0 && groups.size > 1) continue
    const members = all.filter(l => groups.has(g.key(l)))
    if (members.length === picked.size && members.every(l => picked.has(l.key))) {
      return [...new Set(selected.map(g.name))].join('・')
    }
  }
  const last = (l: BudgetLineView) => l.label.split(' / ').slice(-2).join(' / ')
  return selected.length === 1 ? last(selected[0]!) : `${last(selected[0]!)} ほか${selected.length - 1}件`
}
