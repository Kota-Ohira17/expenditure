<script setup lang="ts">
/**
 * 執行項目の入力欄（執行依頼で使う）。
 * 予算明細から複数選ぶのが基本で、予算にない項目は款・項・目・節と項目番号を手入力できる。
 * 予算にない項目の項目番号は、局・担当・款を入れると予算の番号の付け方で候補を出す（手で直したらそれ以降は上書きしない）。
 * 支出項目名は選んだ明細から自動で入れる（手で直したらそれ以降は上書きしない）。
 * 明細ごとの実際の執行額は v-model:amounts（明細の key → 円）。
 */
const keys = defineModel<string[]>('keys', { required: true })
const amounts = defineModel<Record<string, number | ''>>('amounts', { required: true })
const quantities = defineModel<Record<string, string>>('quantities', { required: true })
const vendors = defineModel<Record<string, string>>('vendors', { required: true })
const itemNumber = defineModel<string>('itemNumber', { required: true })
const itemName = defineModel<string>('itemName', { required: true })
const path = defineModel<{ kan: string, kou: string, moku: string, setsu: string }>('path', { required: true })
const props = defineProps<{
  /** フォームで選んだ局の略称と、書いた担当名（項目番号の候補に使う） */
  bureau: string
  team: string
  itemNameLabel: string
}>()

const { data: lines } = await useBudgetLines()
const manual = ref(false)
const nameEdited = ref(false)
const numberEdited = ref(false)

const hasBudget = computed(() => lines.value.length > 0)
const useManual = computed(() => manual.value || !hasBudget.value)

watch(keys, (k) => {
  if (nameEdited.value) return
  const byKey = new Map(lines.value.map(l => [l.key, l]))
  itemName.value = itemNameFromLines(k.map(key => byKey.get(key)).filter(l => l != null), lines.value)
})

/** 予算にない項目：局・担当・款が変わったら項目番号の候補を取り直す */
watch(() => [useManual.value, props.bureau, props.team, path.value.kan] as const, async ([m, bureau, team, kan]) => {
  if (!m || numberEdited.value || !bureau || !team.trim()) return
  try {
    const { itemNumber: next } = await $fetch<{ itemNumber: string }>('/api/budget/next-number', { query: { bureau, team, kan } })
    if (!numberEdited.value && next) itemNumber.value = next
  }
  catch { /* 候補が出せなくても手で入れられる */ }
}, { immediate: true })
/** 予算にない項目：支出項目名は款・項・目・節から作る（手で直したらそれ以降は上書きしない） */
watch(path, (p) => {
  if (!useManual.value || nameEdited.value) return
  itemName.value = [p.kou || p.kan, p.moku, p.setsu].filter(Boolean).join(' / ')
}, { deep: true })

watch(useManual, (m) => {
  // 切り替えたらもう一方の入力は送らない
  if (m) {
    keys.value = []
    amounts.value = {}
    quantities.value = {}
    vendors.value = {}
  }
  else {
    itemNumber.value = ''
    path.value = { kan: '', kou: '', moku: '', setsu: '' }
    numberEdited.value = false
  }
})
</script>

<template>
  <div class="items">
    <template v-if="useManual">
      <p v-if="!hasBudget" class="hint">予算がまだ取り込まれていないので、項目番号を手入力してください。</p>
      <!-- 明細を選ばないときだけ必要な入力（局・担当） -->
      <slot name="manual" />
      <div class="path">
        <label><span>款<span class="req">*</span></span><input v-model="path.kan" required></label>
        <label>項<input v-model="path.kou"></label>
        <label>目<input v-model="path.moku"></label>
        <label>節<input v-model="path.setsu"></label>
      </div>
      <label>項目番号
        <span class="hint">局・担当・款を入れると、予算の番号の付け方で候補が入ります（同じ担当・同じ款があればその款の続きの番号、なければその局の新しい款の番号）。必要なら書き換えてください。</span>
        <input v-model="itemNumber" placeholder="out01-03-02" required @input="numberEdited = true">
      </label>
    </template>
    <BudgetPicker
      v-else
      v-model="keys"
      v-model:amounts="amounts"
      v-model:quantities="quantities"
      v-model:vendors="vendors"
    />

    <button v-if="hasBudget" type="button" class="link" @click="manual = !manual">
      {{ manual ? '予算から選ぶ' : '予算にない項目を手入力する' }}
    </button>

    <label>{{ itemNameLabel }}
      <input v-model="itemName" required @input="nameEdited = true">
    </label>
    <p v-if="!useManual" class="hint">明細を選ぶと自動で入ります。必要なら書き換えてください。</p>
  </div>
</template>

<style scoped>
.items { display: grid; gap: .75rem; }
.path { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .5rem; }
.req { color: var(--danger); margin-left: .15rem; }
</style>
