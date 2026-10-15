<script setup lang="ts">
/**
 * 金額の入力欄。上下ボタンの出る type=number ではなく文字入力にして、スマホでは数字キーボードを出す。
 * カンマ・全角数字・「¥」「円」を許し、v-model には半角の数字（読めなければ入力そのまま）を入れる。
 * 読めない入力はブラウザの入力チェックで送信を止める。
 * placeholder・required・@input などはそのまま中の input に渡る。
 */
const model = defineModel<string>({ required: true })
const el = useTemplateRef<HTMLInputElement>('el')
const text = ref(model.value)
const invalid = ref(false)

// 外から値が変わったとき（明細の合計の自動入力など）だけ表示を差し替える
watch(model, (v) => {
  const parsed = parseYenInput(text.value)
  if (parsed === null || String(parsed) !== v) text.value = v
})

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  text.value = raw
  const n = parseYenInput(raw)
  invalid.value = n === null
  el.value?.setCustomValidity(invalid.value ? '数字で入力してください。' : '')
  model.value = n === null ? raw : String(n)
}
</script>

<template>
  <input
    ref="el"
    :value="text"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    :class="{ invalid }"
    :aria-invalid="invalid || undefined"
    @input="onInput"
  >
</template>

<style scoped>
input { font-variant-numeric: tabular-nums; }
input.invalid { border-color: var(--danger); }
</style>
