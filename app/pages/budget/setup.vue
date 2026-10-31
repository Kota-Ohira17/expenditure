<script setup lang="ts">
/**
 * 局・担当と、入力する人（財務管理部）。担当は局の中のグループとして持つ。
 * 局ごとに、局の名前・局の番号を直し（局の中の担当すべてに反映）、局の中に担当を足し、担当の名前を直し、
 * 各担当に明細を入力する人を割り当てる（1人が持てる担当は1つ）。局そのものも足せる。
 */
const { can } = usePermissions()
if (!can('reviewBudget')) await navigateTo('/budget')
const { data: view, refresh } = await useBudgetRound()
const { data: people, refresh: refreshPeople } = await useFetch('/api/budget/people', { default: () => [] })

const collecting = computed(() => !!view.value && view.value.round.status !== 'confirmed')
/** 局ごとに、その局の担当（予算の表の順） */
const groups = computed(() => (view.value?.bureaus ?? []).map(b => ({ bureau: b, teams: (view.value?.teams ?? []).filter(t => t.bureauId === b.id) })))

/** 編集中の値（局と担当） */
const bureauDrafts = reactive<Record<number, { bureauNo: string, name: string }>>({})
const teamDrafts = reactive<Record<number, string>>({})
watchEffect(() => {
  for (const b of view.value?.bureaus ?? []) bureauDrafts[b.id] ??= { bureauNo: b.bureauNo, name: b.name }
  for (const t of view.value?.teams ?? []) teamDrafts[t.id] ??= t.team
})
const bureauChanged = (b: { id: number, bureauNo: string, name: string }) => !!bureauDrafts[b.id] && (bureauDrafts[b.id]!.bureauNo !== b.bureauNo || bureauDrafts[b.id]!.name !== b.name)
const teamChanged = (t: BudgetTeamView) => teamDrafts[t.id] !== undefined && teamDrafts[t.id] !== t.team

const adding = reactive<Record<number, string>>({})
// 「＋人の追加」が選ばれた状態で出す
watchEffect(() => {
  for (const t of view.value?.teams ?? []) adding[t.id] ??= ''
})
const newTeams = reactive<Record<number, string>>({})
const messages = reactive<Record<string, { ok: boolean, text: string }>>({})
const busy = ref(false)

async function run(key: string, task: () => Promise<unknown>, done: string) {
  busy.value = true
  delete messages[key]
  try {
    await task()
    await Promise.all([refresh(), refreshPeople()])
    messages[key] = { ok: true, text: done }
  }
  catch (error) {
    messages[key] = { ok: false, text: toMessages(error).join(' / ') }
  }
  finally {
    busy.value = false
  }
}
const saveBureau = (id: number) => run(`b${id}`, () => $fetch(`/api/budget/bureaus/${id}`, { method: 'PATCH', body: bureauDrafts[id] }), '局を保存しました（中の担当にも反映しました）。')
const saveTeam = (id: number) => run(`t${id}`, () => $fetch(`/api/budget/teams/${id}`, { method: 'PATCH', body: { team: teamDrafts[id] } }), '保存しました。')
const setMembers = (id: number, emails: string[]) => run(`t${id}`, () => $fetch(`/api/budget/teams/${id}/members`, { method: 'PUT', body: { emails } }), '割り当てを保存しました。')
function addMember(t: BudgetTeamView) {
  const email = adding[t.id]
  if (!email) return
  const other = people.value.find(p => p.email === email && p.team)
  if (other && !confirm(`${other.name} は今「${other.bureau} ／ ${other.team}」の担当です。この担当に付け替えますか？`)) return
  adding[t.id] = ''
  setMembers(t.id, [...t.members.map(m => m.email), email])
}
const addTeam = (bureauId: number) => run(`b${bureauId}`, async () => {
  await $fetch('/api/budget/teams', { method: 'POST', body: { bureauId, team: newTeams[bureauId] } })
  newTeams[bureauId] = ''
}, '担当を足しました。')

const newBureau = reactive({ name: '', bureauNo: '' })
const addBureau = () => run('new', async () => {
  await $fetch('/api/budget/bureaus', { method: 'POST', body: newBureau })
  Object.assign(newBureau, { name: '', bureauNo: '' })
}, '局を足しました。続けて、局の中に担当を足してください。')
</script>

<template>
  <section>
    <p><NuxtLink to="/budget/collect">← 集約</NuxtLink></p>
    <h1>局・担当と入力する人</h1>
    <p v-if="!collecting" class="card">確定していない集約がありません。「集約」の画面で集約を始めてから設定してください。</p>
    <template v-else>
      <p class="hint">
        担当は局の中にまとめて持ちます。担当ごとに、明細を入力する人を割り当ててください。割り当てられた人は、自分の担当の明細だけを直して提出できます。
        局の番号（例：out01）は項目番号の頭になります（変えると、これから足す明細から新しい番号になります）。割り当てる人は、先に「ユーザー」に登録されている必要があります。
      </p>

      <section v-for="g in groups" :key="g.bureau.id" class="bureau">
        <header class="bureau-head">
          <template v-if="bureauDrafts[g.bureau.id]">
            <label>局の番号<input v-model.trim="bureauDrafts[g.bureau.id]!.bureauNo" class="w-xs"></label>
            <label>局<input v-model.trim="bureauDrafts[g.bureau.id]!.name" class="w-s"></label>
            <button :disabled="busy || !bureauChanged(g.bureau)" @click="saveBureau(g.bureau.id)">局を保存</button>
          </template>
          <span class="muted count">担当 {{ g.teams.length }}</span>
          <small v-if="messages[`b${g.bureau.id}`]" :class="messages[`b${g.bureau.id}`]!.ok ? 'ok' : 'error'">{{ messages[`b${g.bureau.id}`]!.text }}</small>
        </header>

        <div class="table-wrap">
          <table class="teams">
            <thead><tr><th>担当</th><th>入力する人</th></tr></thead>
            <tbody>
              <tr v-for="t in g.teams" :key="t.id">
                <td>
                  <div class="team">
                    <input v-model.trim="teamDrafts[t.id]" class="w-s" :aria-label="`${t.team} の名前`">
                    <button class="secondary" :disabled="busy || !teamChanged(t)" @click="saveTeam(t.id)">保存</button>
                  </div>
                </td>
                <td>
                  <div class="members">
                  <span v-for="m in t.members" :key="m.email" class="chip">
                    {{ m.name }}
                    <button class="link" :title="`${m.name} を外す`" :disabled="busy" @click="setMembers(t.id, t.members.filter(x => x.email !== m.email).map(x => x.email))">×</button>
                  </span>
                  <select v-model="adding[t.id]" class="w-s" :disabled="busy" @change="addMember(t)">
                    <option value="">＋人の追加</option>
                    <option v-for="p in people.filter(p => !t.members.some(m => m.email === p.email))" :key="p.email" :value="p.email">
                      {{ p.name }}（{{ p.email }}）{{ p.team ? `・今は${p.team}` : '' }}
                    </option>
                  </select>
                  <small v-if="messages[`t${t.id}`]" :class="messages[`t${t.id}`]!.ok ? 'ok' : 'error'">{{ messages[`t${t.id}`]!.text }}</small>
                  </div>
                </td>
              </tr>
              <tr v-if="!g.teams.length"><td colspan="2" class="muted">まだ担当がありません。</td></tr>
            </tbody>
          </table>
        </div>

        <form class="add-team" @submit.prevent="addTeam(g.bureau.id)">
          <input v-model.trim="newTeams[g.bureau.id]" class="w-s" required :aria-label="`${g.bureau.name} に足す担当`">
          <button type="submit" class="secondary" :disabled="busy || !newTeams[g.bureau.id]">＋ この局に担当を追加</button>
        </form>
      </section>

      <form class="card add" @submit.prevent="addBureau">
        <h2>局の追加</h2>
        <div class="fields">
          <label><span>局<span class="req">*</span></span><input v-model.trim="newBureau.name" required></label>
          <label><span>局の番号<span class="req">*</span></span><input v-model.trim="newBureau.bureauNo" class="w-xs" required></label>
        </div>
        <p v-if="messages.new" :class="messages.new.ok ? 'ok' : 'error'">{{ messages.new.text }}</p>
        <button type="submit" :disabled="busy">局を追加</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; margin: 1rem 0; }
/* 局ごとの枠：見出しの帯に局の番号・局の名前、中に担当の表 */
.bureau { margin: 1rem 0; border: 1px solid var(--border); border-radius: 12px; background: var(--panel); overflow: hidden; }
.bureau-head { display: flex; flex-wrap: wrap; align-items: end; gap: .5rem 1rem; padding: .7rem 1rem; background: var(--accent-bg); border-left: 5px solid var(--accent); border-bottom: 1px solid var(--border); }
.bureau-head label { font-size: .78rem; }
.bureau-head .count { align-self: center; font-size: .85rem; }
.table-wrap { overflow-x: auto; padding: .4rem .8rem 0; }
.teams { border-collapse: collapse; width: 100%; min-width: 40rem; background: var(--surface); border-radius: 8px; }
.teams th, .teams td { padding: .4rem .5rem; border-bottom: 1px solid var(--border); text-align: left; font-size: .88rem; vertical-align: top; }
.team { display: flex; gap: .4rem; align-items: center; white-space: nowrap; }
.w-xs { max-width: 6.5rem; }
.w-s { max-width: 11rem; }
.members { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; min-width: 18rem; }
.chip { display: inline-flex; align-items: center; gap: .3rem; padding: .1rem .5rem; border: 1px solid var(--border); border-radius: 999px; background: var(--bg); font-size: .82rem; }
.add-team { display: flex; gap: .5rem; align-items: center; padding: .6rem .8rem .8rem; }
.add h2 { margin: 0 0 .5rem; font-size: 1.05rem; }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: .5rem .9rem; margin-bottom: .6rem; }
.ok { color: var(--done); }
</style>
