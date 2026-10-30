<script setup lang="ts">
/**
 * 局ごとのタブ（集約・査定の一番上）。選んだ局だけに絞る。「すべて」は '' 。
 * 局が多いときは横にスクロールする。
 */
defineProps<{ tabs: { key: string, label: string, count: number }[] }>()
const model = defineModel<string>({ required: true })
</script>

<template>
  <div class="bureau-tabs" role="tablist" aria-label="局">
    <button
      v-for="t in tabs" :key="t.key" role="tab" class="tab" :class="{ on: model === t.key }"
      :aria-selected="model === t.key" @click="model = t.key"
    >
      {{ t.label }}<span class="n">{{ t.count }}</span>
    </button>
  </div>
</template>

<style scoped>
.bureau-tabs { display: flex; gap: .2rem; overflow-x: auto; border-bottom: 1px solid var(--border); margin: .8rem 0 1rem; scrollbar-width: thin; }
.tab { flex: none; display: inline-flex; align-items: center; gap: .35rem; padding: .55rem .9rem; border: none; border-bottom: 3px solid transparent; border-radius: 6px 6px 0 0; background: none; color: var(--muted); font-size: .9rem; white-space: nowrap; }
.tab:hover:not(:disabled) { background: var(--accent-bg); color: var(--text); }
.tab.on { color: var(--text); font-weight: 700; border-bottom-color: var(--text); }
.n { font-size: .72rem; font-weight: 600; padding: 0 .4rem; border-radius: 999px; background: var(--accent-bg); color: var(--text); }
.tab.on .n { background: var(--text); color: var(--surface); }
</style>
