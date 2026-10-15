import { extname } from 'node:path'
import type { H3Event } from 'h3'
import { MAX_ATTACHMENT_BYTES } from '../../shared/constants'

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/webp']

type Part = NonNullable<Awaited<ReturnType<typeof readMultipartFormData>>>[number]

/** multipart の `payload`（JSON）と `attachment`（ファイル）を取り出す */
export async function readPayloadAndFile(event: H3Event) {
  const parts = (await readMultipartFormData(event)) ?? []
  const payloadPart = parts.find(p => p.name === 'payload')
  if (!payloadPart) throw createError({ statusCode: 400, message: 'payload がありません。' })
  let payload: unknown
  try {
    payload = JSON.parse(payloadPart.data.toString('utf8'))
  }
  catch {
    throw createError({ statusCode: 400, message: 'payload が JSON ではありません。' })
  }
  const file = parts.find(p => p.name === 'attachment' && p.filename && p.data.length > 0)
  if (file) {
    if (file.data.length > MAX_ATTACHMENT_BYTES) {
      throw createError({ statusCode: 400, message: 'ファイルは4MB以下にしてください。' })
    }
    if (!file.type || !ALLOWED_TYPES.includes(file.type)) {
      throw createError({ statusCode: 400, message: 'PDF または画像ファイルを添付してください。' })
    }
  }
  return { payload, file }
}

/** 添付ファイルを DB に保存し、ID を返す。ファイル名は旧GASと同じく「担当 項目名 種類」にする */
export async function saveAttachment(file: Part, label: string) {
  const safeLabel = label.replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 80)
  const [row] = await useDb()
    .insert(schema.attachments)
    .values({
      fileName: `${safeLabel}${extname(file.filename ?? '').toLowerCase()}`,
      contentType: file.type!,
      size: file.data.length,
      data: file.data,
      createdAt: new Date(),
    })
    .returning({ id: schema.attachments.id })
  return row!.id
}

/** zod のエラーを 400 にする */
export function parseOr400<T>(result: { success: true, data: T } | { success: false, error: { issues: { message: string }[] } }) {
  if (!result.success) {
    throw createError({ statusCode: 400, message: '入力内容に誤りがあります。', data: result.error.issues.map(i => i.message) })
  }
  return result.data
}
