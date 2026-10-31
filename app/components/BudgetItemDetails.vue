<script setup lang="ts">
/** 予算の明細の仕様・詳細・執行予定時期・リンク・備考（修正を開かなくても見えるように出す。書いてあるものだけ） */
defineProps<{ item: { spec?: string | null, plannedTiming?: string | null, link?: string | null, remark?: string | null } }>()
</script>

<template>
  <dl v-if="item.spec || item.plannedTiming || item.link || item.remark" class="details">
    <template v-if="item.spec"><dt>仕様・詳細</dt><dd>{{ item.spec }}</dd></template>
    <template v-if="item.plannedTiming"><dt>執行予定時期</dt><dd>{{ item.plannedTiming }}</dd></template>
    <template v-if="item.link"><dt>リンク</dt><dd><a :href="item.link" target="_blank" rel="noopener noreferrer">{{ item.link }}</a></dd></template>
    <template v-if="item.remark"><dt>備考</dt><dd class="remark">{{ item.remark }}</dd></template>
  </dl>
</template>

<style scoped>
.details { display: grid; grid-template-columns: auto 1fr; gap: .1rem .6rem; margin: .3rem 0 0; font-size: .78rem; }
.details dt { color: var(--muted); white-space: nowrap; }
.details dd { margin: 0; overflow-wrap: anywhere; }
.remark { white-space: pre-wrap; }
</style>
