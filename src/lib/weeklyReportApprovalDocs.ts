import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { ApprovalDocItem } from '../types'

const STORAGE_KEY = 'weekly-report-approval-docs'

function normalizeBullets(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean)
}

export function loadApprovalDocs(periodKey: string): ApprovalDocItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, ApprovalDocItem[]>
    const items = all[periodKey]
    if (!items || !Array.isArray(items) || items.length === 0) return null
    return items
  } catch {
    return null
  }
}

function saveApprovalDocsLocal(periodKey: string, items: ApprovalDocItem[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, ApprovalDocItem[]>) : {}
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

function clearApprovalDocsLocal(periodKey: string) {
  saveApprovalDocsLocal(periodKey, [])
}

export function cleanApprovalDocs(items: ApprovalDocItem[]): ApprovalDocItem[] {
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
 * 승인서류 제출현황 저장 — 주간 ISSUE(weekly_report_issues)와 동일 형태.
 * - period_key당 1행, issues jsonb upsert
 * - 내용 있음 → 로컬 캐시 + Supabase upsert
 * - 내용 없음([]) → 로컬 캐시 제거 + 원격 행 삭제 (빈 [] 행을 남기지 않음)
 */
export async function saveApprovalDocs(
  periodKey: string,
  items: ApprovalDocItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const cleaned = cleanApprovalDocs(items)
  if (cleaned.length === 0) {
    clearApprovalDocsLocal(periodKey)
    return deleteApprovalDocsRemote(periodKey)
  }
  saveApprovalDocsLocal(periodKey, cleaned)
  return pushApprovalDocsRemote(periodKey, cleaned)
}

export async function fetchApprovalDocsRemote(
  periodKey: string,
): Promise<ApprovalDocItem[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('weekly_report_approval_docs')
    .select('issues')
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) {
    console.warn('[approval-docs] fetch failed', error.message)
    return null
  }
  if (!data || !Array.isArray(data.issues)) return null
  // 빈 [] 행은 “저장된 내용 없음”으로 취급 (주간 ISSUE와 동일)
  if (data.issues.length === 0) return null
  return data.issues as ApprovalDocItem[]
}

export async function pushApprovalDocsRemote(
  periodKey: string,
  items: ApprovalDocItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  if (items.length === 0) {
    return deleteApprovalDocsRemote(periodKey)
  }
  const { error } = await supabase.from('weekly_report_approval_docs').upsert(
    {
      period_key: periodKey,
      issues: items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_key' },
  )
  if (error) {
    console.warn('[approval-docs] save failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

async function deleteApprovalDocsRemote(
  periodKey: string,
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  const { error } = await supabase
    .from('weekly_report_approval_docs')
    .delete()
    .eq('period_key', periodKey)
  if (error) {
    console.warn('[approval-docs] delete failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

/**
 * 원격(Supabase)만 Source of Truth. 로컬은 캐시.
 * - 원격에 내용 있음 → 로컬 캐시 갱신 후 반환
 * - 원격 없음(또는 빈 []) → 로컬을 원격으로 올리지 않음
 */
export async function syncApprovalDocs(
  periodKey: string,
): Promise<ApprovalDocItem[]> {
  if (!isCloudSyncEnabled()) {
    return loadApprovalDocs(periodKey) ?? []
  }
  const remote = await fetchApprovalDocsRemote(periodKey)
  if (remote) {
    saveApprovalDocsLocal(periodKey, remote)
    return remote
  }
  clearApprovalDocsLocal(periodKey)
  return []
}
