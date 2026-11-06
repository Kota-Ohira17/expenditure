import { and, asc, desc, eq, inArray, type SQL } from 'drizzle-orm'
import { can } from '../../shared/roles'
import { shortenItemNumbers } from '../../shared/itemNumbers'
import type { Entry, EntryItem } from '../db/schema'
import type { SessionUser } from './auth'

/**
 * 収入の記録。③執行依頼DBに kind=income で入れる（entries・entry_items・evidence_files を支出と共有する）。
 * 支出の執行依頼と同じく、だれでも記録でき、だれでも見られる。財務局長・管理者が入金を確かめると確認済みになる。
 * 入金日は deadline、受け取り方は payment_method、入金を確かめた時刻と人は executed_at・executed_by に入れる。
 */

/** 収入の記録を、列の意味が分かる形にしたもの */
export function toIncome(entry: Entry & { items: EntryItem[] }) {
  const item = entry.items[0]
  const details = entry.details as { payer?: string, account?: string | null }
  return {
    id: entry.id,
    seq: entry.seq,
    status: entry.status,
    applicantEmail: entry.applicantEmail,
    applicantName: entry.applicantName,
    department: entry.department,
    inCharge: entry.inCharge,
    lineKey: item?.lineKey ?? null,
    itemId: item?.itemId ?? '',
    itemNumber: entry.itemNumber,
    itemName: entry.itemName,
    budgetAmount: item?.budgetAmount ?? null,
    amount: entry.amount ?? 0,
    receivedOn: entry.deadline ?? '',
    payer: details.payer ?? '',
    method: entry.paymentMethod ?? '',
    account: details.account ?? null,
    remark: entry.remark,
    details: entry.details,
    confirmedAt: entry.executedAt,
    confirmedBy: entry.executedBy,
    createdAt: entry.createdAt,
  }
}
export type IncomeRecord = ReturnType<typeof toIncome>

/** 収入の記録を読む（新しい順） */
export async function listIncomes(where?: SQL) {
  const rows = await useDb().select().from(schema.entries)
    .where(and(eq(schema.entries.kind, 'income'), where))
    .orderBy(desc(schema.entries.createdAt))
  return (await withItems(rows)).map(toIncome)
}

/** 収入の記録を1件読む */
export async function findIncome(id: number) {
  const [income] = await listIncomes(eq(schema.entries.id, id))
  return income ?? null
}

/** 収入の証憑のファイル名（拡張子なし）。「項目番号_担当名_収入項目名_月日（4桁）」 */
export function incomeFileLabel(income: Pick<IncomeRecord, 'itemNumber' | 'inCharge' | 'itemName' | 'receivedOn'>, nth: number) {
  return [
    shortenItemNumbers(income.itemNumber),
    income.inCharge,
    income.itemName,
    income.receivedOn.slice(5).replace('-', ''),
    nth > 1 ? String(nth) : '',
  ].filter(Boolean).join('_')
}

/** 証憑を外せるのは、付けた本人と財務局長・管理者 */
export const canDeleteIncomeFile = (user: SessionUser, file: { uploadedBy: string }) => file.uploadedBy === user.email || can(user.role, 'executeEntries')

/** 収入ごとの証憑（ファイル名つき。付けた順） */
export async function incomeFilesOf(ids: number[]) {
  const result = new Map<number, { id: number, kind: string, uploadedBy: string, fileName: string, createdAt: Date }[]>()
  if (!ids.length) return result
  const db = useDb()
  const files = await db.select({
    id: schema.evidenceFiles.id,
    incomeId: schema.evidenceFiles.entryId,
    kind: schema.evidenceFiles.kind,
    uploadedBy: schema.evidenceFiles.uploadedBy,
    createdAt: schema.evidenceFiles.createdAt,
    fileName: schema.attachments.fileName,
  }).from(schema.evidenceFiles)
    .innerJoin(schema.attachments, eq(schema.attachments.id, schema.evidenceFiles.attachmentId))
    .where(inArray(schema.evidenceFiles.entryId, ids))
    .orderBy(asc(schema.evidenceFiles.createdAt))
  for (const { incomeId, ...f } of files) result.set(incomeId, [...(result.get(incomeId) ?? []), f])
  return result
}

/** 画面に返す形（証憑つき。確認した人は出さない） */
export async function withIncomeFiles(rows: IncomeRecord[]) {
  const files = await incomeFilesOf(rows.map(r => r.id))
  return rows.map(({ confirmedBy: _by, ...r }) => ({ ...r, files: files.get(r.id) ?? [] }))
}
