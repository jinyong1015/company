import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { MeasurementStatusItem } from '../types'

const STORAGE_KEY = 'weekly-report-measurement-status'

function normalizeBullets(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export function loadMeasurementStatus(
  periodKey: string,
): MeasurementStatusItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, MeasurementStatusItem[]>
    const items = all[periodKey]
    if (!items || !Array.isArray(items) || items.length === 0) return null
    return items
  } catch {
    return null
  }
}

function saveMeasurementStatusLocal(
  periodKey: string,
  items: MeasurementStatusItem[],
) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw
      ? (JSON.parse(raw) as Record<string, MeasurementStatusItem[]>)
      : {}
    if (items.length === 0) {
      delete all[periodKey]
    } else {
      all[periodKey] = items
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

function clearMeasurementStatusLocal(periodKey: string) {
  saveMeasurementStatusLocal(periodKey, [])
}

export function cleanMeasurementStatus(
  items: MeasurementStatusItem[],
): MeasurementStatusItem[] {
  return items
    .map((item, idx) => ({
      ...item,
      order: idx + 1,
      title: item.title.trim(),
      bullets: normalizeBullets(item.bullets),
    }))
    .filter((item) => item.title || item.bullets.length > 0)
}

/**
 * 측정현황 저장 — 주간 ISSUE / 승인서류와 동일 형태.
 * - period_key당 1행, issues jsonb upsert
 * - 내용 있음 → 로컬 캐시 + Supabase upsert
 * - 내용 없음([]) → 로컬 캐시 제거 + 원격 행 삭제
 */
export async function saveMeasurementStatus(
  periodKey: string,
  items: MeasurementStatusItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const cleaned = cleanMeasurementStatus(items)
  if (cleaned.length === 0) {
    clearMeasurementStatusLocal(periodKey)
    return deleteMeasurementStatusRemote(periodKey)
  }
  saveMeasurementStatusLocal(periodKey, cleaned)
  return pushMeasurementStatusRemote(periodKey, cleaned)
}

export async function fetchMeasurementStatusRemote(
  periodKey: string,
): Promise<MeasurementStatusItem[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('weekly_report_measurement_status')
    .select('issues')
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) {
    console.warn('[measurement-status] fetch failed', error.message)
    return null
  }
  if (!data || !Array.isArray(data.issues)) return null
  if (data.issues.length === 0) return null
  return data.issues as MeasurementStatusItem[]
}

export async function pushMeasurementStatusRemote(
  periodKey: string,
  items: MeasurementStatusItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  if (items.length === 0) {
    return deleteMeasurementStatusRemote(periodKey)
  }
  const { error } = await supabase
    .from('weekly_report_measurement_status')
    .upsert(
      {
        period_key: periodKey,
        issues: items,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'period_key' },
    )
  if (error) {
    console.warn('[measurement-status] save failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

async function deleteMeasurementStatusRemote(
  periodKey: string,
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  const { error } = await supabase
    .from('weekly_report_measurement_status')
    .delete()
    .eq('period_key', periodKey)
  if (error) {
    console.warn('[measurement-status] delete failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

/**
 * 원격(Supabase)만 Source of Truth. 로컬은 캐시.
 */
export async function syncMeasurementStatus(
  periodKey: string,
): Promise<MeasurementStatusItem[]> {
  if (!isCloudSyncEnabled()) {
    return loadMeasurementStatus(periodKey) ?? []
  }
  const remote = await fetchMeasurementStatusRemote(periodKey)
  if (remote) {
    saveMeasurementStatusLocal(periodKey, remote)
    return remote
  }
  clearMeasurementStatusLocal(periodKey)
  return []
}
