/** 左のメニューとホームのカードに出すページの一覧（権限に応じて出し分ける） */
export function useMenu() {
  const { can } = usePermissions()
  return computed(() => [
    { to: '/', label: 'ホーム', icon: 'home' as const, home: false },
    { to: '/requests/new', label: '執行依頼', icon: 'send' as const, home: true },
    { to: '/entries', label: '台帳', icon: 'list' as const, home: true },
    { to: '/budget', label: '予算', icon: 'pie-chart' as const, home: true },
    ...(can('manageUsers') ? [{ to: '/users', label: 'ユーザー', icon: 'users' as const, home: true }] : []),
  ])
}
