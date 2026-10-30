<script setup lang="ts">
/**
 * 予算の明細を足す・直すフォーム（担当の画面）。款は今ある款から選ぶか、新しい名前を入れる。
 * 数量が数で単価が入っていれば、金額は「数量 × 単価」を初めに入れる（直してもよい）。
 */
import type { BudgetItemInput } from '#shared/schemas'

const props = defineProps<{
  /** 直すときの今の値（足すときは空） */
  initial?: Partial<BudgetItemInput>
  /** この担当の款の名前（選択肢） */
  kans: string[]
  submitLabel: string
  pending?: boolean
  errors?: string[]
}>()
const emit = defineEmits<{ submit: [value: BudgetItemInput], cancel: [] }>()

const text = (v: unknown) => (v == null ? '' : String(v))
const form = reactive({
  kan: text(props.initial?.kan),
  kou: text(props.initial?.kou),
  moku: text(props.initial?.moku),
  setsu: text(props.initial?.setsu),
  quantity: text(props.initial?.quantity),
  unitPrice: text(props.initial?.unitPrice),
  amount: text(props.initial?.amount),
  vendor: text(props.initial?.vendor),
  spec: text(props.initial?.spec),
  link: text(props.initial?.link),
  plannedTiming: text(props.initial?.plannedTiming),
  remark: text(props.initial?.remark),
  isNew: props.initial?.isNew ?? false,
  preExecution: props.initial?.preExecution ?? false,
})

// 数量 × 単価 を金額に入れる（金額を自分で書き換えたら、それ以降は入れない）
const autoAmount = ref(!form.amount)
watch(() => [form.quantity, form.unitPrice], () => {
  const q = Number(form.quantity.normalize('NFKC'))
  const u = Number(form.unitPrice)
  if (autoAmount.value && form.unitPrice !== '' && Number.isFinite(q) && form.quantity !== '' && Number.isFinite(u)) form.amount = String(q * u)
})
const listId = useId()

function onSubmit() {
  emit('submit', { ...form, unitPrice: form.unitPrice === '' ? null : Number(form.unitPrice), amount: Number(form.amount) })
}
</script>

<template>
  <form class="item-form" @submit.prevent="onSubmit">
    <div class="names">
      <label><span>款<span class="req">*</span></span>
        <input v-model.trim="form.kan" :list="listId" required>
        <datalist :id="listId"><option v-for="k in kans" :key="k" :value="k" /></datalist>
      </label>
      <label>項<input v-model.trim="form.kou"></label>
      <label>目<input v-model.trim="form.moku"></label>
      <label>節<input v-model.trim="form.setsu"></label>
    </div>
    <p class="hint">項・目・節は、どれか1つ以上に名前を入れてください。</p>
    <div class="numbers">
      <label>数量<input v-model.trim="form.quantity" class="w-s"></label>
      <label>単価（円）<YenInput v-model="form.unitPrice" class="w-s" /></label>
      <label><span>金額（円）<span class="req">*</span></span><YenInput v-model="form.amount" class="w-s" required @input="autoAmount = false" /></label>
      <label>取引先<input v-model.trim="form.vendor"></label>
    </div>
    <div class="numbers">
      <label>仕様・詳細<input v-model.trim="form.spec"></label>
      <label>執行予定時期<input v-model.trim="form.plannedTiming" class="w-s"></label>
      <label>リンク<input v-model.trim="form.link" type="url"></label>
    </div>
    <label>備考<textarea v-model.trim="form.remark" rows="2" /></label>
    <div class="checks">
      <label class="check"><input v-model="form.isNew" type="checkbox"> 新規</label>
      <label class="check"><input v-model="form.preExecution" type="checkbox"> 予算前執行</label>
    </div>
    <ul v-if="errors?.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
    <div class="buttons">
      <button type="submit" :disabled="pending">{{ pending ? '保存中…' : submitLabel }}</button>
      <button type="button" class="secondary" @click="emit('cancel')">キャンセル</button>
    </div>
  </form>
</template>

<style scoped>
.item-form { display: grid; gap: .6rem; padding: .9rem 1rem; border: 1px dashed var(--accent); border-radius: 8px; background: var(--surface); }
.names, .numbers { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: .5rem .9rem; }
.checks, .buttons { display: flex; flex-wrap: wrap; gap: .5rem 1.2rem; }
.w-s { max-width: 9rem; }
</style>
