<script setup lang="ts">
/**
 * 予算の画面。確定した予算（執行依頼で選ぶ予算）の表を見る。集約中なら「集約」への案内も出す。
 * 予算が1つもないときだけ、財務管理部は、もとにする予算を CSV から一度だけ取り込める。
 */
const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const { data: view, refresh } = await useBudgetRound()
const { data: lines, refresh: refreshLines } = await useBudgetLines()
const { data: incomeLines, refresh: refreshIncome } = await useIncomeLines()
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
    await Promise.all([refresh(), refreshLines(), refreshIncome()])
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
const incomeTotal = computed(() => incomeLines.value.reduce((s, l) => s + l.budgetAmount, 0))
/**
 * 収入と支出の対比（局ごと）。収支＝収入−支出。局の並びは局の番号の順
 * （収入の番号 in01 と支出の番号 out01 は同じ局なので、数字の部分で合わせる）。
 */
const comparison = computed(() => {
  const byBureau = new Map<string, { no: string, bureau: string, income: number, expense: number, incomeCount: number, expenseCount: number }>()
  const add = (l: { bureau: string, bureauNo: string, budgetAmount: number }, flow: 'income' | 'expense') => {
    const no = l.bureauNo.replace(/^[a-z]+-?/i, '')
    const row = byBureau.get(l.bureau) ?? { no, bureau: l.bureau, income: 0, expense: 0, incomeCount: 0, expenseCount: 0 }
    row[flow] += l.budgetAmount
    row[flow === 'income' ? 'incomeCount' : 'expenseCount']++
    byBureau.set(l.bureau, row)
  }
  for (const l of incomeLines.value) add(l, 'income')
  for (const l of lines.value) add(l, 'expense')
  return [...byBureau.values()].sort((a, b) => a.no.localeCompare(b.no, 'ja', { numeric: true }))
})
const filteredIncome = computed(() => {
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return incomeLines.value.filter(l => words.every(w => `${l.itemNumber} ${l.bureau} ${l.team} ${l.kan} ${l.label} ${l.vendor}`.toLowerCase().includes(w)))
})
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

    <template v-if="lines.length || incomeLines.length">
      <p>確定した{{ budgetKind }}です。執行依頼では支出の予算から、収入の記録では収入の予算から選びます。</p>
      <div class="card compare">
        <h2>収入と支出</h2>
        <div class="totals">
          <div class="total income"><span>収入</span><strong>{{ formatYen(incomeTotal) }}</strong><small>{{ incomeLines.length }}件</small></div>
          <div class="total expense"><span>支出</span><strong>{{ formatYen(total) }}</strong><small>{{ lines.length }}件</small></div>
          <div class="total balance" :class="{ minus: incomeTotal - total < 0 }"><span>収支（収入−支出）</span><strong>{{ formatYen(incomeTotal - total) }}</strong></div>
        </div>
        <div class="table-wrap">
          <table class="compare-table">
            <thead><tr><th>局</th><th class="num">収入</th><th class="num">支出</th><th class="num">収支</th></tr></thead>
            <tbody>
              <tr v-for="b in comparison" :key="b.bureau">
                <td>{{ b.bureau }}</td>
                <td class="num">{{ b.incomeCount ? formatYen(b.income) : '—' }}</td>
                <td class="num">{{ b.expenseCount ? formatYen(b.expense) : '—' }}</td>
                <td class="num" :class="{ minus: b.income - b.expense < 0 }">{{ formatYen(b.income - b.expense) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr><th>合計</th><th class="num">{{ formatYen(incomeTotal) }}</th><th class="num">{{ formatYen(total) }}</th><th class="num" :class="{ minus: incomeTotal - total < 0 }">{{ formatYen(incomeTotal - total) }}</th></tr>
            </tfoot>
          </table>
        </div>
      </div>
      <input v-model="query" type="search" class="search" placeholder="絞り込み（項目番号・局・担当・名前・取引先）">
      <template v-if="incomeLines.length">
        <h2 class="flow income">収入の部 <span class="muted">{{ incomeLines.length }}件・{{ formatYen(incomeTotal) }}</span></h2>
        <BudgetTable :lines="filteredIncome" />
      </template>
      <h2 class="flow expense">支出の部 <span class="muted">{{ lines.length }}件・{{ formatYen(total) }}</span></h2>
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
.flow { font-size: 1.05rem; margin: 1.2rem 0 .5rem; padding: .3rem .6rem; border-left: 4px solid var(--accent); }
.flow.income { border-left-color: var(--done); }
.flow .muted { font-weight: 400; font-size: .85rem; margin-left: .4rem; }
/* 収入と支出の対比 */
.compare h2 { margin: 0; font-size: 1.1rem; }
.totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: .6rem; }
.total { display: grid; gap: .1rem; padding: .6rem .8rem; border: 1px solid var(--border); border-left: 4px solid var(--accent); border-radius: 8px; background: var(--surface); }
.total.income { border-left-color: var(--done); }
.total.balance { border-left-color: var(--muted); }
.total span { font-size: .82rem; color: var(--muted); }
.total strong { font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.total small { color: var(--muted); }
.minus, .total.balance.minus strong { color: var(--danger); }
.table-wrap { overflow-x: auto; }
.compare-table { border-collapse: collapse; width: 100%; max-width: 40rem; background: var(--surface); }
.compare-table th, .compare-table td { padding: .4rem .6rem; border-bottom: 1px solid var(--border); text-align: left; font-size: .9rem; }
.compare-table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.compare-table tfoot th { border-top: 2px solid var(--border); }
</style>
