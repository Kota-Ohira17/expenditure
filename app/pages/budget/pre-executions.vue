<script setup lang="ts">
/**
 * 予算前執行（④）。本予算が確定する前に、新しい年度の分を執行するための枠。
 * 担当の人が申請（本予算の集約中だけ）→ 財務管理部が承認（認める額を決める）→ 執行依頼で「【予算前執行】」の予算として選べる
 * → 本予算が確定すると、同じ項目番号（なければ同じ款・項・目・節）の予算項目に、その枠で執行した申請が付け替わる。
 */
import type { PreExecutionInput } from '#shared/schemas'

const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const { data, refresh } = await useFetch('/api/budget/pre-executions')
type Pre = NonNullable<typeof data.value>['list'][number]

const STATUS = {
  pending: { label: '承認待ち', tone: 'yellow' },
  approved: { label: '承認済み（執行できる）', tone: 'green' },
  settled: { label: '確定済み', tone: 'gray' },
  rejected: { label: '却下', tone: 'red' },
  withdrawn: { label: '取り下げ', tone: 'gray' },
} as const
const TABS = { pending: '承認待ち', approved: '承認済み', settled: '確定済み', closed: '却下・取り下げ' } as const
type Tab = keyof typeof TABS
const tab = ref<Tab>('pending')
const inTab = (p: Pre, t: Tab) => (t === 'closed' ? p.status === 'rejected' || p.status === 'withdrawn' : p.status === t)
const shown = computed(() => (data.value?.list ?? []).filter(p => inTab(p, tab.value)))
const countOf = (t: Tab) => (data.value?.list ?? []).filter(p => inTab(p, t)).length
const nameOf = (p: Pick<Pre, 'kan' | 'kou' | 'moku' | 'setsu'>) => `${p.kan} ／ ${[p.kou, p.moku, p.setsu].filter(Boolean).join(' / ')}`

/** 申請のフォーム */
const myTeams = computed(() => (data.value?.teams ?? []).filter(t => data.value!.editableTeamIds.includes(t.id)))
const creating = ref(false)
const empty = () => ({ teamId: '' as number | '', itemNumber: '', kan: '', kou: '', moku: '', setsu: '', quantity: '', vendor: '', amount: '', reason: '', neededBy: '' })
const form = reactive(empty())
const teamItems = computed(() => (data.value?.items ?? []).filter(i => i.teamId === form.teamId))
/** 集約中の項目を選ぶと、名前・数量・取引先・金額を写す */
watch(() => form.itemNumber, (no) => {
  const i = teamItems.value.find(x => x.number === no)
  if (i) Object.assign(form, { kan: i.kan, kou: i.kou, moku: i.moku, setsu: i.setsu, quantity: i.quantity, vendor: i.vendor, amount: String(i.amount) })
})
watch(() => form.teamId, () => { form.itemNumber = '' })
function openForm() {
  creating.value = !creating.value
  errors.value = []
  message.value = ''
  if (myTeams.value.length === 1) form.teamId = myTeams.value[0]!.id
}
const pending = ref(false)
const errors = ref<string[]>([])
const message = ref('')
async function submit() {
  errors.value = []
  if (form.teamId === '') {
    errors.value = ['担当を選んでください。']
    return
  }
  pending.value = true
  try {
    await $fetch('/api/budget/pre-executions', { method: 'POST', body: { ...form, itemNumber: form.itemNumber || null } as unknown as PreExecutionInput })
    message.value = '予算前執行を申請しました。財務管理部が承認すると、執行依頼で選べるようになります。'
    creating.value = false
    Object.assign(form, empty())
    tab.value = 'pending'
    await refresh()
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}

/** 承認・却下（財務管理部）と取り下げ（申請した人） */
const amounts = reactive<Record<string, string>>({})
const comments = reactive<Record<string, string>>({})
const cardErrors = reactive<Record<string, string[]>>({})
const busy = ref<string | null>(null)
async function act(p: Pre, run: () => Promise<unknown>, linesChanged = false) {
  busy.value = p.id
  delete cardErrors[p.id]
  try {
    await run()
    await Promise.all([refresh(), linesChanged && refreshNuxtData('budget-lines')])
  }
  catch (error) {
    cardErrors[p.id] = toMessages(error)
  }
  finally {
    busy.value = null
  }
}
const review = (p: Pre, decision: 'approve' | 'reject') => act(p, () => $fetch(`/api/budget/pre-executions/${p.id}/review`, {
  method: 'POST',
  body: { decision, approvedAmount: amounts[p.id] ? Number(amounts[p.id]) : null, comment: comments[p.id] ?? '' },
}), decision === 'approve')
function withdraw(p: Pre) {
  if (confirm('この申請を取り下げます。よろしいですか？')) act(p, () => $fetch(`/api/budget/pre-executions/${p.id}`, { method: 'DELETE' }))
}
</script>

<template>
  <section>
    <div class="page-head">
      <h1>予算前執行</h1>
      <button v-if="data?.open && myTeams.length" class="primary" @click="openForm">
        <AppIcon name="plus" /> 予算前執行の申請
      </button>
    </div>
    <p class="hint">
      本予算が確定する前に、新しい年度の分を執行するための枠です。承認されると、執行依頼で「【予算前執行】」の予算として選べます。
      本予算が確定すると、同じ項目番号（なければ同じ款・項・目・節）の予算項目に、その枠で執行した申請が付け替わります。
    </p>
    <p v-if="data && !data.open" class="card">申請できるのは、本予算の集約中だけです。</p>
    <p v-if="message" class="ok">{{ message }}</p>

    <div v-if="creating" class="card create">
      <h2>予算前執行の申請</h2>
      <form class="fields" @submit.prevent="submit">
        <label><span>担当<span class="req">*</span></span>
          <select v-model="form.teamId" required>
            <option value="">選んでください</option>
            <option v-for="t in myTeams" :key="t.id" :value="t.id">{{ t.bureau }} ／ {{ t.team }}</option>
          </select>
        </label>
        <label v-if="form.teamId !== ''"><span>集約中の項目（あれば）</span>
          <select v-model="form.itemNumber">
            <option value="">選ばない（下に書く）</option>
            <option v-for="i in teamItems" :key="i.number" :value="i.number">{{ i.number }}　{{ i.kan }} ／ {{ itemName(i) }}　{{ formatYen(i.amount) }}</option>
          </select>
        </label>
        <div class="row">
          <label><span>款<span class="req">*</span></span><input v-model.trim="form.kan" required></label>
          <label>項<input v-model.trim="form.kou"></label>
          <label>目<input v-model.trim="form.moku"></label>
          <label>節<input v-model.trim="form.setsu"></label>
        </div>
        <div class="row">
          <label>数量<input v-model.trim="form.quantity" class="w-s"></label>
          <label>取引先<input v-model.trim="form.vendor"></label>
          <label><span>金額（円）<span class="req">*</span></span><YenInput v-model="form.amount" class="w-s" required /></label>
          <label>必要な日<input v-model.trim="form.neededBy" class="w-s"></label>
        </div>
        <label><span>予算の確定前に要る理由<span class="req">*</span></span><textarea v-model.trim="form.reason" rows="2" required /></label>
        <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        <div class="buttons">
          <button type="submit" :disabled="pending">申請</button>
          <button type="button" class="secondary" @click="creating = false">やめる</button>
        </div>
      </form>
    </div>

    <nav class="tabs">
      <button v-for="(label, key) in TABS" :key="key" :class="{ active: tab === key }" @click="tab = key">
        {{ label }}（{{ countOf(key) }}）
      </button>
    </nav>
    <p v-if="!shown.length" class="hint">該当する予算前執行はありません。</p>

    <div class="card-list">
      <InfoCard
        v-for="p in shown" :key="p.id"
        :status="STATUS[p.status].label" :tone="STATUS[p.status].tone"
        :meta="`${p.itemNumber || '項目番号なし'}　${p.bureau} ／ ${p.team}`"
        :title="nameOf(p)"
        :when="p.reviewedAt ?? p.createdAt"
        :note="[p.reason && `理由：${p.reason}`, p.neededBy && `必要な日：${p.neededBy}`, p.reviewComment && `${p.status === 'rejected' ? '却下の理由' : 'コメント'}：${p.reviewComment}`].filter(Boolean).join('\n')"
      >
        <template #tags>
          <span v-if="p.mine" class="tag">あなたの申請</span>
          <span v-if="p.status === 'settled'" class="tag" :class="{ fill: !p.lineKey, red: !p.lineKey }">{{ p.lineKey ? '本予算に付け替え済み' : '予算外' }}</span>
        </template>
        申請 {{ formatYen(p.amount) }}<template v-if="p.approvedAmount != null">／ 承認 {{ formatYen(p.approvedAmount) }}</template>
        <span class="sub">
          執行 {{ formatYen(p.used) }}（{{ p.usedCount }}件）
          <strong v-if="p.approvedAmount != null && p.used > p.approvedAmount" class="over">承認額を超えています</strong>
        </span>
        <template v-if="p.status === 'pending' && (reviewer || p.mine)" #footer>
          <div class="actions">
            <template v-if="reviewer">
              <YenInput :model-value="amounts[p.id] ?? ''" @update:model-value="amounts[p.id] = $event" class="w-s" :placeholder="String(p.amount)" aria-label="認める額" />
              <input v-model="comments[p.id]" class="comment" placeholder="コメント（却下のときは必須）">
              <button :disabled="busy !== null" @click="review(p, 'approve')">承認</button>
              <button class="secondary" :disabled="busy !== null" @click="review(p, 'reject')">却下</button>
            </template>
            <button v-if="p.mine" class="link" :disabled="busy !== null" @click="withdraw(p)">取り下げ</button>
          </div>
          <ul v-if="cardErrors[p.id]?.length" class="error"><li v-for="e in cardErrors[p.id]" :key="e">{{ e }}</li></ul>
        </template>
      </InfoCard>
    </div>
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
.fields { display: grid; gap: .7rem; }
.row { display: flex; flex-wrap: wrap; gap: .6rem 1rem; }
.buttons { display: flex; gap: .5rem; }
.sub { display: block; font-weight: 400; font-size: .8rem; color: var(--muted); margin-top: .2rem; }
.over { color: var(--danger); margin-left: .4rem; }
.actions { display: flex; flex-wrap: wrap; gap: .5rem; align-items: center; }
.comment { flex: 1 1 14rem; max-width: none; }
.ok { color: var(--done); }
:deep(.note) { white-space: pre-line; }
</style>
