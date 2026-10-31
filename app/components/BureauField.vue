<script setup lang="ts">
/**
 * 局の選択欄。選択肢は取り込んだ予算に出てくる局から作る（予算が変わって局が増減しても合うように）。
 * 略称が分かる局は「ZAI（財務局）」のように出し、値は略称。略称のない局は局名を値にする。
 * 予算をまだ取り込んでいないときは、Google フォームと同じ略称の一覧を出す。
 * all（予算前執行）のときは、どの局も出す可能性があるので、予算の局で絞らずすべての局を出す。
 */
import { BUREAUS, bureauCodeOf, bureauLabelOf } from '#shared/constants'

const props = defineProps<{ all?: boolean }>()
const bureau = defineModel<string>({ required: true })
const { data: lines } = await useBudgetLines()

const options = computed(() => {
  const names = [...new Set(lines.value.map(l => l.bureau).filter(Boolean))]
  const values = props.all
    ? [...new Set([...BUREAUS.map(b => b.code), ...names.map(bureauCodeOf)])]
    : names.length ? names.map(bureauCodeOf) : BUREAUS.map(b => b.code)
  // 以前の申請などで、今の予算にない局が入っているときも表示できるようにする
  if (bureau.value && !values.includes(bureau.value)) values.push(bureau.value)
  return values.map(value => ({ value, label: bureauLabelOf(value) }))
})
</script>

<template>
  <label><span>局<span class="req">*</span></span>
    <select v-model="bureau" required>
      <option value="" disabled>選択</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
  </label>
</template>

<style scoped>
.req { color: var(--danger); margin-left: .15rem; }
</style>
