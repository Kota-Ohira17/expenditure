<script setup lang="ts">
/**
 * 担当ごとのまとまり（集約・査定で使う）。枠で囲み、見出しの帯に局・担当名と、右側に件数・合計などを出す。
 * 見出しの帯（または左の ⌄）を押すと開け閉めできる。中身は開いているときだけ描く。
 */
defineProps<{
  bureau: string
  team: string
  /** 担当名のリンク先 */
  to?: string
  open: boolean
}>()
const emit = defineEmits<{ toggle: [] }>()
</script>

<template>
  <section class="group" :class="{ folded: !open }">
    <header class="group-head" @click="emit('toggle')">
      <button class="fold" :aria-expanded="open" :aria-label="open ? '折りたたむ' : '開く'" @click.stop="emit('toggle')">
        <AppIcon name="chevron-down" />
      </button>
      <div class="group-name">
        <span class="group-bureau">{{ bureau }}</span>
        <h2>
          <NuxtLink v-if="to" :to="to" @click.stop>{{ team }}</NuxtLink>
          <template v-else>{{ team }}</template>
        </h2>
      </div>
      <div class="group-stats"><slot name="stats" /></div>
      <!-- ボタンなど：押しても開け閉めしない -->
      <div v-if="$slots.actions" class="group-actions" @click.stop><slot name="actions" /></div>
    </header>
    <div v-if="open" class="group-body"><slot /></div>
  </section>
</template>

<style scoped>
.group { margin: 0 0 .8rem; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); overflow: hidden; }
.group-head { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1.2rem; padding: .6rem 1rem .6rem .6rem; background: var(--accent-bg); border-left: 5px solid var(--accent); cursor: pointer; user-select: none; }
.group:not(.folded) .group-head { border-bottom: 1px solid var(--border); }
.group-head:hover { background: var(--accent-bg-hover); }
.fold { display: inline-grid; place-items: center; width: 1.9rem; height: 1.9rem; padding: 0; border: none; border-radius: 6px; background: transparent; color: var(--text); }
.fold:hover:not(:disabled) { background: rgb(0 0 0 / 6%); }
.fold :deep(.app-icon) { transition: transform .15s; }
.group.folded .fold :deep(.app-icon) { transform: rotate(-90deg); }
.group-name { display: grid; flex: 1 1 12rem; }
.group-bureau { font-size: .76rem; color: var(--muted); }
.group-head h2 { font-size: 1.05rem; margin: 0; }
.group-head h2 a { color: inherit; }
.group-stats { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem 1rem; font-size: .85rem; color: var(--muted); }
.group-stats :deep(strong) { color: var(--text); }
.group-actions { cursor: default; }
.group-body { padding: .8rem; }
</style>
