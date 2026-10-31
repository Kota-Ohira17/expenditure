<script setup lang="ts">
/**
 * 担当の予算の明細。その担当の人（と財務管理部）は、明細を直す・足す・消すことができ、終わったら提出する。
 * 担当の人が直せるのは、集約中は査定待ち以外、査定中は要修正の明細だけ。集約終了のあとは直せない（財務管理部は確定までいつでも）。
 * 本予算は空から作り、「昨年の本予算・決算（参考）」（財務管理部が取り込んだもの）から明細をコピーできる（1件・款ごと・すべて）。
 * 補正予算で写してきた明細を消すと「削除」の印が付き、査定で承認されると確定したときに予算から消える。
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
/** 折りたたんだ款（見出しを押すと開け閉めできる） */
const folded = reactive(new Set<string>())
const toggle = (kan: string) => (folded.has(kan) ? folded.delete(kan) : folded.add(kan))

/** 昨年の本予算・決算（財務管理部が取り込んだもの。本予算の集約のときの参考。1件・款ごと・すべてをコピーできる） */
const { data: reference, refresh: refreshReference } = await useFetch(`/api/budget/teams/${teamId}/reference`)
type RefItem = NonNullable<NonNullable<typeof reference.value>>['items'][number]
const refFile = (kind: 'budget' | 'settlement') => reference.value?.files.find(f => f.kind === kind)
/** 款ごとにまとめる。予算外の決算は最後に1つにまとめる */
const refKans = computed(() => {
  const groups = new Map<string, RefItem[]>()
  for (const i of reference.value?.items ?? []) {
    const key = i.outside ? '\u0000' : i.kan
    groups.set(key, [...(groups.get(key) ?? []), i])
  }
  return [...groups].map(([key, list]) => ({
    key,
    kan: key === '\u0000' ? '予算外の決算' : key,
    list,
    budget: list.reduce((s, i) => s + (i.budget ?? 0), 0),
    actual: list.reduce((s, i) => s + (i.actual ?? 0), 0),
  }))
})
const refTotal = computed(() => refKans.value.reduce((s, k) => ({ budget: s.budget + k.budget, actual: s.actual + k.actual }), { budget: 0, actual: 0 }))
const notCopied = (list: RefItem[]) => list.filter(i => !i.copied).map(i => i.id)
/** はじめは、まだ明細がないときだけ開いておく */
const refOpen = ref(items.value.length === 0)
const copy = (ids: number[]) => run(() => $fetch(`/api/budget/teams/${teamId}/copy`, { method: 'POST', body: { ids } }), `${ids.length}件コピーしました。直してから提出してください。`)
const canChange = (i: BudgetItemView) => editable.value && (reviewer.value
  || (phase.value === 'collecting' && i.status !== 'submitted')
  || (phase.value === 'reviewing' && (i.status === 'returned' || i.status === 'draft')))
/** 提出できる件数（未提出・要修正。集約終了の間は0） */
const toSubmit = computed(() => (phase.value === 'closed' ? 0 : summary.value.draft + summary.value.returned))

const editing = ref<string | 'new' | null>(null)
/** ⑤のやり取りを開いている項目 */
const historyOpen = reactive(new Set<string>())
const toggleHistory = (id: string) => (historyOpen.has(id) ? historyOpen.delete(id) : historyOpen.add(id))
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
    await Promise.all([refresh(), reference.value && refreshReference()])
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
  const text = i.baseItemId == null || view.value?.round.kind === '本予算' ? 'この明細を消します。' : 'この明細に「削除」の印を付けます（査定で承認されると、確定したときに予算から消えます）。'
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
          合計 <strong>{{ formatYen(summary.total) }}</strong>（{{ view.round.kind === '本予算' ? `昨年の予算 ${formatYen(refTotal.budget)}` : `もとの予算 ${formatYen(summary.base)}` }}）・
          未提出 {{ summary.draft }} ／ 要修正 {{ summary.returned }} ／ 査定待ち {{ summary.submitted }} ／ 承認済み {{ summary.approved }}
        </p>
        <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        <p v-if="message" class="ok">{{ message }}</p>
        <div v-if="editable && toSubmit && phase !== 'closed'" class="buttons">
          <button :disabled="pending" @click="submit">今年の明細を提出（{{ toSubmit }}件）</button>
        </div>
        <p v-if="editable && !reviewer && phase === 'closed'" class="hint">集約は終了しました。査定が始まると、要修正になった明細だけ直して出し直せます。</p>
        <p v-if="editable && !reviewer && phase === 'reviewing'" class="hint">査定中です。要修正になった明細だけ直して出し直せます。</p>
        <p v-if="!editable && open" class="hint">この担当の明細は見るだけです（入力できるのは、この担当に割り当てられた人と財務管理部です）。</p>
      </div>

      <section class="mine">
        <header class="mine-head">
          <div class="mine-title">
            <h2>今年の明細（{{ view.round.term }} {{ view.round.kind }}・提出する分）</h2>
            <span class="muted">{{ items.filter(i => !i.deleted).length }}件・合計 {{ formatYen(summary.total) }}</span>
          </div>
          <button v-if="canAdd" class="secondary" :disabled="pending" @click="addTo('')">明細の追加</button>
        </header>
        <BudgetItemForm
          v-if="editing === 'new'" :initial="{ kan: newKan }" :kans="kanNames" submit-label="追加"
          :pending="pending" :errors="errors" @submit="save" @cancel="editing = null"
        />

        <div v-for="k in kans" :key="k.kan" class="kan" :class="{ folded: folded.has(k.kan) }">
          <div class="kan-head">
            <button class="fold" :aria-expanded="!folded.has(k.kan)" :aria-label="folded.has(k.kan) ? '開く' : '折りたたむ'" @click="toggle(k.kan)">
              <AppIcon name="chevron-down" />
            </button>
            <h2 @click="toggle(k.kan)">{{ k.kan || '（款なし）' }}</h2>
            <span class="muted">{{ k.list.length }}件</span>
            <span class="muted">{{ formatYen(k.total) }}</span>
            <button v-if="canAdd" class="link" @click="addTo(k.kan)">この款に追加</button>
          </div>
          <div v-show="!folded.has(k.kan)" class="table-wrap">
            <table class="items">
              <thead>
                <tr><th>項目番号</th><th>項 / 目 / 節</th><th>数量</th><th>単価</th><th>金額</th><th>{{ view.round.kind === '本予算' ? '昨年から' : 'もとの予算から' }}</th><th>取引先</th><th>状態</th><th /></tr>
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
                      <button v-if="i.reviewCount || i.status === 'returned'" class="link" @click="toggleHistory(i.id)">やり取り</button>
                    </td>
                  </tr>
                  <tr v-if="historyOpen.has(i.id)">
                    <td colspan="9">
                      <ReviewHistory :round-id="view.round.id" :item-number="i.itemNumber" :item-id="i.id" :can-reply="editable" @replied="refresh()" />
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
        <p v-if="!items.length" class="hint">まだ明細がありません。「明細の追加」で入れるか、下の昨年の本予算・決算（参考）からコピーしてください。</p>
      </section>

      <section v-if="reference" class="reference" :class="{ folded: !refOpen }">
        <header class="ref-head" @click="refOpen = !refOpen">
          <button class="fold" :aria-expanded="refOpen" :aria-label="refOpen ? '折りたたむ' : '開く'" @click.stop="refOpen = !refOpen">
            <AppIcon name="chevron-down" />
          </button>
          <div class="ref-title">
            <h2>昨年の本予算・決算（参考）</h2>
            <span class="muted">予算 {{ formatYen(refTotal.budget) }} ／ 決算 {{ formatYen(refTotal.actual) }}</span>
          </div>
          <button
            v-if="canAdd && notCopied(reference.items).length" class="secondary" :disabled="pending"
            @click.stop="copy(notCopied(reference.items))"
          >
            すべてコピー（{{ notCopied(reference.items).length }}件）
          </button>
        </header>
        <div v-if="refOpen" class="ref-body">
          <p class="hint">
            財務管理部が取り込んだ昨年の本予算と決算です（本予算：{{ refFile('budget')?.fileName || '未取り込み' }} ／ 決算：{{ refFile('settlement')?.fileName || '未取り込み' }}）。
            使える明細はコピーして、直してから提出してください（コピーしなくても、「明細の追加」で一から入れられます）。決算は項目番号で本予算の明細に合わせています。
          </p>
          <p v-if="!reference.files.length" class="hint">まだ取り込まれていません。財務管理部が「集約」の画面で昨年の本予算・決算を取り込むと、ここに出ます。</p>
          <p v-else-if="!reference.items.length" class="hint">取り込んだ本予算・決算に、この担当（{{ team.bureau }} ／ {{ team.team }}）の明細はありません。</p>
          <div v-for="k in refKans" :key="k.key" class="kan">
            <div class="kan-head">
              <h3>{{ k.kan || '（款なし）' }}</h3>
              <span class="muted">予算 {{ formatYen(k.budget) }} ／ 決算 {{ formatYen(k.actual) }}</span>
              <button v-if="canAdd && notCopied(k.list).length" class="link" :disabled="pending" @click="copy(notCopied(k.list))">この款をコピー</button>
            </div>
            <div class="table-wrap">
              <table class="items ref">
                <thead>
                  <tr><th>項目番号</th><th>項 / 目 / 節</th><th>数量</th><th>予算額</th><th>決算額</th><th>取引先</th><th /></tr>
                </thead>
                <tbody>
                  <tr v-for="i in k.list" :key="i.id">
                    <td class="no">{{ i.itemNumber }}</td>
                    <td>{{ itemName(i) }}<small v-if="i.spec" class="muted spec">{{ i.spec }}</small></td>
                    <td>{{ i.quantity }}</td>
                    <td class="num">{{ i.budget == null ? '—' : formatYen(i.budget) }}</td>
                    <td class="num">{{ i.actual == null ? '（上にまとめて）' : formatYen(i.actual) }}</td>
                    <td>{{ i.vendor }}</td>
                    <td class="actions">
                      <span v-if="i.copied" class="muted">コピー済み</span>
                      <button v-else-if="canAdd" class="link" :disabled="pending" @click="copy([i.id])">コピー</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

    </template>
    <p v-else>担当が見つかりません。</p>
  </section>
</template>

<style scoped>
.card { max-width: none; margin-bottom: 1rem; display: grid; gap: .5rem; }
.head p { margin: 0; }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; }
.kan { margin: 1.4rem 0; }
.kan-head { display: flex; align-items: center; gap: .8rem; margin-bottom: .4rem; }
.kan-head h2 { font-size: 1.05rem; margin: 0; cursor: pointer; user-select: none; }
.fold { display: inline-grid; place-items: center; width: 1.8rem; height: 1.8rem; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--text); }
.fold:hover:not(:disabled) { background: var(--accent-bg); }
.fold :deep(.app-icon) { transition: transform .15s; }
.kan.folded .fold :deep(.app-icon) { transform: rotate(-90deg); }
/* 今年の明細（提出する分）：色の付いた実線の枠で囲み、昨年の参考（点線）と見分ける */
.mine { margin: 1rem 0 1.6rem; padding: .2rem .8rem .8rem; border: 2px solid var(--accent); border-radius: 12px; background: var(--surface); }
.mine-head { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; padding: .5rem 0; border-bottom: 1px solid var(--border); }
.mine-title { flex: 1 1 14rem; display: grid; }
.mine-title h2 { font-size: 1.1rem; margin: 0; color: var(--accent-text); }
.mine-title .muted { font-size: .82rem; }
.mine .kan:first-of-type { margin-top: .8rem; }
/* 昨年の本予算・決算（参考）：本体の明細と見分けられるよう、点線の枠で囲む */
.reference { margin: 1rem 0 1.6rem; border: 1.5px dashed var(--border); border-radius: 12px; background: var(--panel); }
.ref-head { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; padding: .6rem .8rem; cursor: pointer; user-select: none; }
.ref-title { flex: 1 1 14rem; display: grid; }
.ref-title h2 { font-size: 1rem; margin: 0; }
.ref-title .muted { font-size: .82rem; }
.reference.folded .fold :deep(.app-icon) { transform: rotate(-90deg); }
.ref-body { padding: 0 .8rem .8rem; }
.ref-body .kan { margin: .8rem 0; }
.ref-body h3 { font-size: .95rem; margin: 0; }
.items.ref { min-width: 40rem; }
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
