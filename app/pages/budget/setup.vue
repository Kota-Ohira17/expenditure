<script setup lang="ts">
/**
 * 局・担当と、入力する人（財務管理部）。集約中の予算の局・担当の名前・担当者を直し、担当を足し、
 * 各担当に明細を入力する人を割り当てる（1人が持てる担当は1つ）。
 */
const { can } = usePermissions()
if (!can('reviewBudget')) await navigateTo('/budget')
const { data: view, refresh } = await useBudgetRound()
const { data: people, refresh: refreshPeople } = await useFetch('/api/budget/people', { default: () => [] })

const collecting = computed(() => !!view.value && view.value.round.status !== 'confirmed')
const teams = computed(() => view.value?.teams ?? [])

/** 行ごとの編集中の値 */
const drafts = reactive<Record<number, { bureauNo: string, bureau: string, team: string }>>({})
watchEffect(() => {
  for (const t of teams.value) drafts[t.id] ??= { bureauNo: t.bureauNo, bureau: t.bureau, team: t.team }
})
const changed = (id: number) => {
  const t = teams.value.find(x => x.id === id)
  const d = drafts[id]
  return !!t && !!d && (t.bureauNo !== d.bureauNo || t.bureau !== d.bureau || t.team !== d.team)
}
const adding = reactive<Record<number, string>>({})
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
const saveTeam = (id: number) => run(`t${id}`, () => $fetch(`/api/budget/teams/${id}`, { method: 'PATCH', body: drafts[id] }), '保存しました。')
const setMembers = (id: number, emails: string[]) => run(`t${id}`, () => $fetch(`/api/budget/teams/${id}/members`, { method: 'PUT', body: { emails } }), '割り当てを保存しました。')
function addMember(t: BudgetTeamView) {
  const email = adding[t.id]
  if (!email) return
  const other = people.value.find(p => p.email === email && p.team)
  if (other && !confirm(`${other.name} は今「${other.bureau} ／ ${other.team}」の担当です。この担当に付け替えますか？`)) return
  adding[t.id] = ''
  setMembers(t.id, [...t.members.map(m => m.email), email])
}

const newTeam = reactive({ bureauNo: '', bureau: '', team: '' })
const bureaus = computed(() => [...new Map(teams.value.map(t => [t.bureau, t.bureauNo])).entries()])
watch(() => newTeam.bureau, (b) => {
  const known = bureaus.value.find(([name]) => name === b)
  if (known) newTeam.bureauNo = known[1]
})
const addTeam = () => run('new', async () => {
  await $fetch('/api/budget/teams', { method: 'POST', body: newTeam })
  Object.assign(newTeam, { bureauNo: '', bureau: '', team: '' })
}, '担当を足しました。')
const bureauList = useId()
</script>

<template>
  <section>
    <p><NuxtLink to="/budget/collect">← 集約</NuxtLink></p>
    <h1>局・担当と入力する人</h1>
    <p v-if="!collecting" class="card">確定していない集約がありません。「集約」の画面で集約を始めてから設定してください。</p>
    <template v-else>
      <p class="hint">
        担当ごとに、明細を入力する人を割り当ててください。割り当てられた人は、自分の担当の明細だけを直して提出できます。
        局の番号（例：out01）は項目番号の頭になります。割り当てる人は、先に「ユーザー」に登録されている必要があります。
      </p>

      <div class="table-wrap">
        <table class="teams">
          <thead><tr><th>局の番号</th><th>局</th><th>担当</th><th>入力する人</th><th /></tr></thead>
          <tbody>
            <tr v-for="t in teams" :key="t.id">
              <template v-if="drafts[t.id]">
                <td><input v-model.trim="drafts[t.id]!.bureauNo" class="w-xs"></td>
                <td><input v-model.trim="drafts[t.id]!.bureau" class="w-s"></td>
                <td><input v-model.trim="drafts[t.id]!.team" class="w-s"></td>
                <td class="members">
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
                </td>
                <td><button :disabled="busy || !changed(t.id)" @click="saveTeam(t.id)">保存</button></td>
              </template>
            </tr>
          </tbody>
        </table>
      </div>

      <form class="card add" @submit.prevent="addTeam">
        <h2>担当の追加</h2>
        <div class="fields">
          <label>局<input v-model.trim="newTeam.bureau" :list="bureauList" required placeholder="例：事務局"></label>
          <datalist :id="bureauList"><option v-for="[b] in bureaus" :key="b" :value="b" /></datalist>
          <label>局の番号<input v-model.trim="newTeam.bureauNo" class="w-xs" required placeholder="例：out01"></label>
          <label>担当<input v-model.trim="newTeam.team" required placeholder="例：環境計画部長"></label>
        </div>
        <p v-if="messages.new" :class="messages.new.ok ? 'ok' : 'error'">{{ messages.new.text }}</p>
        <button type="submit" :disabled="busy">追加</button>
      </form>
    </template>
  </section>
</template>

<style scoped>
.card { max-width: none; margin: 1rem 0; }
.table-wrap { overflow-x: auto; }
.teams { border-collapse: collapse; min-width: 60rem; background: var(--surface); }
.teams th, .teams td { padding: .4rem .5rem; border-bottom: 1px solid var(--border); text-align: left; font-size: .88rem; vertical-align: top; }
.w-xs { max-width: 6.5rem; }
.w-s { max-width: 11rem; }
.members { display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; min-width: 18rem; }
.chip { display: inline-flex; align-items: center; gap: .3rem; padding: .1rem .5rem; border: 1px solid var(--border); border-radius: 999px; background: var(--bg); font-size: .82rem; }
.add h2 { margin: 0; font-size: 1.05rem; }
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: .5rem .9rem; }
.ok { color: var(--done); }
</style>
