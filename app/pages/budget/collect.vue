<script setup lang="ts">
/**
 * 集約。集約中なら、担当ごとの進み具合と、自分が入力する担当への入口。財務管理部には設定・確定・取りやめ。
 * 集約していないときは、財務管理部には次の集約を始めるフォーム（最新の確定した予算を写して始める）。
 */
const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const { data: view, refresh } = await useBudgetRound()
const { refresh: refreshLines } = await useBudgetLines()

const collecting = computed(() => view.value?.round.status === 'collecting' ? view.value : null)
const itemsOf = (teamId: number) => view.value?.items.filter(i => i.teamId === teamId) ?? []

/** 担当のカードの中身：状態の札（次に動く人が分かるもの）・合計・最後に直した明細 */
function teamCard(t: BudgetTeamView) {
  const items = itemsOf(t.id)
  const s = teamSummary(items)
  const status = s.returned ? { label: '要修正あり', tone: 'red' as const }
    : s.draft ? { label: '未提出あり', tone: 'gray' as const }
      : s.submitted ? { label: '査定待ち', tone: 'yellow' as const }
        : { label: '承認済み', tone: 'green' as const }
  const last = items.reduce<BudgetItemView | undefined>((a, b) => (!a || new Date(b.updatedAt) > new Date(a.updatedAt) ? b : a), undefined)
  const changed = items.filter(i => changeOf(i).kind !== 'same').length
  return { s, status, last, changed, mine: collecting.value?.editableTeamIds.includes(t.id) && !reviewer.value }
}
/** 自分の担当を先に、そのあと要修正・未提出・査定待ち・承認済みの順に並べる */
const order = { red: 0, gray: 1, yellow: 2, green: 3 }
const cards = computed(() => (collecting.value?.teams ?? [])
  .map(t => ({ team: t, ...teamCard(t) }))
  .sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || order[a.status.tone] - order[b.status.tone]))
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
/** まだ承認していない明細（未提出・要修正・査定待ち）の数。「すべて承認」で一度に承認できる */
const notApproved = computed(() => (summary.value ? summary.value.draft + summary.value.returned + summary.value.submitted : 0))
function approveAll() {
  const s = summary.value
  if (!collecting.value || !s || !confirm(`未提出 ${s.draft}件・要修正 ${s.returned}件・査定待ち ${s.submitted}件を、すべて承認済みにします。担当がまだ提出していない明細も承認されます。よろしいですか？`)) return
  act(() => $fetch(`/api/budget/rounds/${collecting.value!.round.id}/approve-all`, { method: 'POST' }), 'すべての明細を承認しました。確定できます。')
}
/** まだ提出していない明細（未提出・要修正）の数。「すべて提出」で一度に査定待ちにできる */
const notSubmitted = computed(() => (summary.value ? summary.value.draft + summary.value.returned : 0))
function submitAll() {
  const s = summary.value
  if (!collecting.value || !s || !confirm(`すべての担当の未提出 ${s.draft}件・要修正 ${s.returned}件を提出します（査定待ちになります）。よろしいですか？`)) return
  act(() => $fetch(`/api/budget/rounds/${collecting.value!.round.id}/submit-all`, { method: 'POST' }), 'すべての明細を提出しました。「査定」で査定できます。')
}
/** 自分の担当の未提出・要修正をまとめて提出する（担当の人） */
const toSubmitOf = (teamId: number) => itemsOf(teamId).filter(i => i.status === 'draft' || i.status === 'returned').length
function submitTeam(t: BudgetTeamView) {
  if (!confirm(`${t.team}の未提出・要修正の明細${toSubmitOf(t.id)}件を提出します。提出すると、査定が終わるまで直せません。よろしいですか？`)) return
  act(() => $fetch(`/api/budget/teams/${t.id}/submit`, { method: 'POST' }), `${t.team}の明細を提出しました。財務管理部の査定を待ってください。`)
}
function cancelRound() {
  if (!collecting.value || !confirm('集約をやめます。この集約で入力した明細はすべて消えます。よろしいですか？')) return
  act(() => $fetch(`/api/budget/rounds/${collecting.value!.round.id}`, { method: 'DELETE' }), '集約をやめました。')
}
</script>

<template>
  <section>
    <h1>集約</h1>
    <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
    <p v-if="message" class="ok">{{ message }}</p>

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
          <NuxtLink class="button" to="/budget/review">査定（{{ summary?.submitted ?? 0 }}件）</NuxtLink>
          <NuxtLink class="button secondary" to="/budget/setup">局・担当と入力する人</NuxtLink>
          <button :disabled="pending || !notSubmitted" @click="submitAll">すべて提出（{{ notSubmitted }}件）</button>
          <button :disabled="pending || !notApproved" @click="approveAll">すべて承認（{{ notApproved }}件）</button>
          <button :disabled="pending || notApproved > 0" :title="notApproved ? 'すべての明細を承認すると確定できます。' : ''" @click="confirmRound">確定</button>
          <button class="secondary" :disabled="pending" @click="cancelRound">集約の取りやめ</button>
        </div>
      </div>

      <div v-if="myTeams.length" class="card">
        <h2>あなたの担当</h2>
        <ul class="team-links">
          <li v-for="t in myTeams" :key="t.id">
            <NuxtLink :to="`/budget/team/${t.id}`">{{ t.bureau }} ／ {{ t.team }}</NuxtLink>
            <button class="submit-team" :disabled="pending || !toSubmitOf(t.id)" @click="submitTeam(t)">すべて提出（{{ toSubmitOf(t.id) }}件）</button>
          </li>
        </ul>
      </div>
      <p v-else-if="!reviewer" class="hint">あなたはまだ担当に割り当てられていません。財務管理部に、入力する担当を割り当ててもらってください。</p>

      <h2>担当ごとの進み具合</h2>
      <div class="card-list">
        <InfoCard
          v-for="c in cards" :key="c.team.id" :to="`/budget/team/${c.team.id}`"
          :status="c.status.label" :tone="c.status.tone"
          :meta="`${c.team.bureauNo}　入力する人：${c.team.members.map(m => m.name).join('、') || '未割り当て'}`"
          :title="`${c.team.bureau} ／ ${c.team.team}`"
          :who="c.last?.updatedByName" :when="c.last?.updatedAt"
          :note="c.last ? `${itemName(c.last)}${c.last.reviewComment ? `：${c.last.reviewComment}` : ''}` : ''"
        >
          <template #tags>
            <span v-if="c.mine" class="tag">あなたの担当</span>
            <span v-if="c.changed" class="tag">変更 {{ c.changed }}件</span>
            <span v-if="c.s.returned" class="tag fill red">要修正 {{ c.s.returned }}</span>
            <span v-if="c.s.draft" class="tag fill">未提出 {{ c.s.draft }}</span>
            <span v-if="c.s.submitted" class="tag fill yellow">査定待ち {{ c.s.submitted }}</span>
            <span v-if="c.s.approved" class="tag fill green">承認 {{ c.s.approved }}</span>
          </template>
          {{ formatYen(c.s.total) }}<span class="base">（もとの予算 {{ formatYen(c.s.base) }}）</span>
        </InfoCard>
      </div>
    </template>

    <template v-else>
      <div class="card head">
        <h2>今は集約していません</h2>
        <p v-if="!view" class="hint">
          まだ予算がありません。{{ reviewer ? '「予算」の画面で、もとにする予算（昨年の予算など）を取り込んでから始めてください。' : '財務管理部が予算を用意するまでお待ちください。' }}
        </p>
        <template v-else-if="reviewer">
          <p class="hint">確定した予算（{{ view.round.term }} {{ view.round.kind }}）をまるごと写して始めます。各担当が直して提出し、「査定」で査定して確定します。</p>
          <form class="start" @submit.prevent="startRound">
            <fieldset class="kind">
              <legend>予算の種類</legend>
              <label class="check"><input v-model="start.kind" type="radio" value="本予算" required> 本予算（新しい期）</label>
              <label class="check"><input v-model="start.kind" type="radio" value="補正予算"> 補正予算（同じ期）</label>
            </fieldset>
            <label>期<input v-model.trim="start.term" class="w-m" required placeholder="例：第100期"></label>
            <button type="submit" :disabled="pending || !start.kind || !start.term">集約開始</button>
          </form>
        </template>
        <p v-else class="hint">財務管理部が集約を始めると、ここから自分の担当の明細を入力できます。</p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; margin-bottom: 1.5rem; display: grid; gap: .6rem; }
.head h2, .card h2 { margin: 0; font-size: 1.1rem; }
h2 { font-size: 1.1rem; }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
.kind { display: flex; flex-wrap: wrap; gap: .4rem 1.2rem; }
.team-links { margin: 0; padding-left: 1.2rem; display: grid; gap: .4rem; }
.submit-team { margin-left: .8rem; padding: .3rem .7rem; font-size: .85rem; }
.base { font-weight: 400; color: var(--muted); margin-left: .3rem; font-size: .85rem; }
.ok { color: var(--done); }
</style>
