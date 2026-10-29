import { MAX_ATTACHMENT_BYTES } from '#shared/constants'

/** payload（JSON）と添付ファイルを multipart で送る。エラーはメッセージの配列にする */
export function useSubmit<T>(url: string) {
  const errors = ref<string[]>([])
  const pending = ref(false)

  async function submit(payload: unknown, file?: File | null): Promise<T | undefined> {
    errors.value = []
    pending.value = true
    try {
      const form = new FormData()
      form.append('payload', JSON.stringify(payload))
      if (file) {
        const prepared = await shrinkImage(file)
        if (prepared.size > MAX_ATTACHMENT_BYTES) {
          errors.value = ['添付ファイルは4MB以下にしてください（PDFは圧縮するか、ページを分けてください）。']
          return
        }
        form.append('attachment', prepared, prepared.name)
      }
      return await $fetch<T>(url, { method: 'POST', body: form })
    }
    catch (error) {
      errors.value = toMessages(error)
    }
    finally {
      pending.value = false
    }
  }

  return { submit, errors, pending }
}

const SHRINK_THRESHOLD = 1.5 * 1024 * 1024
const MAX_EDGE = 2000

/**
 * スマホ写真はそのままだと 4MB を超えやすいので、長辺 2000px の JPEG に縮小する。
 * HEIC・WebP はサーバーが受け付けないので、大きさにかかわらず JPEG にする。
 * ブラウザが読めない形式（Chrome での HEIC など）はそのまま返す（サーバーで断られる）。
 */
async function shrinkImage(file: File): Promise<File> {
  const mustConvert = /^image\/(webp|heic)$/.test(file.type)
  if (!mustConvert && (!/^image\/(jpeg|png)$/.test(file.type) || file.size <= SHRINK_THRESHOLD)) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob || (!mustConvert && blob.size >= file.size)) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  }
  catch {
    return file
  }
}

export function toMessages(error: unknown): string[] {
  const data = (error as { data?: { data?: unknown, message?: string } }).data
  if (Array.isArray(data?.data)) return data.data as string[]
  return [data?.message ?? '送信に失敗しました。']
}
