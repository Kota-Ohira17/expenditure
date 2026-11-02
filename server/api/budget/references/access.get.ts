/** 自分が昨年の本予算・決算を取り込めるか（取り込みの欄を出すかに使う） */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return { canImport: await canImportReferences(user) }
})
