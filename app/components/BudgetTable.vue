<script setup lang="ts">
/**
 * 予算明細を本予算スプレッドシート「支出」シートと同じ形の表で表示する。
 * 局・担当・款・項・目は見出しの行として出し、金額のある行（明細）を選べるようにする。
 * 款から下の見出し（例:「委員会設備等関連費」「インク代」）を押すと、その下の明細をすべてまとめて選択・解除できる。
 * selected を渡さなければ閲覧専用。行の組み立ては shared/budgetRows.ts（決算シートの出力と共通）。
 */
import {
  buildSheetRows, GROUP_LEVELS, LEVEL_LABELS, SHEET_COLUMN_LABELS, SHEET_COLUMNS, type SheetRow,
} from '#shared/budgetRows'

const props = defineProps<{
  lines: BudgetLineView[]
  selected?: string[]
  /** 枠の高さを固定する（タブを切り替えても大きさが変わらない）。中身は枠の中でスクロールする */
  fixedHeight?: boolean
}>()
const emit = defineEmits<{
  toggle: [key: string]
  /** 見出しでまとめて選択（on=true）・解除（on=false） */
  toggleMany: [keys: string[], on: boolean]
}>()

type Row = SheetRow<BudgetLineView>

const table = computed(() => buildSheetRows(props.lines))
const rows = computed(() => table.value.rows)

/** 見出しの行の選択状態（款から下の見出しは、その下の明細をすべてまとめて選べる） */
function groupState(row: Row) {
  const keys = row.path ? table.value.descendants.get(row.path) : undefined
  if (!selectable.value || !keys?.length || !GROUP_LEVELS.includes(row.level)) return undefined
  const on = keys.filter(k => props.selected?.includes(k)).length
  return { keys, all: on === keys.length, some: on > 0 && on < keys.length }
}

function onRowClick(row: Row) {
  if (!selectable.value) return
  if (row.line) return emit('toggle', row.line.key)
  const g = groupState(row)
  if (g) emit('toggleMany', g.keys, !g.all)
}

const COLUMNS = SHEET_COLUMNS.map(key => ({ key, label: SHEET_COLUMN_LABELS[key] }))

const selectable = computed(() => props.selected !== undefined)
const isOn = (row: Row) => row.line != null && (props.selected?.includes(row.line.key) ?? false)

/** 表示する明細が変わったら（局のタブ・絞り込み）、枠の中のスクロールを先頭に戻す */
const wrap = useTemplateRef<HTMLDivElement>('wrap')
watch(() => props.lines, () => wrap.value?.scrollTo({ top: 0 }))

/**
 * 本予算「支出」シートと同じく、局・担当・款の見出しの行は、その階層の列から右側だけを塗る
 * （項・目・節の行は塗らない）。
 * 色は CSS の --fill-*。
 */
const FILL_FROM: Partial<Record<SheetRow<BudgetLineView>['level'], number>> = Object.fromEntries(
  (['bureau', 'team', 'kan'] as const).map(level => [level, SHEET_COLUMNS.indexOf(level)]),
)
function isFilled(row: Row, colIndex: number) {
  const from = row.kind === 'group' ? FILL_FROM[row.level] : undefined
  return from !== undefined && colIndex >= from
}

/** 見出しにマウスを乗せている間、押したら選ばれる明細を光らせる */
const preview = ref<Set<string>>(new Set())
function onRowEnter(row: Row) {
  const g = row.line ? undefined : groupState(row)
  preview.value = g ? new Set(g.keys) : new Set()
}
</script>

<template>
  <div ref="wrap" class="sheet-wrap" :class="{ 'fixed-height': fixedHeight }" @mouseleave="preview = new Set()">
    <table class="sheet" :class="{ selectable }">
      <thead>
        <tr>
          <th v-if="selectable" class="check">選択</th>
          <th v-for="c in COLUMNS" :key="c.key" :class="`c-${c.key}`">{{ c.label }}</th>
          <th class="c-qty">数量</th>
          <th class="c-vendor">取引先</th>
          <th class="yen">希望予算額</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.id"
          :class="[row.kind, `lv-${row.level}`, {
            on: isOn(row),
            pickable: row.line || groupState(row),
            preview: row.line && preview.has(row.line.key),
          }]"
          @click="onRowClick(row)"
          @mouseenter="onRowEnter(row)"
        >
          <td v-if="selectable" class="check">
            <input
              v-if="row.line"
              type="checkbox"
              :checked="isOn(row)"
              :aria-label="row.line.label"
              @click.stop
              @change="emit('toggle', row.line.key)"
            >
            <label v-else-if="groupState(row)" class="group-pick" @click.stop>
              <input
                type="checkbox"
                :checked="groupState(row)!.all"
                :indeterminate="groupState(row)!.some"
                :aria-label="`${LEVEL_LABELS[row.level]}「${Object.values(row.cells).filter(Boolean).at(-1)}」の明細${groupState(row)!.keys.length}件をまとめて選択`"
                @change="onRowClick(row)"
              >
              <span class="lv-badge">{{ LEVEL_LABELS[row.level] }}</span>
              <span class="count" :title="`この${LEVEL_LABELS[row.level]}の下の明細 ${groupState(row)!.keys.length}件`">{{ groupState(row)!.keys.length }}</span>
            </label>
          </td>
          <td v-for="(c, ci) in COLUMNS" :key="c.key" :class="[`c-${c.key}`, { filled: isFilled(row, ci) }]">{{ row.cells[c.key] }}</td>
          <td :class="{ filled: isFilled(row, COLUMNS.length) }">{{ row.line?.quantity }}</td>
          <td :class="{ filled: isFilled(row, COLUMNS.length) }">{{ row.line?.vendor }}</td>
          <td class="yen" :class="{ filled: isFilled(row, COLUMNS.length) }">{{ row.line ? formatYen(row.line.budgetAmount) : '' }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.sheet-wrap {
  max-height: 28rem; overflow: auto; border: 1px solid var(--border); border-radius: 6px; background: var(--surface);
  /* 本予算「支出」シートと同じ色（局: 黄、担当: 緑、款: 青、列見出し: グレー。項・目・節は白） */
  --fill-bureau: #fff2cc;
  --fill-team: #d9ead3;
  --fill-kan: #c9daf8;
  --fill-head: #d9d9d9;
  /* 選択した行・まとめて選ぶ対象の行（ボタンと同じローズベージュ。シートの色とも見分けられる） */
  --row-picked: var(--accent-bg);
  --row-preview: var(--main);
}
/* 枠の高さを固定し、中で縦横にスクロールする（列の見出しは枠の上端に貼り付く） */
.sheet-wrap.fixed-height { height: clamp(18rem, 60vh, 42rem); max-height: none; overscroll-behavior: contain; }
.sheet { border-collapse: collapse; font-size: .8rem; width: 100%; min-width: 58rem; }
.sheet th, .sheet td { border: 1px solid var(--border); padding: .2rem .4rem; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
.sheet th { position: sticky; top: 0; z-index: 1; background: var(--fill-head); color: #333; font-weight: 600; white-space: nowrap; }
/* 局・担当・款は見出しの行にしか出ないので狭く、明細の名前が出る項・目・節を広くする */
.sheet .c-number { width: 6rem; white-space: nowrap; font-variant-numeric: tabular-nums; color: var(--muted); }
.sheet .c-bureau { width: 4.2rem; }
.sheet .c-team { width: 5.4rem; }
.sheet .c-kan { width: 8rem; }
.sheet .c-kou { width: 10.5rem; }
.sheet .c-moku, .sheet .c-setsu { width: 17%; }
.sheet .yen { width: 6.5rem; white-space: nowrap; text-align: right; font-variant-numeric: tabular-nums; }
.sheet .check { width: 4.6rem; white-space: nowrap; }
.sheet .c-qty { width: 4.5rem; }
.sheet .c-vendor { width: 6rem; }

/* 見出しの行: シートと同じく、その階層の列から右側だけを塗る（項・目・節は白） */
tr.group.lv-bureau td.filled { background: var(--fill-bureau); }
tr.group.lv-team td.filled { background: var(--fill-team); }
tr.group.lv-kan td.filled { background: var(--fill-kan); }
.sheet td.filled { color: #222; }
tr.group.lv-bureau td, tr.group.lv-kan td { font-weight: 700; }
tr.group.lv-team td, tr.group.lv-kou td { font-weight: 600; }
tr.group.lv-moku td { font-weight: 500; }

/* まとめて選ぶチェックボックスと、階層名・件数のバッジ（バッジもシートの色） */
.group-pick { display: inline-flex; align-items: center; gap: .25rem; cursor: pointer; padding-left: .3rem; }
.lv-badge {
  display: inline-block; min-width: 1.4em; padding: 0 .3em; border-radius: 3px; text-align: center;
  font-size: .72rem; font-weight: 700; line-height: 1.5; color: #333; background: #fff; border: 1px solid #ccc;
}
tr.lv-kan .lv-badge { background: var(--fill-kan); border-color: #a4bfee; }
.count { font-size: .72rem; color: var(--muted); font-variant-numeric: tabular-nums; }
tr.line .check { padding-left: .7rem; }

.selectable tr.pickable { cursor: pointer; }
.selectable tr.group.pickable:hover td { filter: brightness(.97); }
.selectable tr.line:hover td { background: var(--row-preview); }
/* 見出しにマウスを乗せたとき、まとめて選ばれる明細 */
tr.line.preview td { background: var(--row-preview); }
tr.line.on td { background: var(--row-picked); }
</style>
