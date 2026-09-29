import type { InspectionRecord } from '../types'
import { fetchWeeklyReportSnapshot } from './weeklyReportSnapshot'

type CacheEntry = {
  records: InspectionRecord[]
  missingDetail: boolean
}

const memory = new Map<string, CacheEntry>()
const STORAGE_PREFIX = 'weekly-snap-detail:'

export function cacheWeeklySnapshotDetailRecords(
  snapshotId: string,
  records: InspectionRecord[],
  missingDetail = false,
) {
  const entry: CacheEntry = { records, missingDetail }
  memory.set(snapshotId, entry)
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${snapshotId}`, JSON.stringify(entry))
  } catch {
    /* quota / private mode */
  }
}

export function getCachedWeeklySnapshotDetailRecords(
  snapshotId: string,
): CacheEntry | null {
  const hit = memory.get(snapshotId)
  if (hit) return hit
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${snapshotId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry | InspectionRecord[]
    // 구 캐시 형식(배열만) 호환
    if (Array.isArray(parsed)) {
      const entry: CacheEntry = { records: parsed, missingDetail: false }
      memory.set(snapshotId, entry)
      return entry
    }
    if (!parsed || !Array.isArray(parsed.records)) return null
    memory.set(snapshotId, parsed)
    return parsed
  } catch {
    return null
  }
}

export type WeeklySnapshotDetailLoadResult = {
  ok: boolean
  records: InspectionRecord[]
  /** 구버전 스냅샷 등 detailRecords 미포함 */
  missingDetail: boolean
  error?: string
}

export async function loadWeeklySnapshotDetailRecords(
  snapshotId: string,
): Promise<WeeklySnapshotDetailLoadResult> {
  const cached = getCachedWeeklySnapshotDetailRecords(snapshotId)
  if (cached) {
    return {
      ok: true,
      records: cached.records,
      missingDetail: cached.missingDetail,
    }
  }

  const result = await fetchWeeklyReportSnapshot(snapshotId)
  if (!result.ok || !result.record) {
    return {
      ok: false,
      records: [],
      missingDetail: false,
      error: result.error ?? '스냅샷을 불러오지 못했습니다.',
    }
  }

  const hasField = Object.prototype.hasOwnProperty.call(
    result.record.payload,
    'detailRecords',
  )
  const records = result.record.payload.detailRecords ?? []
  const missingDetail = !hasField
  cacheWeeklySnapshotDetailRecords(snapshotId, records, missingDetail)

  return {
    ok: true,
    records,
    missingDetail,
  }
}
