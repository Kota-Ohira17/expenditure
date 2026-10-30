<script setup lang="ts">
/**
 * 局ごとのタブ（集約・査定の一番上）。選んだ局だけに絞る。「すべて」は '' 。
 * 見た目は執行依頼の予算選択（BudgetPicker）の局タブと同じ。
 */
defineProps<{ tabs: { key: string, label: string, count: number }[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="bureau-tabs" role="tablist" aria-label="局">
    <button
      v-for="t in tabs" :key="t.key" type="button" role="tab"
      :aria-selected="model === t.key" :class="{ active: model === t.key, empty: !t.count }"
      @click="model = t.key"
    >
      {{ t.label }}
      <span class="tab-count">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.bureau-tabs { display: flex; flex-wrap: wrap; gap: .3rem; border-bottom: 2px solid var(--accent); padding-bottom: .4rem; margin: .8rem 0 1rem; }
.bureau-tabs button {
  display: inline-flex; align-items: center; gap: .35rem; padding: .3rem .7rem; font-size: .85rem;
  background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 6px 6px 0 0;
}
.bureau-tabs button.active { background: var(--accent-bg); color: var(--accent-text); border-color: var(--accent); font-weight: 700; }
.bureau-tabs button.empty:not(.active) { opacity: .5; }
.tab-count { font-size: .72rem; opacity: .75; font-variant-numeric: tabular-nums; }
</style>
