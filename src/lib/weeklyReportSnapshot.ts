import { getSupabase, isCloudSyncEnabled } from './supabase'
import type {
  WeeklyIssue,
  WeeklyReportDetail,
  WeeklyReportMetric,
  WeeklyReportMonthlyView,
} from '../types'

/** Supabase에 저장되는 스냅샷 본문 */
export type WeeklyReportSnapshotPayload = {
  period: WeeklyReportDetail['period']
  title: string
  productionRows: WeeklyReportDetail['productionRows']
  issues: WeeklyIssue[]
  worst5: WeeklyReportDetail['worst5']
  worst5Thresholds: WeeklyReportDetail['worst5Thresholds']
  /** 월별 현황(지표별). 구버전 스냅샷에는 없을 수 있음 */
  monthlyByMetric?: Partial<Record<WeeklyReportMetric, WeeklyReportMonthlyView>>
  selectedMonthKey?: string
  metric?: WeeklyReportMetric
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

export async function listWeeklyReportSnapshots(
  periodKey: string,
): Promise<{ ok: boolean; items: WeeklyReportSnapshotMeta[]; error?: string }> {
  if (!isCloudSyncEnabled()) {
    return { ok: false, items: [], error: '공유 저장소가 설정되지 않았습니다.' }
  }
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: false, items: [], error: '공유 저장소에 연결할 수 없습니다.' }
  }

  const { data, error } = await supabase
    .from('weekly_report_snapshots')
    .select('id, period_key, title, note, created_at')
    .eq('period_key', periodKey)
    .order('created_at', { ascending: false })

  if (error) {
    return { ok: false, items: [], error: error.message }
  }

  return {
    ok: true,
    items: ((data ?? []) as DbRow[]).map(mapMeta),
  }
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
