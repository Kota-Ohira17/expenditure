<script setup lang="ts">
/**
 * 予算の画面。確定した予算（執行依頼で選ぶ予算）の表を見る。集約中なら「集約」への案内も出す。
 * 予算が1つもないときだけ、財務管理部は、もとにする予算を CSV から一度だけ取り込める。
 */
const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const { data: view, refresh } = await useBudgetRound()
const { data: lines, refresh: refreshLines } = await useBudgetLines()
const budgetKind = useBudgetKind()

const collecting = computed(() => view.value && view.value.round.status !== 'confirmed' ? view.value.round : null)

const errors = ref<string[]>([])
const message = ref('')
const pending = ref(false)
/** 最初の予算の取り込み（予算が1つもないときだけ） */
const seedFile = ref<File | null>(null)
const seedKind = ref<'' | 'main' | 'revised'>('')
async function seed() {
  if (!seedFile.value) return
  errors.value = []
  pending.value = true
  const form = new FormData()
  form.append('file', seedFile.value)
  form.append('kind', seedKind.value)
  try {
    await $fetch('/api/budget-lines/import', { method: 'POST', body: form })
    message.value = '最初の予算を取り込みました。「集約」から次の予算の集約を始められます。'
    await Promise.all([refresh(), refreshLines()])
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}

const query = ref('')
const filtered = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return lines.value.filter(l => words.every(w => `${l.itemNumber} ${l.bureau} ${l.team} ${l.kan} ${l.label} ${l.vendor}`.toLowerCase().includes(w)))
})
const total = computed(() => lines.value.reduce((s, l) => s + l.budgetAmount, 0))
</script>

<template>
  <section>
    <h1>予算</h1>
    <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
    <p v-if="message" class="ok">{{ message }}</p>

    <p v-if="collecting" class="card notice">
      {{ collecting.term }} {{ collecting.kind }}の集約が進んでいます（{{ PHASE_LABELS[collecting.status] }}）。明細の入力・提出は「<NuxtLink to="/budget/collect">集約</NuxtLink>」から。
      確定するまで、執行依頼では下の予算から選びます。
    </p>

    <template v-if="lines.length">
      <p>確定した{{ budgetKind }}：{{ lines.length }}件の明細（合計 {{ formatYen(total) }}）。執行依頼ではこの予算から選びます。</p>
      <input v-model="query" type="search" class="search" placeholder="絞り込み（項目番号・局・担当・名前・取引先）">
      <BudgetTable :lines="filtered" fixed-height />
    </template>

    <div v-else class="card head">
      <h2>まだ予算がありません</h2>
      <template v-if="reviewer">
        <p class="hint">
          予算は「もとの予算を写して直す」形で作ります。はじめに一度だけ、もとにする予算（昨年の予算など）の「支出」シートを CSV で取り込んでください。
          スプレッドシートの「ファイル → ダウンロード → カンマ区切り形式（.csv）」で保存できます。
        </p>
        <form @submit.prevent="seed">
          <fieldset class="kind">
            <legend>予算の種類</legend>
            <label class="check"><input v-model="seedKind" type="radio" value="main" required> 本予算</label>
            <label class="check"><input v-model="seedKind" type="radio" value="revised"> 補正予算</label>
          </fieldset>
          <label>CSV ファイル<input type="file" accept=".csv,text/csv" required @change="seedFile = ($event.target as HTMLInputElement).files?.[0] ?? null"></label>
          <button type="submit" :disabled="pending || !seedFile || !seedKind">取り込み</button>
        </form>
      </template>
      <p v-else class="hint">財務管理部が予算を用意するまでお待ちください。</p>
    </div>
  </section>
</template>

<style scoped>
.card { max-width: none; margin-bottom: 1.5rem; display: grid; gap: .6rem; }
.head h2 { margin: 0; font-size: 1.1rem; }
.notice { display: block; }
.kind { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; }
.search { max-width: 420px; margin-bottom: .75rem; }
.ok { color: var(--done); }
</style>
