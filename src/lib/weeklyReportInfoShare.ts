import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { InfoShareItem } from '../types'

const STORAGE_KEY = 'weekly-report-info-share'

function normalizeBullets(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export function loadInfoShare(periodKey: string): InfoShareItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, InfoShareItem[]>
    const items = all[periodKey]
    if (!items || !Array.isArray(items) || items.length === 0) return null
    return items
  } catch {
    return null
  }
}

function saveInfoShareLocal(periodKey: string, items: InfoShareItem[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, InfoShareItem[]>) : {}
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

function clearInfoShareLocal(periodKey: string) {
  saveInfoShareLocal(periodKey, [])
}

export function cleanInfoShare(items: InfoShareItem[]): InfoShareItem[] {
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
 * 정보공유 및 대외일정 저장 — 측정현황·주간 ISSUE와 동일 형태.
 */
export async function saveInfoShare(
  periodKey: string,
  items: InfoShareItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const cleaned = cleanInfoShare(items)
  if (cleaned.length === 0) {
    clearInfoShareLocal(periodKey)
    return deleteInfoShareRemote(periodKey)
  }
  saveInfoShareLocal(periodKey, cleaned)
  return pushInfoShareRemote(periodKey, cleaned)
}

export async function fetchInfoShareRemote(
  periodKey: string,
): Promise<InfoShareItem[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('weekly_report_info_share')
    .select('issues')
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) {
    console.warn('[info-share] fetch failed', error.message)
    return null
  }
  if (!data || !Array.isArray(data.issues)) return null
  if (data.issues.length === 0) return null
  return data.issues as InfoShareItem[]
}

export async function pushInfoShareRemote(
  periodKey: string,
  items: InfoShareItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  if (items.length === 0) {
    return deleteInfoShareRemote(periodKey)
  }
  const { error } = await supabase.from('weekly_report_info_share').upsert(
    {
      period_key: periodKey,
      issues: items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_key' },
  )
  if (error) {
    console.warn('[info-share] save failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

async function deleteInfoShareRemote(
  periodKey: string,
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  const { error } = await supabase
    .from('weekly_report_info_share')
    .delete()
    .eq('period_key', periodKey)
  if (error) {
    console.warn('[info-share] delete failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

export async function syncInfoShare(
  periodKey: string,
): Promise<InfoShareItem[]> {
  if (!isCloudSyncEnabled()) {
    return loadInfoShare(periodKey) ?? []
  }
  const remote = await fetchInfoShareRemote(periodKey)
  if (remote) {
    saveInfoShareLocal(periodKey, remote)
    return remote
  }
  clearInfoShareLocal(periodKey)
  return []
}
