<script setup lang="ts">
/**
 * Google フォームの「ラジオボタン＋その他（自由記述）」と同じ入力欄。
 * 選択肢にない値が入っていれば「その他」として扱う。
 */
const model = defineModel<string>({ required: true })
const props = defineProps<{
  label: string
  options: readonly string[]
  /** 「その他」を出すか */
  other?: boolean
  required?: boolean
  hint?: string
}>()

const name = useId()
const otherOn = ref(model.value !== '' && !props.options.includes(model.value))
const otherText = ref(otherOn.value ? model.value : '')

function pick(option: string) {
  otherOn.value = false
  model.value = option
}
function pickOther() {
  otherOn.value = true
  model.value = otherText.value
}
watch(otherText, (t) => {
  if (otherOn.value) model.value = t
})
// 外から値が入ったとき（表から推測した初期値など）も、選択肢か「その他」かを合わせる
watch(model, (v) => {
  if (props.options.includes(v)) otherOn.value = false
  else if (v === '' && otherText.value !== '') {
    otherOn.value = false
    otherText.value = ''
  }
  else if (v !== '' && props.other) {
    otherOn.value = true
    otherText.value = v
  }
})
</script>

<template>
  <fieldset class="radio-group">
    <legend>{{ label }}<span v-if="required" class="req">*</span></legend>
    <p v-if="hint" class="hint">{{ hint }}</p>
    <label v-for="o in options" :key="o" class="radio">
      <input type="radio" :name="name" :checked="!otherOn && model === o" :required="required" @change="pick(o)">
      {{ o }}
    </label>
    <label v-if="other" class="radio other">
      <input type="radio" :name="name" :checked="otherOn" @change="pickOther">
      その他:
      <input
        v-model="otherText"
        class="other-text"
        :required="required && otherOn"
        :aria-label="`${label}（その他）`"
        @focus="pickOther"
      >
    </label>
  </fieldset>
</template>

<style scoped>
.radio-group { border: none; padding: 0; margin: 0; display: grid; gap: .3rem; }
/* 枠の見出し（legend の太字・背景）ではなく、ほかの入力欄の名前と同じ見た目にする */
.radio-group legend { font-size: .9rem; font-weight: 400; padding: 0; margin-bottom: .2rem; background: none; border-radius: 0; }
.radio { display: flex; align-items: center; gap: .5rem; font-size: .92rem; }
.radio input[type="radio"] { width: auto; margin: 0; }
.other-text { flex: 1; max-width: 22rem; padding: .25rem .5rem; }
.req { color: var(--danger); margin-left: .15rem; }
</style>
