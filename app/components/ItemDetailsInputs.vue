<script setup lang="ts">
/**
 * 選んだ予算明細ごとの実際の数量・取引先・金額の入力欄。執行形態ごとの欄の中に置き、
 * その形態で必要な列だけ出す（発注の取引先は通販サイト、立替は購入先から入るので出さない など）。
 * 値は予算の表で選んだときに予算の値が入っている。
 */
const props = defineProps<{
  keys: string[]
  /** 出す列 */
  fields: ('quantity' | 'vendor' | 'amount')[]
  /** 金額の列の名前（例: 振込金額） */
  amountLabel?: string
  /** 数量を必須にするか（必須でも、予算の表に数量がない明細は空でよい） */
  requireQuantity?: boolean
}>()
const amounts = defineModel<Record<string, number | ''>>('amounts', { required: true })
const quantities = defineModel<Record<string, string>>('quantities', { required: true })
const vendors = defineModel<Record<string, string>>('vendors', { required: true })

const { data: lines } = useBudgetLines()
const byKey = computed(() => new Map(lines.value.map(l => [l.key, l])))
const rows = computed(() => props.keys.map(k => byKey.value.get(k)).filter(l => l != null))
const show = (f: 'quantity' | 'vendor' | 'amount') => props.fields.includes(f)

const vendorSuggestions = computed(() => [...new Set(lines.value.map(l => l.vendor).filter(Boolean))].sort())

/** 入力中の文字（「12,000」など）と、数字として読めない入力の印 */
const rawAmounts = reactive<Record<string, string>>({})
const invalid = reactive<Record<string, boolean>>({})
const amountText = (key: string) => {
  if (key in rawAmounts) return rawAmounts[key]
  const v = amounts.value[key]
  return v === '' || v == null ? '' : String(v)
}
function setAmount(key: string, raw: string) {
  rawAmounts[key] = raw
  const n = parseYenInput(raw)
  invalid[key] = n === null
  if (n !== null) amounts.value = { ...amounts.value, [key]: n }
}
const setQuantity = (key: string, v: string) => { quantities.value = { ...quantities.value, [key]: v } }
const setVendor = (key: string, v: string) => { vendors.value = { ...vendors.value, [key]: v } }

const total = computed(() => props.keys.reduce((s, k) => s + (typeof amounts.value[k] === 'number' ? amounts.value[k] as number : 0), 0))
const missing = computed(() => props.keys.filter(k => amounts.value[k] === '' || amounts.value[k] == null).length)

/** 予算と違うときに、元の予算の値を小さく出す */
function budgetDiff(key: string, budget: number) {
  const a = amounts.value[key]
  if (typeof a !== 'number' || a === budget) return ''
  const d = a - budget
  return `予算比 ${d > 0 ? '+' : '-'}¥${Math.abs(d).toLocaleString('ja-JP')}`
}
</script>

<template>
  <div v-if="rows.length" class="item-details">
    <p class="hint">選んだ明細ごとに入力してください（最初は予算の値が入っています）。</p>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>明細</th>
            <th v-if="show('quantity')">数量</th>
            <th v-if="show('vendor')">取引先</th>
            <th v-if="show('amount')" class="num">{{ amountLabel ?? '金額' }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="l in rows" :key="l.key">
            <td class="name">
              <span class="muted">{{ l.itemNumber }}</span> {{ l.label.split(' / ').at(-1) }}
              <small class="muted">予算 {{ formatYen(l.budgetAmount) }}</small>
            </td>
            <td v-if="show('quantity')">
              <input
                type="text" autocomplete="off" :value="quantities[l.key] ?? ''" :aria-label="`${l.label} の数量`"
                :required="requireQuantity && !!l.quantity"
                :placeholder="l.quantity ? '' : '（任意）'"
                @input="setQuantity(l.key, ($event.target as HTMLInputElement).value)"
              >
            </td>
            <td v-if="show('vendor')">
              <input
                type="text" autocomplete="off" list="item-vendor-suggestions" :value="vendors[l.key] ?? ''"
                :aria-label="`${l.label} の取引先`" placeholder="取引先"
                @input="setVendor(l.key, ($event.target as HTMLInputElement).value)"
              >
            </td>
            <td v-if="show('amount')" class="num">
              <input
                type="text" inputmode="numeric" autocomplete="off" class="yen" :class="{ invalid: invalid[l.key] }"
                :value="amountText(l.key)" :aria-label="`${l.label} の金額`" :aria-invalid="invalid[l.key] || undefined"
                placeholder="未入力"
                @input="setAmount(l.key, ($event.target as HTMLInputElement).value)"
              >
              <small v-if="invalid[l.key]" class="error">数字で入力してください。</small>
              <small v-else-if="budgetDiff(l.key, l.budgetAmount)" class="muted">{{ budgetDiff(l.key, l.budgetAmount) }}</small>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="show('amount')">
          <tr>
            <td :colspan="1 + (show('quantity') ? 1 : 0) + (show('vendor') ? 1 : 0)">
              合計<small v-if="missing" class="warn">（金額未入力 {{ missing }}件）</small>
            </td>
            <td class="num"><strong>{{ formatYen(total) }}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
    <datalist id="item-vendor-suggestions">
      <option v-for="v in vendorSuggestions" :key="v" :value="v" />
    </datalist>
  </div>
</template>

<style scoped>
.item-details { display: grid; gap: .4rem; }
table { font-size: .85rem; }
th, td { padding: .3rem .5rem; vertical-align: middle; }
td.name { min-width: 12rem; }
td.name small { display: block; }
td input { padding: .25rem .4rem; min-width: 6rem; }
td input.yen { text-align: right; font-variant-numeric: tabular-nums; width: 8rem; }
td input.invalid { border-color: var(--danger); }
td small { display: block; font-size: .72rem; }
/* 取引先の入力候補（datalist）の▼は出さない */
td input::-webkit-calendar-picker-indicator { display: none !important; }
tfoot td { font-weight: 600; border-bottom: none; }
.warn { color: var(--danger); font-weight: 400; margin-left: .3rem; }
</style>
