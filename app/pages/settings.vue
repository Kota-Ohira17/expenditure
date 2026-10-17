<script setup lang="ts">
/** 自分の通知設定（Slack の DM）。ヘッダーの名前から開く */
const { data, refresh } = await useFetch('/api/me/notifications')

const form = reactive({ dmOnCreated: true, dmOnExecuted: true, slackEmail: '' })
watch(data, (d) => {
  if (d) Object.assign(form, { dmOnCreated: d.dmOnCreated, dmOnExecuted: d.dmOnExecuted, slackEmail: d.slackEmail })
}, { immediate: true })

const pending = ref(false)
const saved = ref(false)
const errors = ref<string[]>([])

async function onSave() {
  pending.value = true
  saved.value = false
  errors.value = []
  try {
    await $fetch('/api/me/notifications', { method: 'PATCH', body: form })
    await refresh()
    saved.value = true
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="page">
    <h1 class="page-title">通知設定</h1>

    <form class="card settings" @submit.prevent="onSave">
      <fieldset>
        <legend>Slack の DM</legend>
        <p class="hint">自分の申請について、Slack の DM で知らせます（チャンネルへの投稿とは別です）。</p>
        <label class="check"><input v-model="form.dmOnCreated" type="checkbox"> 申請を受け付けたとき（受付番号などの控え）</label>
        <label class="check"><input v-model="form.dmOnExecuted" type="checkbox"> 申請が対応済みになったとき</label>
      </fieldset>

      <label><span>Slack に登録しているメールアドレスを入力してください。<span v-if="form.dmOnCreated || form.dmOnExecuted" class="req">*</span></span>
        <input v-model.trim="form.slackEmail" type="email" placeholder="例：xxxx@g.ecc.u-tokyo.ac.jp" autocomplete="email" :required="form.dmOnCreated || form.dmOnExecuted">
      </label>

      <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
      <p v-if="saved" class="success">保存しました。</p>
      <button type="submit" :disabled="pending">{{ pending ? '保存中…' : '保存する' }}</button>
    </form>
  </section>
</template>

<style scoped>
.settings { max-width: 40rem; }
</style>
