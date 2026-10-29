<script setup lang="ts">
const route = useRoute()
const { public: { devLogin, testLogin, googleLogin } } = useRuntimeConfig()
const { fetch: refreshSession } = useUserSession()

const form = reactive({ email: '', name: '', code: '' })
const errors = ref<string[]>([])
const pending = ref(false)

async function login() {
  errors.value = []
  pending.value = true
  try {
    await $fetch('/auth/dev', { method: 'POST', body: form })
    await refreshSession()
    await navigateTo('/')
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
  <section class="card narrow">
    <h1>ログイン</h1>
    <p>ECCアカウント（g.ecc.u-tokyo.ac.jp）でログインしてください。</p>

    <template v-if="googleLogin">
      <p v-if="route.query.error" class="error">Google ログインに失敗しました。</p>
      <a href="/auth/google" class="button">Google でログイン</a>
    </template>

    <form v-if="testLogin || devLogin" class="dev" :class="{ first: !googleLogin }" @submit.prevent="login">
      <h2>{{ testLogin ? 'テスト用ログイン' : '開発用ログイン' }}</h2>
      <p v-if="testLogin" class="hint">ECCのメールアドレスと氏名、配られた合言葉を入力してください。初回は「一般」で登録されます（管理者用の合言葉なら管理者）。</p>
      <p v-else class="hint">パスワードは不要です。初回は「一般」で登録されます（NUXT_ADMIN_EMAILS に含まれるメールは管理者）。</p>
      <label>メール<input v-model.trim="form.email" type="email" placeholder="xxxx@g.ecc.u-tokyo.ac.jp" autocomplete="email" required></label>
      <label>氏名<input v-model.trim="form.name" placeholder="駒場太郎" autocomplete="name" required></label>
      <label v-if="testLogin">合言葉<input v-model="form.code" type="password" autocomplete="off" required></label>
      <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
      <button type="submit" :disabled="pending">{{ pending ? 'ログイン中…' : 'ログイン' }}</button>
    </form>

    <p v-if="!googleLogin && !testLogin && !devLogin" class="error">ログイン方法が設定されていません。</p>
  </section>
</template>

<style scoped>
.dev.first { margin-top: 1rem; border-top: none; padding-top: 0; }
</style>
