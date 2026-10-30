<script setup lang="ts">
/**
 * 査定（財務管理部）。査定待ちの明細を担当ごとに並べ、明細ごとに承認するか、理由を書いて担当に戻す（要修正）。
 * もとの予算（昨年・本予算）からの変わり方も並べて見られる。
 */
const { can } = usePermissions()
if (!can('reviewBudget')) await navigateTo('/budget')
const { data: view, refresh } = await useBudgetRound()

const collecting = computed(() => view.value?.round.status === 'collecting')
/** 表示する状態（査定待ち・要修正で戻したもの・承認済みのうち、もとの予算から変わったもの） */
type Filter = 'submitted' | 'returned' | 'approved'
const FILTERS: { key: Filter, label: string }[] = [
  { key: 'submitted', label: '査定待ち' },
  { key: 'returned', label: '要修正で戻した' },
  { key: 'approved', label: '承認済み（変更あり）' },
]
const filter = ref<Filter>('submitted')
const inFilter = (i: BudgetItemView, f: Filter) => i.status === f && (f !== 'approved' || changeOf(i).kind !== 'same')
const count = (f: Filter) => (collecting.value ? view.value!.items.filter(i => inFilter(i, f)).length : 0)
const shown = computed(() => (collecting.value ? view.value!.items.filter(i => inFilter(i, filter.value)) : []))
const groups = computed(() => (view.value?.teams ?? [])
  .map(t => ({ team: t, list: shown.value.filter(i => i.teamId === t.id) }))
  .filter(g => g.list.length))
const STATUS_TONE = { draft: 'gray', submitted: 'yellow', returned: 'red', approved: 'green' } as const

const comments = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string[]>>({})
const busy = ref<number | null>(null)
async function review(id: number, decision: 'approve' | 'return') {
  busy.value = id
  delete errors[id]
  try {
    await $fetch(`/api/budget/items/${id}/review`, { method: 'POST', body: { decision, comment: comments[id] ?? '' } })
    await refresh()
  }
  catch (error) {
    errors[id] = toMessages(error)
  }
  finally {
    busy.value = null
  }
}
/** その担当の査定待ちをまとめて承認する */
async function approveAll(ids: number[]) {
  if (!confirm(`${ids.length}件をまとめて承認します。よろしいですか？`)) return
  for (const id of ids) await review(id, 'approve')
}
</script>

<template>
  <section>
    <h1>査定</h1>
    <p class="hint">
      承認すると、その明細は確定を待つだけになります。直してほしいときは理由を書いて「要修正で戻す」を押すと、担当の画面に理由が出ます。
      担当が直して提出し直すと、また「査定待ち」に並びます。
    </p>
    <p v-if="!collecting" class="card">
      今は集約中の予算がありません。査定は、「<NuxtLink to="/budget/collect">集約</NuxtLink>」の画面で本予算か補正予算の集約を始め、各担当が明細を提出すると使えます。
    </p>
    <template v-else>
      <div class="filters" role="tablist">
        <button
          v-for="f in FILTERS" :key="f.key" role="tab" :aria-selected="filter === f.key"
          :class="filter === f.key ? '' : 'secondary'" @click="filter = f.key"
        >
          {{ f.label }}（{{ count(f.key) }}）
        </button>
      </div>
      <p v-if="!shown.length" class="hint">{{ filter === 'submitted' ? '査定待ちの明細はありません。担当が明細を提出すると、ここに並びます。' : '該当する明細はありません。' }}</p>

      <div v-for="g in groups" :key="g.team.id" class="group">
        <div class="group-head">
          <h2>{{ g.team.bureau }} ／ <NuxtLink :to="`/budget/team/${g.team.id}`">{{ g.team.team }}</NuxtLink></h2>
          <span class="muted">{{ g.list.length }}件</span>
          <button v-if="filter === 'submitted'" class="secondary" :disabled="busy !== null" @click="approveAll(g.list.map(i => i.id))">まとめて承認</button>
        </div>
        <div class="card-list">
          <InfoCard
            v-for="i in g.list" :key="i.id"
            :status="itemStatusLabel(i)" :tone="STATUS_TONE[i.status]"
            :meta="`${i.number}　担当：${g.team.team}${g.team.person ? `（${g.team.person}）` : ''}`"
            :title="`${i.kan} ／ ${itemName(i)}`"
            :who="i.updatedByName" :when="i.updatedAt" :note="i.reviewComment || i.remark || i.spec"
          >
            <template #tags>
              <span class="tag">{{ changeOf(i).label }}</span>
              <span v-if="i.isNew && i.baseItemId != null" class="tag fill pink">新規</span>
              <span v-if="i.preExecution" class="tag fill yellow">予算前執行</span>
              <span v-if="i.deleted" class="tag fill red">削除</span>
            </template>
            {{ formatYen(i.amount) }}<span v-if="i.baseItemId != null" class="base">（もとの予算 {{ formatYen(i.baseAmount) }}）</span>
            <span class="sub">{{ [i.quantity && `数量 ${i.quantity}`, i.unitPrice != null && `単価 ${formatYen(i.unitPrice)}`, i.vendor].filter(Boolean).join('・') }}</span>
            <template v-if="i.status === 'submitted'" #footer>
              <div class="actions">
                <input v-model="comments[i.id]" class="comment" placeholder="コメント（要修正のときは必須）">
                <button :disabled="busy !== null" @click="review(i.id, 'approve')">承認する</button>
                <button class="secondary" :disabled="busy !== null" @click="review(i.id, 'return')">要修正で戻す</button>
              </div>
              <ul v-if="errors[i.id]?.length" class="error"><li v-for="e in errors[i.id]" :key="e">{{ e }}</li></ul>
            </template>
          </InfoCard>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; }
.filters { display: flex; flex-wrap: wrap; gap: .5rem; margin: 1rem 0; }
.group { margin: 1.4rem 0; }
.group-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: .4rem .8rem; margin-bottom: .6rem; }
.group-head .muted { white-space: nowrap; }
.group-head h2 { font-size: 1.05rem; margin: 0; }
.base { font-weight: 400; color: var(--muted); margin-left: .3rem; font-size: .85rem; }
.sub { display: block; font-weight: 400; font-size: .8rem; color: var(--muted); margin-top: .2rem; }
.actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.comment { flex: 1 1 16rem; max-width: none; }
</style>
