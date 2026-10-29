<script setup lang="ts">
/**
 * メニューやホームのカードに使う線のアイコン。Feather Icons（MIT License, https://feathericons.com）のパッケージから描く。
 * 中身はパッケージに入っている固定の文字列だけなので v-html で描く。
 */
import feather from 'feather-icons'

/** 使うアイコンの名前（Feather の名前そのまま。一覧は https://feathericons.com） */
type IconName = 'home' | 'send' | 'list' | 'pie-chart' | 'edit-3' | 'check-square' | 'users' | 'log-out'
const props = defineProps<{ name: IconName }>()

const markup = computed(() => feather.icons[props.name].contents)
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<style scoped>
.app-icon { width: 1.15em; height: 1.15em; flex: none; }
</style>
