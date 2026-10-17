<script setup lang="ts">
/**
 * 執行項目の入力欄（執行依頼で使う）。
 * 予算明細から複数選ぶのが基本で、予算にない項目は項目番号を手入力できる。
 * 支出項目名は選んだ明細から自動で入れる（手で直したらそれ以降は上書きしない）。
 * 明細ごとの実際の執行額は v-model:amounts（明細の key → 円）。
 */
const keys = defineModel<string[]>('keys', { required: true })
const amounts = defineModel<Record<string, number | ''>>('amounts', { required: true })
const quantities = defineModel<Record<string, string>>('quantities', { required: true })
const vendors = defineModel<Record<string, string>>('vendors', { required: true })
const itemNumber = defineModel<string>('itemNumber', { required: true })
const itemName = defineModel<string>('itemName', { required: true })
defineProps<{
  itemNameLabel: string
  /** 予算表で最初に開く局（フォームで選んだ局の略称） */
  preferredBureau?: string
}>()

const { data: lines } = await useBudgetLines()
const manual = ref(false)
const nameEdited = ref(false)

const hasBudget = computed(() => lines.value.length > 0)
const useManual = computed(() => manual.value || !hasBudget.value)

watch(keys, (k) => {
  if (nameEdited.value) return
  const byKey = new Map(lines.value.map(l => [l.key, l]))
  itemName.value = itemNameFromLines(k.map(key => byKey.get(key)).filter(l => l != null), lines.value)
})

watch(useManual, (m) => {
  // 切り替えたらもう一方の入力は送らない
  if (m) {
    keys.value = []
    amounts.value = {}
    quantities.value = {}
    vendors.value = {}
  }
  else itemNumber.value = ''
})
</script>

<template>
  <div class="items">
    <template v-if="useManual">
      <p v-if="!hasBudget" class="hint">予算がまだ取り込まれていないので、項目番号を手入力してください。</p>
      <label>項目番号
        <span class="hint">項目番号は「out-AA-BB（-CC）」の形式で表されます。款でまとめて申請を行う場合はCCを含めなくて大丈夫です。outも含めてすべて半角で入力してください。</span>
        <input v-model="itemNumber" placeholder="out-03-02-06" required>
      </label>
    </template>
    <BudgetPicker
      v-else
      v-model="keys"
      v-model:amounts="amounts"
      v-model:quantities="quantities"
      v-model:vendors="vendors"
      :preferred-bureau="preferredBureau"
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
</style>
