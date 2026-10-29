<script setup lang="ts">
/**
 * 予算の画面。集約中なら、担当ごとの進み具合と、自分が入力する担当への入口。財務管理部には査定・設定・確定。
 * 集約していないときは、確定した予算の表と、財務管理部には次の集約を始めるフォーム。
 * 予算が1つもないときだけ、もとにする予算を CSV から一度だけ取り込める。
 */
const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const { data: view, refresh } = await useBudgetRound()
const { data: lines, refresh: refreshLines } = await useBudgetLines()

const collecting = computed(() => view.value?.round.status === 'collecting' ? view.value : null)
const itemsOf = (teamId: number) => view.value?.items.filter(i => i.teamId === teamId) ?? []
const summary = computed(() => (collecting.value ? teamSummary(collecting.value.items) : null))
/** 自分が割り当てられた担当（財務管理部はどの担当も直せるので、一覧から入る） */
const myTeams = computed(() => (collecting.value && !reviewer.value ? collecting.value.teams.filter(t => collecting.value!.editableTeamIds.includes(t.id)) : []))

const errors = ref<string[]>([])
const message = ref('')
const pending = ref(false)
async function act(run: () => Promise<unknown>, done: string) {
  errors.value = []
  message.value = ''
  pending.value = true
  try {
    await run()
    message.value = done
    await Promise.all([refresh(), refreshLines()])
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}

/** 集約を始める（財務管理部） */
const start = reactive({ kind: '' as '' | '本予算' | '補正予算', term: '' })
const startRound = () => act(() => $fetch('/api/budget/rounds', { method: 'POST', body: start }), `${start.term} ${start.kind}の集約を始めました。`)
function confirmRound() {
  if (!collecting.value || !confirm('予算を確定します。今の予算明細がこの予算に入れ替わります。よろしいですか？')) return
  act(() => $fetch(`/api/budget/rounds/${collecting.value!.round.id}/confirm`, { method: 'POST' }), '予算を確定しました。執行依頼ではこの予算から選べます。')
}
function cancelRound() {
  if (!collecting.value || !confirm('集約をやめます。この集約で入力した明細はすべて消えます。よろしいですか？')) return
  act(() => $fetch(`/api/budget/rounds/${collecting.value!.round.id}`, { method: 'DELETE' }), '集約をやめました。')
}

/** 最初の予算の取り込み（予算が1つもないときだけ） */
const seedFile = ref<File | null>(null)
const seedKind = ref<'' | 'main' | 'revised'>('')
function seed() {
  if (!seedFile.value) return
  const form = new FormData()
  form.append('file', seedFile.value)
  form.append('kind', seedKind.value)
  act(() => $fetch('/api/budget-lines/import', { method: 'POST', body: form }), '最初の予算を取り込みました。')
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

    <!-- 集約中 -->
    <template v-if="collecting">
      <div class="card head">
        <h2>{{ collecting.round.term }} {{ collecting.round.kind }}を集約中</h2>
        <p class="hint">
          {{ collecting.round.kind === '補正予算'
            ? '確定した本予算を写しています。変える明細だけを直して提出してください（直していない明細は承認済みのままです）。'
            : '昨年の予算を写しています。担当ごとに明細を確かめ、直して、すべて提出してください。' }}
        </p>
        <p v-if="summary">
          合計 <strong>{{ formatYen(summary.total) }}</strong>（もとの予算 {{ formatYen(summary.base) }}）・
          未提出 {{ summary.draft }} ／ 要修正 {{ summary.returned }} ／ 査定待ち {{ summary.submitted }} ／ 承認済み {{ summary.approved }}
        </p>
        <div v-if="reviewer" class="buttons">
          <NuxtLink class="button" to="/budget/review">査定する（{{ summary?.submitted ?? 0 }}件）</NuxtLink>
          <NuxtLink class="button secondary" to="/budget/setup">局・担当と入力する人</NuxtLink>
          <button :disabled="pending" @click="confirmRound">確定する</button>
          <button class="secondary" :disabled="pending" @click="cancelRound">集約をやめる</button>
        </div>
      </div>

      <div v-if="myTeams.length" class="card">
        <h2>あなたが入力する担当</h2>
        <ul class="team-links">
          <li v-for="t in myTeams" :key="t.id"><NuxtLink :to="`/budget/team/${t.id}`">{{ t.bureau }} ／ {{ t.team }}</NuxtLink></li>
        </ul>
      </div>
      <p v-else-if="!reviewer" class="hint">あなたはまだ担当に割り当てられていません。財務管理部に、入力する担当を割り当ててもらってください。</p>

      <h2>担当ごとの進み具合</h2>
      <div class="table-wrap">
        <table class="teams">
          <thead>
            <tr><th>局</th><th>担当</th><th>担当者</th><th>金額</th><th>もとの予算</th><th>未提出</th><th>要修正</th><th>査定待ち</th><th>承認済み</th></tr>
          </thead>
          <tbody>
            <tr v-for="t in collecting.teams" :key="t.id">
              <td>{{ t.bureau }}</td>
              <td><NuxtLink :to="`/budget/team/${t.id}`">{{ t.team }}</NuxtLink></td>
              <td>{{ t.person }}</td>
              <td class="num">{{ formatYen(teamSummary(itemsOf(t.id)).total) }}</td>
              <td class="num muted">{{ formatYen(teamSummary(itemsOf(t.id)).base) }}</td>
              <td class="num" :class="{ warn: teamSummary(itemsOf(t.id)).draft }">{{ teamSummary(itemsOf(t.id)).draft }}</td>
              <td class="num" :class="{ warn: teamSummary(itemsOf(t.id)).returned }">{{ teamSummary(itemsOf(t.id)).returned }}</td>
              <td class="num">{{ teamSummary(itemsOf(t.id)).submitted }}</td>
              <td class="num">{{ teamSummary(itemsOf(t.id)).approved }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- 集約していない -->
    <template v-else>
      <div v-if="view" class="card head">
        <h2>確定した予算：{{ view.round.term }} {{ view.round.kind }}</h2>
        <p>{{ lines.length }}件の明細（合計 {{ formatYen(total) }}）。執行依頼ではこの予算から選びます。</p>
        <form v-if="reviewer" class="start" @submit.prevent="startRound">
          <strong>次の予算の集約を始める</strong>
          <p class="hint">この予算をまるごと写して始めます。各担当が直して提出し、財務管理部が査定して確定します。</p>
          <fieldset class="kind">
            <legend>予算の種類</legend>
            <label class="check"><input v-model="start.kind" type="radio" value="本予算" required> 本予算（新しい期）</label>
            <label class="check"><input v-model="start.kind" type="radio" value="補正予算"> 補正予算（同じ期）</label>
          </fieldset>
          <label>期<input v-model.trim="start.term" class="w-m" required placeholder="例：第100期"></label>
          <button type="submit" :disabled="pending || !start.kind || !start.term">集約を始める</button>
        </form>
      </div>

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
            <button type="submit" :disabled="pending || !seedFile || !seedKind">取り込む</button>
          </form>
        </template>
        <p v-else class="hint">財務管理部が予算を用意するまでお待ちください。</p>
      </div>

      <template v-if="lines.length">
        <h2>明細一覧</h2>
        <input v-model="query" type="search" class="search" placeholder="絞り込み（項目番号・局・担当・名前・取引先）">
        <BudgetTable :lines="filtered" fixed-height />
      </template>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; margin-bottom: 1.5rem; display: grid; gap: .6rem; }
.head h2, .card h2 { margin: 0; font-size: 1.1rem; }
h2 { font-size: 1.1rem; }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
.start { border-top: 1px solid var(--border); padding-top: .9rem; }
.kind { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; }
.team-links { margin: 0; padding-left: 1.2rem; }
.table-wrap { overflow-x: auto; }
.teams { border-collapse: collapse; min-width: 44rem; background: var(--surface); }
.teams th, .teams td { white-space: nowrap; padding: .45rem .6rem; border-bottom: 1px solid var(--border); text-align: left; font-size: .9rem; }
.teams .num { text-align: right; font-variant-numeric: tabular-nums; }
.teams .warn { color: var(--danger); font-weight: 600; }
.search { max-width: 420px; margin-bottom: .75rem; }
.ok { color: var(--done); }
</style>
