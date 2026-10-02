import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { NonconformityPhotoRow } from './nonconformityPhotos'
import type {
  ApprovalDocItem,
  CustomerNcItem,
  InspectionRecord,
  InfoShareItem,
  MeasurementStatusItem,
  WeeklyIssue,
  WeeklyReportDetail,
  WeeklyReportMetric,
  WeeklyReportMonthlyView,
} from '../types'

/** 스냅샷에 동결 저장되는 부적합 사진 메타 (signed URL 제외) */
export type CustomerNcPhotoSnapshot = NonconformityPhotoRow

/** Supabase에 저장되는 스냅샷 본문 */
export type WeeklyReportSnapshotPayload = {
  period: WeeklyReportDetail['period']
  title: string
  productionRows: WeeklyReportDetail['productionRows']
  issues: WeeklyIssue[]
  /** 고객사 부적합 현황. 구버전 스냅샷에는 없을 수 있음 */
  customerNc?: CustomerNcItem[]
  /**
   * 고객사 부적합 사진 (행 id → 메타). Storage 경로 포함.
   * 확정본 시점의 사진을 보존. 구버전 스냅샷에는 없을 수 있음.
   */
  customerNcPhotos?: Record<string, CustomerNcPhotoSnapshot[]>
  /** 승인서류 제출현황. 구버전 스냅샷에는 없을 수 있음 */
  approvalDocs?: ApprovalDocItem[]
  /** 측정현황. 구버전 스냅샷에는 없을 수 있음 */
  measurementStatus?: MeasurementStatusItem[]
  /** 정보공유 및 대외일정. 구버전 스냅샷에는 없을 수 있음 */
  infoShare?: InfoShareItem[]
  worst5: WeeklyReportDetail['worst5']
  worst5Thresholds: WeeklyReportDetail['worst5Thresholds']
  /** 월별 현황(지표별). 구버전 스냅샷에는 없을 수 있음 */
  monthlyByMetric?: Partial<Record<WeeklyReportMetric, WeeklyReportMonthlyView>>
  selectedMonthKey?: string
  metric?: WeeklyReportMetric
  /**
   * WORST 5 품번의 해당 기간 원본 검사 행.
   * 품번·성형작업자·검사자 상세가 현재 업로드 DATA와 무관히 동일하게 보이도록 보존.
   * 구버전 스냅샷에는 없을 수 있음.
   */
  detailRecords?: InspectionRecord[]
}

export type WeeklyReportSnapshotMeta = {
  id: string
  periodKey: string
  title: string
  note: string
  createdAt: string
}

export type WeeklyReportSnapshotRecord = WeeklyReportSnapshotMeta & {
  payload: WeeklyReportSnapshotPayload
}

type DbRow = {
  id: string
  period_key: string
  title: string
  note: string | null
  snapshot: WeeklyReportSnapshotPayload
  created_at: string
}

function mapMeta(row: Pick<DbRow, 'id' | 'period_key' | 'title' | 'note' | 'created_at'>): WeeklyReportSnapshotMeta {
  return {
    id: row.id,
    periodKey: row.period_key,
    title: row.title,
    note: row.note ?? '',
    createdAt: row.created_at,
  }
}

export function formatSnapshotTime(iso: string) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${hh}:${mm}`
  } catch {
    return iso
  }
}

/** `2026-09-W3` / `custom:2026-09-01:2026-09-07` 표시용 */
export function formatSnapshotPeriodKey(periodKey: string) {
  if (periodKey.startsWith('custom:')) {
    const [, start, end] = periodKey.split(':')
    if (!start || !end) return periodKey
    return start === end ? start : `${start} ~ ${end}`
  }
  const m = periodKey.match(/^(\d{4})-(\d{2})-W(\d+)$/)
  if (m) return `${Number(m[2])}월 ${m[3]}주차`
  return periodKey
}

function monthDateRange(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return null
  const start = `${monthKey}-01`
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${monthKey}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** 스냅샷 period_key가 선택 월에 속하는가 (주차 키 또는 조회기간 겹침) */
export function periodKeyBelongsToMonth(periodKey: string, monthKey: string) {
  if (!monthKey || !/^\d{4}-\d{2}$/.test(monthKey)) return false
  if (periodKey.startsWith(`${monthKey}-W`)) return true
  if (periodKey.startsWith('custom:')) {
    const [, start, end] = periodKey.split(':')
    const range = monthDateRange(monthKey)
    if (!start || !end || !range) return false
    return start <= range.end && end >= range.start
  }
  return false
}

/**
 * 선택 월의 스냅샷 목록.
 * - 주차 키 `YYYY-MM-Wn` → 해당 월
 * - `custom:start:end` → 조회기간이 해당 월과 겹치면 포함
 */
export async function listWeeklyReportSnapshots(
  monthKey: string,
): Promise<{ ok: boolean; items: WeeklyReportSnapshotMeta[]; error?: string }> {
  if (!isCloudSyncEnabled()) {
    return { ok: false, items: [], error: '공유 저장소가 설정되지 않았습니다.' }
  }
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, items: [], error: '공유 저장소에 연결할 수 없습니다.' }
  }
  if (!/^\d{4}-\d{2}$/.test(monthKey)) {
    return { ok: false, items: [], error: '월 키가 올바르지 않습니다.' }
  }

  const selectCols = 'id, period_key, title, note, created_at'
  const [weekResult, customResult] = await Promise.all([
    supabase
      .from('weekly_report_snapshots')
      .select(selectCols)
      .like('period_key', `${monthKey}-W%`)
      .order('created_at', { ascending: false }),
    supabase
      .from('weekly_report_snapshots')
      .select(selectCols)
      .like('period_key', 'custom:%')
      .order('created_at', { ascending: false }),
  ])

  if (weekResult.error) {
    return { ok: false, items: [], error: weekResult.error.message }
  }
  if (customResult.error) {
    return { ok: false, items: [], error: customResult.error.message }
  }

  const byId = new Map<string, WeeklyReportSnapshotMeta>()
  for (const row of (weekResult.data ?? []) as DbRow[]) {
    byId.set(row.id, mapMeta(row))
  }
  for (const row of (customResult.data ?? []) as DbRow[]) {
    const meta = mapMeta(row)
    if (periodKeyBelongsToMonth(meta.periodKey, monthKey)) {
      byId.set(meta.id, meta)
    }
  }

  const items = [...byId.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )

  return { ok: true, items }
}

export async function fetchWeeklyReportSnapshot(
  id: string,
): Promise<{ ok: boolean; record?: WeeklyReportSnapshotRecord; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, error: '공유 저장소에 연결할 수 없습니다.' }
  }

  const { data, error } = await supabase
    .from('weekly_report_snapshots')
    .select('id, period_key, title, note, snapshot, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: '스냅샷을 찾을 수 없습니다.' }

  const row = data as DbRow
  return {
    ok: true,
    record: {
      ...mapMeta(row),
      payload: row.snapshot,
    },
  }
}

export async function saveWeeklyReportSnapshot(input: {
  periodKey: string
  title: string
  note?: string
  payload: WeeklyReportSnapshotPayload
}): Promise<{ ok: boolean; id?: string; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, error: '공유 저장소에 연결할 수 없습니다.' }
  }

  const { data, error } = await supabase
    .from('weekly_report_snapshots')
    .insert({
      period_key: input.periodKey,
      title: input.title,
      note: input.note?.trim() ?? '',
      snapshot: input.payload,
    })
    .select('id')
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (data as { id: string } | null)?.id }
}

export async function deleteWeeklyReportSnapshot(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, error: '공유 저장소에 연결할 수 없습니다.' }
  }

  const { error } = await supabase
    .from('weekly_report_snapshots')
    .delete()
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
