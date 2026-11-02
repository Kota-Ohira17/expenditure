<script setup lang="ts">
/** 収入台帳は台帳（/entries）の「収入」にまとめた。前のリンクから来たらそこへ移す */
await navigateTo({ path: '/entries', query: { flow: 'income' } }, { replace: true })
</script>

<template>
  <div />
</template>
