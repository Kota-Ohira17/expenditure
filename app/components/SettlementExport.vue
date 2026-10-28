<script setup lang="ts">
/**
 * 決算シートの出力（財務局長・管理者）。Google スプレッドシートへの書き出しと Excel のダウンロード。
 * 書き出し先の URL はこのブラウザに覚えておく。
 */
const STORAGE_KEY = 'settlement-spreadsheet-url'

const open = ref(false)
const url = ref('')
const pending = ref(false)
const errors = ref<string[]>([])
const result = ref<{ url: string, sheets: { name: string, rows: number }[] }>()
const { data: config } = await useFetch('/api/settlement/sheets-config', { lazy: true })

onMounted(() => {
  try { url.value = localStorage.getItem(STORAGE_KEY) ?? '' }
  catch { /* 保存できない環境では毎回入力 */ }
})

async function exportToSheets() {
  errors.value = []
  result.value = undefined
  pending.value = true
  try {
    result.value = await $fetch<{ url: string, sheets: { name: string, rows: number }[] }>('/api/settlement/sheets', {
      method: 'POST',
      body: { spreadsheetUrl: url.value },
    })
    try { localStorage.setItem(STORAGE_KEY, url.value) }
    catch { /* 覚えられなくても出力はできている */ }
  }
  catch (error) {
    errors.value = toMessages(error)
  }
  finally {
    pending.value = false
  }
}

async function copyEmail() {
  if (config.value?.serviceAccountEmail) await navigator.clipboard?.writeText(config.value.serviceAccountEmail)
}
</script>

<template>
  <div class="export">
    <div class="buttons">
      <button type="button" @click="open = !open">決算シートをスプレッドシートに出力</button>
      <a class="button secondary" href="/api/settlement.xlsx" download>Excelでダウンロード</a>
    </div>

    <form v-if="open" class="card panel" @submit.prevent="exportToSheets">
      <p class="hint">
        対応済みの申請をまとめて、指定したスプレッドシートの「決算」「証憑」「執行一覧」シートに書き出します（なければ追加、あれば書き直し。ほかのシートはそのまま）。
        「決算」「証憑」は、取り込んだ予算の「支出」シートと同じ形です。「証憑」シートから、明細ごとの請求書・領収書を開けます。
      </p>
      <template v-if="config && !config.configured">
        <p class="error">スプレッドシート出力用のサービスアカウントが設定されていません。README の「決算シートをスプレッドシートに出力」を見て設定してください。</p>
      </template>
      <template v-else-if="config">
        <p class="share">
          出力先のスプレッドシートを <code>{{ config.serviceAccountEmail }}</code>
          <button type="button" class="link" @click="copyEmail">コピー</button>
          と「編集者」として共有してください。
        </p>
        <label>出力先のスプレッドシートの URL
          <input v-model.trim="url" type="url" placeholder="https://docs.google.com/spreadsheets/d/…" required>
        </label>
        <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
        <p v-if="result" class="ok">
          書き出しました（{{ result.sheets.map(s => `${s.name} ${s.rows}行`).join('、') }}）。
          <a :href="result.url" target="_blank" rel="noopener">スプレッドシートを開く</a>
        </p>
        <button type="submit" :disabled="pending || !url">{{ pending ? '書き出し中…' : '書き出す' }}</button>
      </template>
    </form>
  </div>
</template>

<style scoped>
.export { display: grid; gap: .5rem; justify-items: end; }
.buttons { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; }
.panel { max-width: 40rem; width: 100%; display: grid; gap: .6rem; justify-items: stretch; }
.panel p { margin: 0; }
.share code { font-size: .85em; background: var(--bg); padding: 0 .3em; border-radius: 3px; overflow-wrap: anywhere; }
.ok { color: var(--done); }
</style>
