import { and, eq } from 'drizzle-orm'

/** 収入の証憑のファイル（だれでも見られる） */
export default defineEventHandler(async (event) => {
  await requireUser(event)
  const id = Number(getRouterParam(event, 'id'))
  const fileId = Number(getRouterParam(event, 'fileId'))
  const db = useDb()
  const f = await db.query.incomeFiles.findFirst({ where: and(eq(schema.incomeFiles.id, fileId), eq(schema.incomeFiles.incomeId, id)) })
  if (!f) throw createError({ statusCode: 404 })
  const file = await db.query.attachments.findFirst({ where: eq(schema.attachments.id, f.attachmentId) })
  if (!file) throw createError({ statusCode: 404 })

  setResponseHeaders(event, {
    'Content-Type': file.contentType,
    'Content-Length': String(file.size),
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  return file.data
})
