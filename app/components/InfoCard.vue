<script setup lang="ts">
/**
 * 一覧の1件分のカード（集約・査定で使う）。
 * 左：状態の札、小さな情報の行（番号・担当など）、名前、太字の要点。右上：タグ。右の欄：最後に動かした人・日時とひとこと。
 * 下に操作（承認ボタンなど）を入れられる（footer）。to を渡すとカード全体がリンクになる。
 */
defineProps<{
  /** 状態の札（例：査定待ち）と色 */
  status: string
  tone?: 'gray' | 'yellow' | 'red' | 'green'
  meta?: string
  title: string
  /** 右の欄：だれが・いつ */
  who?: string
  when?: string | Date | null
  /** 右の欄のひとこと（備考・コメントなど） */
  note?: string
  to?: string
}>()

const formatWhen = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\//, '月').replace(' ', '日 ') : ''
</script>

<template>
  <article class="info-card" :class="{ link: !!to }">
    <NuxtLink v-if="to" :to="to" class="cover" :aria-label="title" />
    <div class="main">
      <div class="top">
        <span class="status" :class="tone ?? 'gray'">{{ status }}</span>
        <span class="tags"><slot name="tags" /></span>
      </div>
      <div class="body">
        <div class="text">
          <p v-if="meta" class="meta">{{ meta }}</p>
          <p class="title">{{ title }}</p>
          <p class="point"><slot /></p>
        </div>
        <aside v-if="who || note" class="aside">
          <p class="who"><strong>{{ who }}</strong> <span>{{ formatWhen(when) }}</span></p>
          <p v-if="note" class="note">{{ note }}</p>
        </aside>
      </div>
      <div v-if="$slots.footer" class="footer"><slot name="footer" /></div>
    </div>
  </article>
</template>

<style scoped>
.info-card { position: relative; background: var(--surface); border-radius: 10px; box-shadow: 0 1px 3px rgb(0 0 0 / .07); padding: .85rem 1rem .9rem; }
.info-card.link:hover { box-shadow: 0 1px 6px rgb(0 0 0 / .14); }
.cover { position: absolute; inset: 0; border-radius: 10px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: .5rem; margin-bottom: .45rem; }
.status { font-size: .75rem; font-weight: 700; padding: .15rem .6rem; border-radius: 999px; white-space: nowrap; }
.status.gray { background: #ecebe8; color: #5f5a55; }
.status.yellow { background: #fbf0d4; color: #8a6200; }
.status.red { background: #fbe4e4; color: #b42318; }
.status.green { background: #dff1e3; color: #1e6b34; }
.tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: .35rem; }
.body { display: grid; grid-template-columns: minmax(0, 1fr) 13.5rem; gap: 1rem; }
.text p { margin: 0; }
.meta { font-size: .78rem; color: var(--muted); }
.title { font-size: .9rem; margin-top: .1rem !important; }
.point { font-weight: 700; font-size: .92rem; margin-top: .55rem !important; }
.aside { border-left: 1px solid var(--border); padding-left: .9rem; font-size: .78rem; align-self: start; }
.aside p { margin: 0; }
.who span { color: var(--muted); margin-left: .25rem; }
.note { color: var(--muted); margin-top: .15rem !important; overflow-wrap: anywhere; }
.footer { position: relative; z-index: 1; margin-top: .7rem; padding-top: .7rem; border-top: 1px solid var(--border); }
@media (max-width: 600px) {
  .body { grid-template-columns: minmax(0, 1fr); }
  .aside { border-left: none; border-top: 1px solid var(--border); padding: .5rem 0 0; }
}
</style>
