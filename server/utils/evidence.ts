import { asc, eq, inArray } from 'drizzle-orm'
import { can } from '../../shared/roles'
import { shortenItemNumbers } from '../../shared/itemNumbers'
import type { Entry } from '../db/schema'

type SessionUser = { email: string, role: Parameters<typeof can>[0] }

/** 台帳から証憑を付けられるか（申請者本人か、財務局長・管理者） */
export function canSubmitEvidence(user: SessionUser, entry: Pick<Entry, 'applicantEmail'>) {
  return entry.applicantEmail === user.email || can(user.role, 'executeEntries')
}

/** 付けた証憑を消せるか（付けた本人か、財務局長・管理者） */
export function canDeleteEvidence(user: SessionUser, file: { uploadedBy: string }) {
  return file.uploadedBy === user.email || can(user.role, 'executeEntries')
}

/**
 * 証憑のファイル名（拡張子なし）。受付番号を先頭にして、保存したときに番号順に並ぶようにする。
 * 例: E-012_out01-04-01~03_レンタカー代_領収書_14900円（同じ申請の2枚目からは末尾に _2, _3）
 */
export function evidenceLabel(entry: Pick<Entry, 'seq' | 'itemNumber' | 'itemName'>, kind: string, amount: number | null, nth: number) {
  return [
    entry.seq,
    shortenItemNumbers(entry.itemNumber),
    entry.itemName,
    kind,
    amount != null ? `${amount}円` : '',
    nth > 1 ? String(nth) : '',
  ].filter(Boolean).join('_')
}

/** 申請ごとの証憑の一覧（ファイル名つき、付けた順） */
export async function evidencesOf(entryIds: number[]) {
  if (!entryIds.length) return new Map<number, EvidenceView[]>()
  const ev = schema.evidenceFiles
  const rows = await useDb()
    .select({
      id: ev.id,
      entryId: ev.entryId,
      kind: ev.kind,
      amount: ev.amount,
      date: ev.date,
      uploadedBy: ev.uploadedBy,
      createdAt: ev.createdAt,
      fileName: schema.attachments.fileName,
    })
    .from(ev)
    .innerJoin(schema.attachments, eq(schema.attachments.id, ev.attachmentId))
    .where(inArray(ev.entryId, entryIds))
    .orderBy(asc(ev.id))
  return Map.groupBy(rows, r => r.entryId)
}

export type EvidenceView = {
  id: number
  entryId: number
  kind: string
  amount: number | null
  date: string | null
  uploadedBy: string
  createdAt: Date
  fileName: string
}

/** 申請の一覧に証憑の一覧を付ける */
export async function withEvidences<T extends Entry>(rows: T[]): Promise<(T & { evidences: EvidenceView[] })[]> {
  const byEntry = await evidencesOf(rows.map(r => r.id))
  return rows.map(r => ({ ...r, evidences: byEntry.get(r.id) ?? [] }))
}
