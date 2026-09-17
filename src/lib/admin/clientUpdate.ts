import type { InspectionRecord } from '../../types'
import { AdminAuthError } from './errors'

const SNAPSHOT_KEYS = [
  'date',
  'workType',
  'inspector',
  'team',
  'productType',
  'lot',
  'worker',
  'equipment',
  'product',
  'moldNo',
  'start',
  'end',
  'duration',
  'qty',
  'pass',
  'fail',
  'failRate',
  'mainDefect',
  'scrapCost',
  'hours',
  'rowClass',
  'defects',
  'extras',
  'issues',
] as const

export type RecordSnapshot = Record<(typeof SNAPSHOT_KEYS)[number], unknown>

export function snapshotRecord(record: InspectionRecord): RecordSnapshot {
  const out = {} as RecordSnapshot
  for (const key of SNAPSHOT_KEYS) {
    out[key] = record[key] ?? null
  }
  return out
}

export function diffRecordFields(
  before: RecordSnapshot,
  after: RecordSnapshot,
): string[] {
  return SNAPSHOT_KEYS.filter((key) => {
    return JSON.stringify(before[key]) !== JSON.stringify(after[key])
  })
}

export function recordStatus(record: InspectionRecord) {
  return {
    isAnalysisEligible: record.rowClass !== 'error' && record.rowClass !== 'excluded',
    errorCodes: record.issues ?? [],
  }
}

export async function authorizeInspectionUpdate(input: {
  id: string
  reason: string
  before: InspectionRecord
  after: InspectionRecord
}): Promise<void> {
  const beforeSnap = snapshotRecord(input.before)
  const afterSnap = snapshotRecord(input.after)
  const fields = diffRecordFields(beforeSnap, afterSnap)

  const res = await fetch(`/api/inspection-data/${encodeURIComponent(input.id)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reason: input.reason,
      before: beforeSnap,
      after: afterSnap,
      fields,
      statusBefore: recordStatus(input.before),
      statusAfter: recordStatus(input.after),
    }),
  })

  const data = (await res.json().catch(() => null)) as { message?: string } | null

  if (res.status === 401 || res.status === 403) {
    throw new AdminAuthError(
      data?.message ??
        '관리자 세션이 만료되었습니다. 검사 DATA를 수정하려면 다시 로그인해 주세요.',
    )
  }

  if (!res.ok) {
    throw new Error(data?.message ?? '수정 권한이 없거나 저장에 실패했습니다.')
  }
}
