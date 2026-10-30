<script setup lang="ts">
/**
 * 査定（財務管理部）。査定待ちの明細を担当ごとに並べ、明細ごとに承認するか、理由を書いて担当に戻す（要修正）。
 * もとの予算（昨年・本予算）からの変わり方も並べて見られる。
 * 上部：「新規登録」（財務管理部が明細を足す。そのまま承認済みにもできる）、検索、状態の件数と絞り込み。
 */
import type { BudgetItemInput } from '#shared/schemas'
const { can } = usePermissions()
if (!can('reviewBudget')) await navigateTo('/budget')
const { data: view, refresh } = await useBudgetRound()

const phase = computed(() => view.value?.round.status ?? 'confirmed')
const open = computed(() => phase.value !== 'confirmed')
const collecting = computed(() => phase.value === 'reviewing')
/** 表示する状態（査定待ち・要修正もの・承認済みのうち、もとの予算から変わったもの） */
type Filter = 'submitted' | 'returned' | 'approved'
const FILTERS = [
  { key: 'submitted', label: '査定待ち', icon: 'clock' },
  { key: 'returned', label: '要修正', icon: 'rotate-ccw' },
  { key: 'approved', label: '承認済み（変更あり）', icon: 'check-circle' },
] as const
const filter = ref<Filter>('submitted')
const inFilter = (i: BudgetItemView, f: Filter) => i.status === f && (f !== 'approved' || changeOf(i).kind !== 'same')
/** 検索と絞り込み（局・担当・変わり方・その他） */
const query = ref('')
const bureau = ref('')
const teamId = ref<number | ''>('')
const change = ref<'' | 'plus' | 'minus' | 'new' | 'deleted'>('')
const flag = ref<'' | 'isNew' | 'preExecution' | 'comment'>('')
const teamById = computed(() => new Map((view.value?.teams ?? []).map(t => [t.id, t])))
const bureaus = computed(() => [...new Set((view.value?.teams ?? []).map(t => t.bureau))])
const teamOptions = computed(() => (view.value?.teams ?? []).filter(t => !bureau.value || t.bureau === bureau.value))
watch(bureau, () => { teamId.value = '' })
function matches(i: BudgetItemView) {
  const t = teamById.value.get(i.teamId)
  if (bureau.value && t?.bureau !== bureau.value) return false
  if (teamId.value !== '' && i.teamId !== teamId.value) return false
  if (change.value === 'new' && i.baseItemId != null) return false
  if (change.value === 'deleted' && !i.deleted) return false
  if ((change.value === 'plus' || change.value === 'minus') && (i.baseItemId == null || i.deleted || changeOf(i).kind !== change.value)) return false
  if (flag.value === 'comment' && !i.reviewComment) return false
  if ((flag.value === 'isNew' || flag.value === 'preExecution') && !i[flag.value]) return false
  const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const text = [i.number, i.kan, itemName(i), i.vendor, i.spec, i.remark, t?.bureau, t?.team].join(' ').toLowerCase()
  return words.every(w => text.includes(w))
}
const narrowed = computed(() => (collecting.value ? view.value!.items.filter(matches) : []))
const count = (f: Filter) => narrowed.value.filter(i => inFilter(i, f)).length
const shown = computed(() => narrowed.value.filter(i => inFilter(i, filter.value)))

/** 新規登録（財務管理部が明細を足す） */
const creating = ref(false)
const createTeam = ref<number | ''>('')
const createApprove = ref(true)
const createErrors = ref<string[]>([])
const createDone = ref('')
const createKans = computed(() => [...new Set((view.value?.items ?? []).filter(i => i.teamId === createTeam.value).map(i => i.kan).filter(Boolean))])
async function createItem(value: BudgetItemInput) {
  createErrors.value = []
  if (createTeam.value === '') {
    createErrors.value = ['担当を選んでください。']
    return
  }
  try {
    await $fetch(`/api/budget/teams/${createTeam.value}/items`, { method: 'POST', body: { ...value, approve: createApprove.value } })
    createDone.value = createApprove.value ? '明細を足し、承認済みにしました。' : '明細を足しました（担当の「未提出」に入っています）。'
    creating.value = false
    await refresh()
  }
  catch (error) {
    createErrors.value = toMessages(error)
  }
}
const groups = computed(() => (view.value?.teams ?? [])
  .map(t => ({ team: t, list: shown.value.filter(i => i.teamId === t.id) }))
  .filter(g => g.list.length)
  .map(g => ({ ...g, total: g.list.filter(i => !i.deleted).reduce((s, i) => s + i.amount, 0), visible: g.list.slice(0, limitOf(g.team.id)) })))

/** 担当ごとに、カードは20件ずつ出す（「もっと見る」で20件ずつ増やす）。検索や絞り込みを変えたら20件に戻す */
const PAGE = 20
const limits = reactive<Record<number, number>>({})
const limitOf = (teamId: number) => limits[teamId] ?? PAGE
const showMore = (teamId: number) => { limits[teamId] = limitOf(teamId) + PAGE }
watch([filter, query, bureau, teamId, change, flag], () => {
  for (const k of Object.keys(limits)) delete limits[Number(k)]
})
const STATUS_TONE = { draft: 'gray', submitted: 'yellow', returned: 'red', approved: 'green' } as const

const comments = reactive<Record<number, string>>({})
const errors = reactive<Record<number, string[]>>({})
const busy = ref<number | null>(null)
async function review(id: number, decision: 'approve' | 'return') {
  busy.value = id
  delete errors[id]
  try {
    const updated = await $fetch(`/api/budget/items/${id}/review`, { method: 'POST', body: { decision, comment: comments[id] ?? '' } })
    // 全件を取り直さず、手元の明細だけ書き換える（番号は状態では変わらない）
    const item = view.value?.items.find(i => i.id === id)
    if (item && updated) Object.assign(item, { status: updated.status, reviewComment: updated.reviewComment, updatedAt: updated.updatedAt })
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
  if (!view.value || !confirm(`${ids.length}件をまとめて承認します。よろしいですか？`)) return
  busy.value = -1
  try {
    await $fetch(`/api/budget/rounds/${view.value.round.id}/approve`, { method: 'POST', body: { ids } })
    await refresh()
  }
  catch (error) {
    alert(toMessages(error).join('\n'))
  }
  finally {
    busy.value = null
  }
}
</script>

<template>
  <section>
    <div class="page-head">
      <h1>査定</h1>
      <button v-if="open" class="primary" @click="creating = !creating; createDone = ''">
        <AppIcon name="plus" /> 新規登録
      </button>
    </div>
    <p v-if="createDone" class="ok">{{ createDone }}</p>

    <div v-if="creating" class="card create">
      <h2>明細を新規登録</h2>
      <div class="create-fields">
        <label><span>担当<span class="req">*</span></span>
          <select v-model="createTeam" required>
            <option value="">選んでください</option>
            <option v-for="t in view?.teams ?? []" :key="t.id" :value="t.id">{{ t.bureau }} ／ {{ t.team }}</option>
          </select>
        </label>
        <label class="check"><input v-model="createApprove" type="checkbox"> そのまま承認済み</label>
      </div>
      <BudgetItemForm
        :key="createTeam" :kans="createKans" submit-label="登録" :errors="createErrors"
        @submit="createItem" @cancel="creating = false"
      />
    </div>
    <p v-if="!collecting" class="card">
      {{ open
        ? `今は「${PHASE_LABELS[phase]}」です。査定は「集約終了」のあと「査定開始」を押すと使えます（「集約」の画面から）。`
        : '今は集約していません。「集約」の画面で集約開始 → 集約終了 → 査定開始の順に進めると、査定できます。' }}
    </p>
    <template v-else>
      <label class="search">
        <AppIcon name="search" />
        <input v-model="query" type="search" placeholder="査定を検索（項目番号・名前・担当・取引先・備考）" aria-label="査定を検索">
      </label>

      <div class="filter-bar">
        <div class="counts" role="tablist">
          <button
            v-for="f in FILTERS" :key="f.key" role="tab" class="count" :class="{ on: filter === f.key }"
            :aria-selected="filter === f.key" @click="filter = f.key"
          >
            <AppIcon :name="f.icon" /> <strong>{{ count(f.key) }}</strong> {{ f.label }}
          </button>
        </div>
        <div class="drops">
          <select v-model="bureau" aria-label="局"><option value="">局</option><option v-for="b in bureaus" :key="b" :value="b">{{ b }}</option></select>
          <select v-model="teamId" aria-label="担当"><option value="">担当</option><option v-for="t in teamOptions" :key="t.id" :value="t.id">{{ t.team }}</option></select>
          <select v-model="change" aria-label="変わり方">
            <option value="">変わり方</option><option value="plus">増額</option><option value="minus">減額</option><option value="new">新規の明細</option><option value="deleted">削除</option>
          </select>
          <select v-model="flag" aria-label="その他">
            <option value="">その他</option><option value="isNew">新規の印あり</option><option value="preExecution">予算前執行</option><option value="comment">コメントあり</option>
          </select>
        </div>
      </div>
      <p v-if="!shown.length" class="hint">{{ filter === 'submitted' ? '査定待ちの明細はありません。担当が明細を提出すると、ここに並びます。' : '該当する明細はありません。' }}</p>

      <section v-for="g in groups" :key="g.team.id" class="group">
        <header class="group-head">
          <div class="group-name">
            <span class="group-bureau">{{ g.team.bureau }}</span>
            <h2><NuxtLink :to="`/budget/team/${g.team.id}`">{{ g.team.team }}</NuxtLink></h2>
          </div>
          <div class="group-stats">
            <span><strong>{{ g.list.length }}</strong>件</span>
            <span>合計 <strong>{{ formatYen(g.total) }}</strong></span>
          </div>
          <button v-if="filter === 'submitted'" class="secondary" :disabled="busy !== null" @click="approveAll(g.list.map(i => i.id))">
            まとめて承認（{{ g.list.length }}件）
          </button>
        </header>
        <div class="card-list">
          <InfoCard
            v-for="i in g.visible" :key="i.id"
            :status="itemStatusLabel(i)" :tone="STATUS_TONE[i.status]"
            :meta="`${i.number}　担当：${g.team.team}`"
            :title="`${i.kan} ／ ${itemName(i)}`"
            :when="i.updatedAt" :note="i.reviewComment || i.remark || i.spec"
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
                <button :disabled="busy !== null" @click="review(i.id, 'approve')">承認</button>
                <button class="secondary" :disabled="busy !== null" @click="review(i.id, 'return')">要修正</button>
              </div>
              <ul v-if="errors[i.id]?.length" class="error"><li v-for="e in errors[i.id]" :key="e">{{ e }}</li></ul>
            </template>
          </InfoCard>
        </div>
        <div v-if="g.list.length > g.visible.length" class="more">
          <span class="muted">{{ g.visible.length }} / {{ g.list.length }}件を表示</span>
          <button class="secondary" @click="showMore(g.team.id)">もっと見る（次の{{ Math.min(PAGE, g.list.length - g.visible.length) }}件）</button>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; }
.page-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }
.page-head h1 { margin: 0; }
.primary { display: inline-flex; align-items: center; gap: .35rem; background: #1a73e8; color: #fff; border: none; font-weight: 700; padding: .55rem 1rem; border-radius: 8px; }
.primary:hover:not(:disabled) { background: #1666d0; }
.create { margin: 1rem 0; display: grid; gap: .7rem; }
.create h2 { margin: 0; font-size: 1.05rem; }
.create-fields { display: flex; flex-wrap: wrap; gap: .6rem 1.2rem; align-items: end; }
.search { display: flex; align-items: center; gap: .5rem; max-width: 36rem; margin: 1.2rem auto 1rem; padding: .1rem .8rem; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--muted); }
.search input { border: none; background: transparent; padding: .5rem 0; max-width: none; outline: none; }
.filter-bar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .6rem 1rem; padding: .8rem 1rem; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); margin-bottom: 1rem; }
.counts { display: flex; flex-wrap: wrap; gap: .2rem 1rem; }
.count { display: inline-flex; align-items: center; gap: .3rem; background: none; border: none; padding: .2rem 0; color: var(--muted); font-size: .82rem; }
.count:hover:not(:disabled) { background: none; color: var(--text); }
.count.on { color: var(--text); font-weight: 700; }
.drops { display: flex; flex-wrap: wrap; gap: .2rem .4rem; }
.drops select { width: auto; border: none; background: transparent; font-size: .85rem; padding: .25rem 1.4rem .25rem .4rem; max-width: 11rem; cursor: pointer; }
.drops select:hover { background: var(--accent-bg); border-radius: 6px; }
/* 担当ごとのまとまり：枠で囲み、見出しの帯に担当名・件数・合計 */
.group { margin: 1.4rem 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); overflow: hidden; }
.group-head { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.2rem; padding: .7rem 1rem; background: var(--accent-bg); border-bottom: 1px solid var(--border); border-left: 5px solid var(--accent); }
.group-name { display: grid; flex: 1 1 12rem; }
.group-bureau { font-size: .78rem; color: var(--muted); }
.group-head h2 { font-size: 1.1rem; margin: 0; }
.group-head h2 a { color: inherit; }
.group-stats { display: flex; gap: 1rem; font-size: .85rem; color: var(--muted); white-space: nowrap; }
.group-stats strong { color: var(--text); }
.group .card-list { padding: .8rem; }
.more { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: .4rem 1rem; padding: 0 .8rem .9rem; font-size: .85rem; }
.base { font-weight: 400; color: var(--muted); margin-left: .3rem; font-size: .85rem; }
.sub { display: block; font-weight: 400; font-size: .8rem; color: var(--muted); margin-top: .2rem; }
.actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.comment { flex: 1 1 16rem; max-width: none; }
</style>
