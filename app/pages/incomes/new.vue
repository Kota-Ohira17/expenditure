<script setup lang="ts">
/**
 * 収入の記録。入ってきたお金（協賛金・売上など）を記録する。支出の執行依頼にあたる。
 * 収入の予算明細（項目番号が in から始まる）から1つ選ぶか、予算にない収入として款〜節と項目番号を書く。
 * 予算にない収入の項目番号は、局・担当・款を入れると候補が入る（手で直したらそれ以降は上書きしない）。
 */
import { INCOME_METHODS, bureauCodeOf } from '#shared/constants'

const { user } = useUserSession()
const { submit, errors, pending } = useSubmit<{ seq: string }>('/api/incomes')
const { data: lines } = await useIncomeLines()

const form = reactive({
  applicantName: user.value?.name ?? '',
  department: '',
  inCharge: '',
  budgetLineKey: '',
  itemNumber: '',
  budgetPath: { kan: '', kou: '', moku: '', setsu: '' },
  itemName: '',
  amount: '',
  receivedOn: '',
  payer: '',
  method: '',
  remark: '',
})
const file = ref<File | null>(null)
const manual = ref(false)
const useManual = computed(() => manual.value || !lines.value.length)
const nameEdited = ref(false)
const numberEdited = ref(false)
const done = ref('')

/** 明細を選んだら、収入項目名と（空なら）局・担当を入れる */
watch(() => form.budgetLineKey, (key) => {
  const line = lines.value.find(l => l.key === key)
  if (!line) return
  if (!nameEdited.value) form.itemName = line.label
  if (!form.department) form.department = bureauCodeOf(line.bureau)
  if (!form.inCharge) form.inCharge = line.team
})
/** 予算にない収入：款〜節から収入項目名を作り、局・担当・款から項目番号の候補を取る */
watch(() => form.budgetPath, (p) => {
  if (useManual.value && !nameEdited.value) form.itemName = [p.kou || p.kan, p.moku, p.setsu].filter(Boolean).join(' / ')
}, { deep: true })
watch(() => [useManual.value, form.department, form.inCharge, form.budgetPath.kan] as const, async ([m, bureau, team, kan]) => {
  if (!m || numberEdited.value || !bureau || !team.trim()) return
  try {
    const { itemNumber } = await $fetch<{ itemNumber: string }>('/api/budget/next-number', { query: { bureau, team, kan, flow: 'income' } })
    if (!numberEdited.value && itemNumber) form.itemNumber = itemNumber
  }
  catch { /* 候補が出せなくても手で入れられる */ }
})
watch(useManual, (m) => {
  if (m) form.budgetLineKey = ''
  else {
    form.itemNumber = ''
    form.budgetPath = { kan: '', kou: '', moku: '', setsu: '' }
    numberEdited.value = false
  }
})

const lineLabel = (l: (typeof lines.value)[number]) => `${l.itemNumber}　${l.bureau}／${l.team}　${l.kan} ／ ${l.label}（予算 ${formatYen(l.budgetAmount)}）`

async function onSubmit() {
  const result = await submit({
    ...form,
    budgetLineKey: useManual.value ? '' : form.budgetLineKey,
    itemNumber: useManual.value ? form.itemNumber : '',
  }, file.value)
  if (result) done.value = result.seq
}
</script>

<template>
  <section class="page">
    <h1>収入の記録</h1>

    <div v-if="done" class="success">
      <p>記録しました（番号 {{ done }}）。財務局長・管理者が入金を確かめると、確認済みになります。</p>
      <NuxtLink to="/incomes">収入台帳へ</NuxtLink>
    </div>

    <form v-else @submit.prevent="onSubmit">
      <p class="intro">協賛金・売上など、入ってきたお金を記録するフォームです。収入の予算（項目番号が in から始まるもの）から項目を選んでください。</p>
      <fieldset>
        <legend>収入の記録</legend>
        <label><span>記録する人の氏名<span class="req">*</span></span><input v-model="form.applicantName" class="w-m" required></label>
        <div class="row">
          <BureauField v-model="form.department" all />
          <label><span>担当名<span class="req">*</span></span><input v-model="form.inCharge" required></label>
        </div>

        <div class="block">
          <span class="block-label">収入項目<span class="req">*</span></span>
          <template v-if="useManual">
            <p v-if="!lines.length" class="hint">収入の予算がまだないので、項目を手入力してください。</p>
            <div class="path">
              <label><span>款<span class="req">*</span></span><input v-model="form.budgetPath.kan" required></label>
              <label>項<input v-model="form.budgetPath.kou"></label>
              <label>目<input v-model="form.budgetPath.moku"></label>
              <label>節<input v-model="form.budgetPath.setsu"></label>
            </div>
            <label>項目番号
              <span class="hint">局・担当・款を入れると、収入の番号の付け方で候補が入ります（in から始まる番号）。必要なら書き換えてください。</span>
              <input v-model="form.itemNumber" placeholder="in01-01-01" required @input="numberEdited = true">
            </label>
          </template>
          <label v-else>収入の予算
            <select v-model="form.budgetLineKey" required>
              <option value="" disabled>選択</option>
              <option v-for="l in lines" :key="l.key" :value="l.key">{{ lineLabel(l) }}</option>
            </select>
          </label>
          <button v-if="lines.length" type="button" class="link" @click="manual = !manual">{{ manual ? '予算から選ぶ' : '予算にない収入を手入力する' }}</button>
          <label><span>収入項目名<span class="req">*</span></span><input v-model="form.itemName" required @input="nameEdited = true"></label>
        </div>

        <div class="row">
          <label><span>金額（円）<span class="req">*</span></span><YenInput v-model="form.amount" required /></label>
          <label><span>入金日<span class="req">*</span></span><input v-model="form.receivedOn" type="date" required></label>
        </div>
        <label>相手先<span class="hint">協賛企業・購入者など</span><input v-model="form.payer"></label>
        <RadioWithOther v-model="form.method" label="受け取り方" :options="INCOME_METHODS" required />
        <label>備考<textarea v-model="form.remark" rows="3" /></label>
        <label>証憑（入金の明細など）<span class="hint">PDF・JPEG・PNG、4MBまで。あとから収入台帳で付けることもできます。</span>
          <input type="file" accept=".pdf,image/*" @change="file = ($event.target as HTMLInputElement).files?.[0] ?? null">
        </label>
      </fieldset>
      <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
      <button type="submit" :disabled="pending">{{ pending ? '送信中…' : '記録' }}</button>
    </form>
  </section>
</template>

<style scoped>
.block { display: grid; gap: .6rem; }
.path { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .5rem; }
.req { color: var(--danger); margin-left: .15rem; }
</style>
