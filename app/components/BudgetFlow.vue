<script setup lang="ts">
/**
 * 集約の進み方のフローチャート（集約の画面の上部）。
 * 集約開始 →（各担当の入力・提出）→ 集約終了 → 査定開始 →（査定：承認／要修正で出し直し）→ 確定。
 * 終わった段階は緑、今の段階は太枠で目立たせる。四角は財務管理部の操作、角丸の塗りは作業の期間。
 */
const props = defineProps<{
  phase: BudgetPhase
  summary: { draft: number, returned: number, submitted: number, approved: number } | null
}>()

type Node = { key: string, label: string, who: string, kind: 'step' | 'work', note?: string, loop?: boolean }
const nodes = computed<Node[]>(() => {
  const s = props.summary
  return [
    { key: 'start', label: '集約開始', who: '財務管理部', kind: 'step' },
    { key: 'input', label: '入力・提出', who: '各担当', kind: 'work', note: s ? `未提出 ${s.draft + s.returned}件` : undefined },
    { key: 'close', label: '集約終了', who: '財務管理部', kind: 'step' },
    { key: 'review-start', label: '査定開始', who: '財務管理部', kind: 'step' },
    { key: 'review', label: '査定', who: '財務管理部', kind: 'work', note: s ? `査定待ち ${s.submitted}件 ／ 要修正 ${s.returned}件` : undefined, loop: true },
    { key: 'confirm', label: '確定', who: '財務管理部', kind: 'step' },
  ]
})
/** 今いる場所（ここより前は終わった段階） */
const NOW: Record<BudgetPhase, number> = { collecting: 1, closed: 2, reviewing: 4, confirmed: 6 }
const stateOf = (i: number) => (i < NOW[props.phase] ? 'done' : i === NOW[props.phase] ? 'now' : 'todo')
</script>

<template>
  <ol class="flow" aria-label="集約の進み方">
    <li v-for="(n, i) in nodes" :key="n.key" class="node" :class="[n.kind, stateOf(i)]" :aria-current="stateOf(i) === 'now' ? 'step' : undefined">
      <span class="who">{{ n.who }}</span>
      <strong class="label">{{ n.label }}</strong>
      <span v-if="n.note && stateOf(i) === 'now'" class="note">{{ n.note }}</span>
      <span v-if="n.loop" class="loop">要修正 ⇄ 出し直し</span>
      <span v-if="stateOf(i) === 'now'" class="here">いまここ</span>
    </li>
  </ol>
</template>

<style scoped>
.flow { display: flex; align-items: stretch; margin: .9rem 0 .4rem; padding: 0; list-style: none; }
.node { position: relative; flex: 1 1 0; min-width: 0; display: grid; align-content: center; justify-items: center; gap: .1rem; text-align: center; padding: .55rem .4rem; border: 1.5px solid var(--border); background: var(--surface); color: var(--muted); font-size: .8rem; }
/* 財務管理部の操作は四角、作業の期間は角丸の塗り */
.node.step { border-radius: 6px; }
.node.work { flex-grow: 1.6; border-radius: 18px; background: var(--panel); border-style: dashed; }
/* 矢印（次の段階へ） */
.node + .node { margin-left: 1.3rem; }
.node + .node::before { content: ''; position: absolute; left: -1.2rem; top: 50%; width: .85rem; border-top: 1.5px solid var(--muted); }
.node + .node::after { content: ''; position: absolute; left: -.5rem; top: 50%; transform: translateY(-50%); border: .3rem solid transparent; border-left: .4rem solid var(--muted); border-right: none; }
.who { font-size: .7rem; }
.label { font-size: .92rem; color: var(--text); }
.note { font-size: .74rem; color: var(--text); line-height: 1.35; }
.loop { font-size: .7rem; padding: 0 .45rem; border-radius: 999px; background: #fbe4e4; color: #b42318; white-space: nowrap; }
.here { position: absolute; top: -.7rem; left: 50%; transform: translateX(-50%); font-size: .66rem; font-weight: 700; padding: 0 .45rem; border-radius: 999px; background: var(--text); color: var(--surface); white-space: nowrap; }
.node.done { border-color: #9fd0aa; background: #eef8f0; color: #1e6b34; }
.node.done .label { color: #1e6b34; }
.node.now { border: 2.5px solid var(--text); background: var(--accent-bg); color: var(--text); box-shadow: var(--shadow); }
.node.now.work { border-style: solid; }
.node.todo { opacity: .75; }

/* 狭い画面では縦に並べる */
@media (max-width: 760px) {
  .flow { flex-direction: column; margin-top: .2rem; }
  .node { padding: .5rem .8rem; }
  .node + .node { margin: 1.4rem 0 0; }
  .node + .node::before { left: 50%; top: -1.25rem; width: 0; height: 1rem; border-top: none; border-left: 1.5px solid var(--muted); }
  .node + .node::after { left: 50%; top: -.45rem; transform: translateX(-50%); border: .3rem solid transparent; border-top: .4rem solid var(--muted); border-bottom: none; }
  .here { top: 50%; left: auto; right: .6rem; transform: translateY(-50%); }
}
</style>
