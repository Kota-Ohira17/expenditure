<script setup lang="ts">
/**
 * 査定（財務管理部）。査定待ちの明細を担当ごとに並べ、明細ごとに承認するか、理由を書いて担当に戻す（要修正）。
 * もとの予算（昨年・本予算）からの変わり方も並べて見られる。
 */
const { can } = usePermissions()
if (!can('reviewBudget')) await navigateTo('/budget')
const { data: view, refresh } = await useBudgetRound()

const waiting = computed(() => view.value?.round.status === 'collecting' ? view.value.items.filter(i => i.status === 'submitted') : [])
const groups = computed(() => (view.value?.teams ?? [])
  .map(t => ({ team: t, list: waiting.value.filter(i => i.teamId === t.id) }))
  .filter(g => g.list.length))

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
    <p><NuxtLink to="/budget">← 予算に戻る</NuxtLink></p>
    <h1>査定</h1>
    <p class="hint">
      承認すると、その明細は確定を待つだけになります。直してほしいときは理由を書いて「要修正で戻す」を押すと、担当の画面に理由が出ます。
      担当が直して提出し直すと、またここに並びます。
    </p>
    <p v-if="!waiting.length" class="card">査定待ちの明細はありません。</p>

    <div v-for="g in groups" :key="g.team.id" class="group">
      <div class="group-head">
        <h2>{{ g.team.bureau }} ／ <NuxtLink :to="`/budget/team/${g.team.id}`">{{ g.team.team }}</NuxtLink></h2>
        <span class="muted">{{ g.list.length }}件</span>
        <button class="secondary" :disabled="busy !== null" @click="approveAll(g.list.map(i => i.id))">まとめて承認</button>
      </div>
      <div v-for="i in g.list" :key="i.id" class="card item">
        <div class="item-head">
          <span class="no">{{ i.number }}</span>
          <strong>{{ i.kan }} ／ {{ itemName(i) }}</strong>
          <span class="change" :class="changeOf(i).kind">{{ changeOf(i).label }}</span>
        </div>
        <p class="detail">
          金額 <strong>{{ formatYen(i.amount) }}</strong>
          <template v-if="i.baseItemId != null">（もとの予算 {{ formatYen(i.baseAmount) }}）</template>
          <template v-if="i.quantity">・数量 {{ i.quantity }}</template>
          <template v-if="i.unitPrice != null">・単価 {{ formatYen(i.unitPrice) }}</template>
          <template v-if="i.vendor">・取引先 {{ i.vendor }}</template>
          <template v-if="i.isNew">・新規</template>
          <template v-if="i.preExecution">・予算前執行</template>
        </p>
        <p v-if="i.spec || i.remark" class="hint">{{ [i.spec, i.remark].filter(Boolean).join(' ／ ') }}</p>
        <p v-if="i.link" class="hint"><a :href="i.link" target="_blank" rel="noopener">{{ i.link }}</a></p>
        <label>コメント（要修正のときは必須）<textarea v-model="comments[i.id]" rows="2" /></label>
        <ul v-if="errors[i.id]?.length" class="error"><li v-for="e in errors[i.id]" :key="e">{{ e }}</li></ul>
        <div class="buttons">
          <button :disabled="busy !== null" @click="review(i.id, 'approve')">承認する</button>
          <button class="secondary" :disabled="busy !== null" @click="review(i.id, 'return')">要修正で戻す</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.card { max-width: none; }
.group { margin: 1.4rem 0; }
.group-head { display: flex; align-items: baseline; gap: .8rem; margin-bottom: .5rem; }
.group-head h2 { font-size: 1.05rem; margin: 0; }
.item { display: grid; gap: .45rem; margin-bottom: .7rem; padding: 1rem 1.2rem; }
.item p { margin: 0; }
.item-head { display: flex; flex-wrap: wrap; gap: .4rem .8rem; align-items: baseline; }
.no { font-variant-numeric: tabular-nums; color: var(--muted); }
.change { font-size: .85rem; font-weight: 600; }
.change.plus { color: var(--danger); }
.change.minus { color: var(--done); }
.change.same { color: var(--muted); }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
</style>
