<script setup lang="ts">
/**
 * 同じ通販サイトの未対応の発注をまとめて発注する欄（台帳の「発注」でサイトを絞り込んだときに出す）。
 * まとめる発注を選ぶと、合計と送料無料の基準、いちばん早い必要日、商品リンクと数量の一覧が出て、
 * 発注し終えたらまとめて対応済みにできる。
 */
import { SHIPPING_RULES } from '#shared/shipping'
import { extractLinks } from '#shared/links'

type Row = {
  id: number
  seq: string
  type: string
  status: string
  amount: number | null
  quantity: string | null
  deadline: string | null
  itemName: string
  details: unknown
  items: { budgetAmount: number, actualAmount: number | null, label: string, quantity: string, actualQuantity: string | null }[]
}
const props = defineProps<{ site: string, rows: Row[] }>()
const emit = defineEmits<{ done: [] }>()

const checked = ref<number[]>([])
// サイトを切り替えたら、そのサイトの未対応の発注を全部選んだ状態にする
watch(() => props.rows.map(r => r.id).join(','), () => { checked.value = props.rows.map(r => r.id) }, { immediate: true })

const picked = computed(() => props.rows.filter(r => checked.value.includes(r.id)))
const total = computed(() => picked.value.reduce((s, r) => s + orderAmountOf(r), 0))
const rule = computed(() => SHIPPING_RULES[props.site])
const earliest = computed(() => picked.value.map(r => r.deadline).filter(Boolean).sort()[0] ?? '')

const yen = (n: number) => `¥${n.toLocaleString('ja-JP')}`
const detailOf = (r: Row) => (r.details ?? {}) as { url?: string, deliveryPlace?: string }
const linksOf = (r: Row) => extractLinks(detailOf(r).url ?? '')
/** 数量（対応時に直した値 → 申請の数量 → 明細ごとの数量） */
const quantityOf = (r: Row) => r.quantity || r.items.map(i => i.actualQuantity ?? i.quantity).filter(Boolean).join('、')

/** 発注サイトで買い物かごに入れるときに見る一覧（コピー用） */
const listText = computed(() => picked.value.map(r => [
  `${r.seq} ${r.itemName}（数量: ${quantityOf(r) || '—'}、必要日: ${r.deadline ?? '—'}、配達場所: ${detailOf(r).deliveryPlace ?? '—'}）`,
  ...linksOf(r).map(u => `  ${u}`),
].join('\n')).join('\n'))
const copied = ref(false)
async function copyList() {
  await navigator.clipboard.writeText(listText.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

const pending = ref(false)
const errors = ref<string[]>([])
async function markDone() {
  if (!picked.value.length) return
  if (!confirm(`${picked.value.map(r => r.seq).join('、')} の${picked.value.length}件を対応済みにします。よろしいですか？`)) return
  pending.value = true
  errors.value = []
  try {
    for (const r of picked.value) {
      await $fetch(`/api/entries/${r.id}/execute`, { method: 'POST', body: { done: true } })
    }
    emit('done')
  }
  catch (error) {
    errors.value = toMessages(error)
    emit('done')
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="batch" aria-label="まとめて発注">
    <header>
      <strong>まとめて発注（{{ site }}）</strong>
      <span class="hint">まとめる発注を選んでください。最初は未対応の発注をすべて選んでいます。</span>
    </header>

    <ul class="orders">
      <li v-for="r in rows" :key="r.id">
        <label class="check">
          <input v-model="checked" type="checkbox" :value="r.id">
          <span class="seq">{{ r.seq }}</span>
          <span class="name">{{ r.itemName }}</span>
        </label>
        <span class="meta">
          数量 {{ quantityOf(r) || '—' }} ／ 必要日 {{ r.deadline ?? '—' }} ／ {{ yen(orderAmountOf(r)) }}
        </span>
        <span v-if="linksOf(r).length" class="links">
          <a v-for="(u, i) in linksOf(r)" :key="u" :href="u" target="_blank" rel="noopener">商品{{ linksOf(r).length > 1 ? i + 1 : '' }} ↗</a>
        </span>
      </li>
    </ul>

    <div class="sum">
      <span>選択 {{ picked.length }}件・合計 <strong>{{ yen(total) }}</strong></span>
      <template v-if="rule">
        <span v-if="rule.freeFrom == null" class="muted">送料無料の基準なし（まとめると送料1回分）</span>
        <span v-else-if="total >= rule.freeFrom" class="ok">送料無料（基準 {{ yen(rule.freeFrom) }}）</span>
        <span v-else-if="picked.length" class="short">送料無料まであと {{ yen(rule.freeFrom - total) }}（基準 {{ yen(rule.freeFrom) }}）</span>
      </template>
      <span v-if="earliest">いちばん早い必要日 <strong>{{ earliest }}</strong></span>
    </div>

    <div class="actions">
      <button type="button" class="secondary" :disabled="!picked.length" @click="copyList">
        {{ copied ? 'コピーしました' : '商品リンクと数量の一覧をコピー' }}
      </button>
      <button type="button" :disabled="!picked.length || pending" @click="markDone">
        {{ pending ? '処理中…' : `選んだ${picked.length}件をまとめて対応済みにする` }}
      </button>
    </div>
    <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
  </section>
</template>

<style scoped>
.batch { display: grid; gap: .6rem; margin: 0 0 1rem; padding: .8rem 1rem; background: var(--surface); border: 1px solid var(--accent); border-radius: 8px; }
header { display: grid; gap: .1rem; }
.orders { list-style: none; margin: 0; padding: 0; display: grid; gap: .35rem; }
.orders li { display: flex; flex-wrap: wrap; align-items: baseline; gap: .3rem .9rem; padding: .35rem .5rem; border-radius: 6px; background: var(--sub); font-size: .88rem; }
.check { display: flex; align-items: baseline; gap: .45rem; }
.seq { font-weight: 700; font-variant-numeric: tabular-nums; }
.meta { color: var(--muted); font-size: .82rem; font-variant-numeric: tabular-nums; }
.links { display: flex; gap: .6rem; font-size: .82rem; }
.sum { display: flex; flex-wrap: wrap; gap: .3rem 1.2rem; align-items: baseline; font-size: .9rem; }
.ok { color: var(--done); font-weight: 600; }
.short { color: #9a6b00; font-weight: 600; }
.actions { display: flex; flex-wrap: wrap; gap: .6rem; }
</style>
