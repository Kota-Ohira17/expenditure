/** 取り込んだ昨年の本予算・決算のファイル（種類・ファイル名・件数・合計・日時） */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  return await referenceFiles()
})
