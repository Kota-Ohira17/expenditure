<script setup lang="ts">
import { useMenu } from '~/composables/useMenu'

const { entriesTitle } = usePermissions()
const menu = useMenu()
const groups = computed(() => groupMenu(menu.value.filter(m => m.home)))
</script>

<template>
  <section>
    <h1 class="page-title">ホーム</h1>
    <div v-for="g in groups" :key="g.name" class="group">
      <h2 class="group-name">{{ g.name }}</h2>
      <div class="tiles">
        <NuxtLink v-for="m in g.items" :key="m.to" :to="m.to" class="tile">
          <AppIcon :name="m.icon" />
          <span>{{ m.to === '/entries' ? entriesTitle : m.label }}</span>
        </NuxtLink>
      </div>
    </div>
  </section>
</template>
