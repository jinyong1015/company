import type { InspectionRecord } from '../types'
import { fetchWeeklyReportSnapshot } from './weeklyReportSnapshot'

type CacheEntry = {
  records: InspectionRecord[]
  missingDetail: boolean
}

export type SnapshotDetailSource = 'main' | 'vina'

const memory = new Map<string, CacheEntry>()
const STORAGE_PREFIX = 'weekly-snap-detail:'
const VINA_STORAGE_PREFIX = 'weekly-snap-vina-detail:'

function memoryKey(snapshotId: string, source: SnapshotDetailSource) {
  return source === 'vina' ? `vina:${snapshotId}` : snapshotId
}

function storageKey(snapshotId: string, source: SnapshotDetailSource) {
  return source === 'vina'
    ? `${VINA_STORAGE_PREFIX}${snapshotId}`
    : `${STORAGE_PREFIX}${snapshotId}`
}

function payloadField(source: SnapshotDetailSource) {
  return source === 'vina' ? 'vinaDetailRecords' : 'detailRecords'
}

export function cacheWeeklySnapshotDetailRecords(
  snapshotId: string,
  records: InspectionRecord[],
  missingDetail = false,
  source: SnapshotDetailSource = 'main',
) {
  const entry: CacheEntry = { records, missingDetail }
  memory.set(memoryKey(snapshotId, source), entry)
  try {
    sessionStorage.setItem(
      storageKey(snapshotId, source),
      JSON.stringify(entry),
    )
  } catch {
    /* quota / private mode */
  }
}

/** VINA WORST 5 드릴다운용 원본 행 캐시 */
export function cacheWeeklySnapshotVinaDetailRecords(
  snapshotId: string,
  records: InspectionRecord[],
  missingDetail = false,
) {
  cacheWeeklySnapshotDetailRecords(snapshotId, records, missingDetail, 'vina')
}

export function getCachedWeeklySnapshotDetailRecords(
  snapshotId: string,
  source: SnapshotDetailSource = 'main',
): CacheEntry | null {
  const hit = memory.get(memoryKey(snapshotId, source))
  if (hit) return hit
  try {
    const raw = sessionStorage.getItem(storageKey(snapshotId, source))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry | InspectionRecord[]
    // 구 캐시 형식(배열만) 호환 — main만
    if (Array.isArray(parsed)) {
      if (source !== 'main') return null
      const entry: CacheEntry = { records: parsed, missingDetail: false }
      memory.set(memoryKey(snapshotId, source), entry)
      return entry
    }
    if (!parsed || !Array.isArray(parsed.records)) return null
    memory.set(memoryKey(snapshotId, source), parsed)
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
  source: SnapshotDetailSource = 'main',
): Promise<WeeklySnapshotDetailLoadResult> {
  const cached = getCachedWeeklySnapshotDetailRecords(snapshotId, source)
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

  const field = payloadField(source)
  const hasField = Object.prototype.hasOwnProperty.call(
    result.record.payload,
    field,
  )
  const records =
    source === 'vina'
      ? (result.record.payload.vinaDetailRecords ?? [])
      : (result.record.payload.detailRecords ?? [])
  const missingDetail = !hasField
  cacheWeeklySnapshotDetailRecords(snapshotId, records, missingDetail, source)

  return {
    ok: true,
    records,
    missingDetail,
  }
}
