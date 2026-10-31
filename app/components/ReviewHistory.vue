<script setup lang="ts">
/**
 * 項目の査定のやり取り（⑤査定DBの行）。開いたときに読み込む。
 * 追加・修正・提出・承認・要修正・返事を時刻の順に並べる（だれが行ったかは出さない）。canReply なら返事を書ける。
 */
const props = defineProps<{ roundId: number, itemNumber: string, itemId: string, canReply?: boolean }>()
const emit = defineEmits<{ replied: [] }>()

const { data: rows, refresh } = useFetch(`/api/budget/rounds/${props.roundId}/history`, { query: { item: props.itemNumber }, default: () => [], server: false })
const ACTIONS: Record<string, string> = {
  create: '追加', edit: '修正', reflect: '財務管理部の修正', submit: '提出', approve: '承認', return: '要修正', reply: '返事',
}
const when = (d: string | Date) => new Date(d).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

const reply = ref('')
const pending = ref(false)
const errors = ref<string[]>([])
async function send() {
  errors.value = []
  pending.value = true
  try {
    await $fetch(`/api/budget/items/${props.itemId}/reply`, { method: 'POST', body: { comment: reply.value } })
    reply.value = ''
    await refresh()
    emit('replied')
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
  <div class="history">
    <ol>
      <li v-for="r in rows" :key="r.id" :class="r.action">
        <span class="when">{{ when(r.createdAt) }}</span>
        <span class="act">{{ ACTIONS[r.action] ?? r.action }}</span>
        <span v-if="r.bulk" class="muted">（{{ r.bulk }}）</span>
        <span v-if="r.comment" class="comment">{{ r.comment }}</span>
      </li>
    </ol>
    <p v-if="!rows.length" class="muted">まだやり取りはありません。</p>
    <div v-if="canReply" class="reply">
      <input v-model.trim="reply" placeholder="返事（要修正の理由への説明など）" aria-label="返事">
      <button class="secondary" :disabled="pending || !reply" @click="send">返事を送る</button>
    </div>
    <ul v-if="errors.length" class="error"><li v-for="e in errors" :key="e">{{ e }}</li></ul>
  </div>
</template>

<style scoped>
.history { font-size: .82rem; display: grid; gap: .4rem; }
ol { margin: 0; padding: 0; list-style: none; display: grid; gap: .2rem; }
li { display: flex; flex-wrap: wrap; gap: .2rem .6rem; align-items: baseline; }
.when { color: var(--muted); font-variant-numeric: tabular-nums; min-width: 6.5rem; }
.act { font-weight: 700; }
li.return .act { color: var(--danger); }
li.approve .act { color: var(--done); }
li.reply .act { color: #8a6200; }
.comment { flex-basis: 100%; padding-left: 7.1rem; white-space: pre-line; }
.reply { display: flex; gap: .5rem; }
.reply input { flex: 1; max-width: none; }
@media (max-width: 600px) {
  .comment { padding-left: 0; }
}
</style>
