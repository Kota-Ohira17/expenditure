<script setup lang="ts">
/**
 * 担当の予算の明細。その担当の人（と財務管理部）は、明細を直す・足す・消すことができ、終わったら提出する。
 * 担当の人が直せるのは、集約中は査定待ち以外、査定中は要修正の明細だけ。集約終了のあとは直せない（財務管理部は確定までいつでも）。
 * 写してきた明細を消すと「削除」の印が付き、査定で承認されると確定したときに予算から消える。
 * ほかの人は見るだけ。
 */
import type { BudgetItemInput } from '#shared/schemas'

const route = useRoute()
const teamId = Number(route.params.id)
const { data: view, refresh } = await useBudgetRound()

const team = computed(() => view.value?.teams.find(t => t.id === teamId))
const { can } = usePermissions()
const reviewer = computed(() => can('reviewBudget'))
const phase = computed(() => view.value?.round.status ?? 'confirmed')
const open = computed(() => phase.value !== 'confirmed')
const editable = computed(() => open.value && !!view.value?.editableTeamIds.includes(teamId))
/** 明細を足せるか（担当の人は集約中だけ） */
const canAdd = computed(() => editable.value && (reviewer.value || phase.value === 'collecting'))
const items = computed(() => view.value?.items.filter(i => i.teamId === teamId) ?? [])
const summary = computed(() => teamSummary(items.value))
/** 款ごとにまとめる（並びは予算の表の順） */
const kans = computed(() => {
  const groups = new Map<string, BudgetItemView[]>()
  for (const i of items.value) groups.set(i.kan, [...(groups.get(i.kan) ?? []), i])
  return [...groups].map(([kan, list]) => ({ kan, list, total: list.filter(i => !i.deleted).reduce((s, i) => s + i.amount, 0) }))
})
const kanNames = computed(() => kans.value.map(k => k.kan).filter(Boolean))
const canChange = (i: BudgetItemView) => editable.value && (reviewer.value
  || (phase.value === 'collecting' && i.status !== 'submitted')
  || (phase.value === 'reviewing' && (i.status === 'returned' || i.status === 'draft')))
/** 提出できる件数（未提出・要修正。集約終了の間は0） */
const toSubmit = computed(() => (phase.value === 'closed' ? 0 : summary.value.draft + summary.value.returned))

const editing = ref<number | 'new' | null>(null)
const newKan = ref('')
const pending = ref(false)
const errors = ref<string[]>([])
const message = ref('')

async function run(task: () => Promise<unknown>, done = '') {
  pending.value = true
  errors.value = []
  message.value = ''
  try {
    await task()
    editing.value = null
    message.value = done
    await refresh()
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}
const save = (value: BudgetItemInput) => run(() => editing.value === 'new'
  ? $fetch(`/api/budget/teams/${teamId}/items`, { method: 'POST', body: value })
  : $fetch(`/api/budget/items/${editing.value}`, { method: 'PATCH', body: value }), '保存しました。提出するまで査定には回りません。')
function remove(i: BudgetItemView) {
  const text = i.baseItemId == null ? 'この明細を消します。' : 'この明細に「削除」の印を付けます（査定で承認されると、確定したときに予算から消えます）。'
  if (confirm(`${itemName(i)}\n${text}よろしいですか？`)) run(() => $fetch(`/api/budget/items/${i.id}`, { method: 'DELETE' }))
}
const restore = (i: BudgetItemView) => run(() => $fetch(`/api/budget/items/${i.id}/restore`, { method: 'POST' }))
function submit() {
  if (confirm(`未提出・要修正の明細${toSubmit.value}件を提出します。提出すると、査定が終わるまで直せません。よろしいですか？`)) {
    run(() => $fetch(`/api/budget/teams/${teamId}/submit`, { method: 'POST' }), '提出しました。財務管理部の査定を待ってください。')
  }
}
function addTo(kan: string) {
  newKan.value = kan
  editing.value = 'new'
}
</script>

<template>
  <section>
    <p><NuxtLink to="/budget/collect">← 集約</NuxtLink></p>
    <template v-if="team && view">
      <h1>{{ team.bureau }} ／ {{ team.team }}</h1>
      <p class="hint">
        {{ view.round.term }} {{ view.round.kind }}（{{ PHASE_LABELS[phase] }}）・入力する人 {{ team.members.length ? `${team.members.length}人` : '未割り当て' }}
      </p>

      <div class="card head">
        <p>
          合計 <strong>{{ formatYen(summary.total) }}</strong>（もとの予算 {{ formatYen(summary.base) }}）・
          未提出 {{ summary.draft }} ／ 要修正 {{ summary.returned }} ／ 査定待ち {{ summary.submitted }} ／ 承認済み {{ summary.approved }}
        </p>
        <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="editable && (toSubmit || canAdd)" class="buttons">
          <button v-if="phase !== 'closed'" :disabled="pending || !toSubmit" @click="submit">提出（{{ toSubmit }}件）</button>
          <button v-if="canAdd" class="secondary" :disabled="pending" @click="addTo('')">明細の追加</button>
        </div>
        <p v-if="editable && !reviewer && phase === 'closed'" class="hint">集約は終了しました。査定が始まると、要修正になった明細だけ直して出し直せます。</p>
        <p v-if="editable && !reviewer && phase === 'reviewing'" class="hint">査定中です。要修正になった明細だけ直して出し直せます。</p>
        <p v-if="!editable && open" class="hint">この担当の明細は見るだけです（入力できるのは、この担当に割り当てられた人と財務管理部です）。</p>
      </div>

      <BudgetItemForm
        v-if="editing === 'new'" :initial="{ kan: newKan }" :kans="kanNames" submit-label="追加"
        :pending="pending" :errors="errors" @submit="save" @cancel="editing = null"
      />

      <div v-for="k in kans" :key="k.kan" class="kan">
        <div class="kan-head">
          <h2>{{ k.kan || '（款なし）' }}</h2>
          <span class="muted">{{ formatYen(k.total) }}</span>
          <button v-if="canAdd" class="link" @click="addTo(k.kan)">この款に追加</button>
        </div>
        <div class="table-wrap">
          <table class="items">
            <thead>
              <tr><th>項目番号</th><th>項 / 目 / 節</th><th>数量</th><th>単価</th><th>金額</th><th>もとの予算から</th><th>取引先</th><th>状態</th><th /></tr>
            </thead>
            <tbody>
              <template v-for="i in k.list" :key="i.id">
                <tr :class="{ deleted: i.deleted }">
                  <td class="no">{{ i.number }}</td>
                  <td>{{ itemName(i) }}<small v-if="i.spec" class="muted spec">{{ i.spec }}</small></td>
                  <td>{{ i.quantity }}</td>
                  <td class="num">{{ formatYen(i.unitPrice) }}</td>
                  <td class="num">{{ formatYen(i.amount) }}</td>
                  <td class="num change" :class="changeOf(i).kind">{{ changeOf(i).label }}</td>
                  <td>{{ i.vendor }}</td>
                  <td>
                    <span class="status" :class="i.status">{{ itemStatusLabel(i) }}</span>
                    <small v-if="i.reviewComment && i.status !== 'approved'" class="comment">{{ i.reviewComment }}</small>
                  </td>
                  <td class="actions">
                    <template v-if="canChange(i)">
                      <button v-if="!i.deleted" class="link" @click="editing = i.id">修正</button>
                      <button v-if="!i.deleted" class="link" @click="remove(i)">削除</button>
                      <button v-else class="link" @click="restore(i)">削除の取り消し</button>
                    </template>
                  </td>
                </tr>
                <tr v-if="editing === i.id">
                  <td colspan="9">
                    <BudgetItemForm
                      :initial="i" :kans="kanNames" submit-label="保存" :pending="pending" :errors="errors"
                      @submit="save" @cancel="editing = null"
                    />
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </div>
      <p v-if="!items.length" class="hint">まだ明細がありません。</p>
    </template>
    <p v-else>担当が見つかりません。</p>
  </section>
</template>

<style scoped>
.card { max-width: none; margin-bottom: 1rem; display: grid; gap: .5rem; }
.head p { margin: 0; }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
.kan { margin: 1.4rem 0; }
.kan-head { display: flex; align-items: baseline; gap: .8rem; }
.kan-head h2 { font-size: 1.05rem; margin: 0 0 .4rem; }
.table-wrap { overflow-x: auto; }
.items { border-collapse: collapse; width: 100%; min-width: 52rem; background: var(--surface); }
.items th, .items td { padding: .4rem .55rem; border-bottom: 1px solid var(--border); text-align: left; font-size: .88rem; vertical-align: top; }
.items .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.items .no { white-space: nowrap; font-variant-numeric: tabular-nums; }
.spec, .comment { display: block; font-size: .78rem; }
.comment { color: var(--danger); }
.change.plus { color: var(--danger); }
.change.minus { color: var(--done); }
.change.same { color: var(--muted); }
.status { white-space: nowrap; font-size: .82rem; }
.status.draft { color: var(--muted); }
.status.returned { color: var(--danger); font-weight: 600; }
.status.submitted { color: #9a6b00; font-weight: 600; }
.status.approved { color: var(--done); }
.deleted td { text-decoration: line-through; color: var(--muted); }
.deleted td.actions { text-decoration: none; }
.actions { white-space: nowrap; }
.actions .link + .link { margin-left: .6rem; }
.ok { color: var(--done); }
</style>
