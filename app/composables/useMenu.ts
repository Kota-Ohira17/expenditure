/**
 * 左のメニューとホームのカードに出すページの一覧（権限に応じて出し分ける）。
 * group ごとに枠を分けて並べる（執行：執行依頼・台帳 ／ 予算：予算・集約・査定・予算の変更 ／ 管理：ユーザー）。
 * matches は、そのメニューを選ばれた色にする下の画面（例：担当の画面は「集約」）。
 */
export function useMenu() {
  const { can } = usePermissions()
  return computed(() => [
    { to: '/', label: 'ホーム', icon: 'home' as const, home: false, group: '' },
    { to: '/requests/new', label: '執行依頼', icon: 'send' as const, home: true, group: '執行' },
    { to: '/entries', label: '台帳', icon: 'list' as const, home: true, group: '執行' },
    { to: '/budget', label: '予算', icon: 'pie-chart' as const, home: true, group: '予算' },
    { to: '/budget/collect', label: '集約', icon: 'edit-3' as const, home: true, group: '予算', matches: ['/budget/team', '/budget/setup'] },
    ...(can('reviewBudget') ? [{ to: '/budget/review', label: '査定', icon: 'check-square' as const, home: true, group: '予算' }] : []),
    { to: '/budget/changes', label: '予算の変更', icon: 'sliders' as const, home: true, group: '予算' },
    ...(can('manageUsers') ? [{ to: '/users', label: 'ユーザー', icon: 'users' as const, home: true, group: '管理' }] : []),
  ] as { to: string, label: string, icon: 'home' | 'send' | 'list' | 'pie-chart' | 'edit-3' | 'check-square' | 'sliders' | 'users', home: boolean, group: string, matches?: string[] }[])
}

/** メニューを枠（group）ごとにまとめる。並びは一覧の順 */
export function groupMenu<T extends { group: string }>(items: T[]) {
  const groups: { name: string, items: T[] }[] = []
  for (const m of items) {
    const last = groups.at(-1)
    if (last?.name === m.group) last.items.push(m)
    else groups.push({ name: m.group, items: [m] })
  }
  return groups
}
