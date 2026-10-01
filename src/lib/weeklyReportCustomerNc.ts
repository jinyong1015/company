import { getSupabase, isCloudSyncEnabled } from './supabase'
import type { CustomerNcItem } from '../types'
import {
  deleteNonconformityPhotosByPeriodKey,
  pruneNonconformityPhotosForPeriod,
} from './nonconformityPhotos'

const STORAGE_KEY = 'weekly-report-customer-nc'

export function loadCustomerNc(periodKey: string): CustomerNcItem[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, CustomerNcItem[]>
    const items = all[periodKey]
    if (!items || !Array.isArray(items) || items.length === 0) return null
    return items
  } catch {
    return null
  }
}

function saveCustomerNcLocal(periodKey: string, items: CustomerNcItem[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, CustomerNcItem[]>) : {}
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

function clearCustomerNcLocal(periodKey: string) {
  saveCustomerNcLocal(periodKey, [])
}

function isItemEmpty(item: CustomerNcItem) {
  return (
    !item.occurredOn.trim() &&
    !item.location.trim() &&
    !item.quantity.trim() &&
    !item.product?.trim() &&
    !item.defectName.trim() &&
    !item.actions.trim()
  )
}

export function cleanCustomerNcItems(items: CustomerNcItem[]): CustomerNcItem[] {
  return items
    .map((item, idx) => ({
      ...item,
      order: idx + 1,
      occurredOn: item.occurredOn.trim(),
      location: item.location.trim(),
      quantity: item.quantity.trim(),
      product: item.product?.trim() || undefined,
      defectName: item.defectName.trim(),
      actions: item.actions.trim(),
    }))
    .filter((item) => !isItemEmpty(item))
}

/**
 * 고객사 부적합 현황 저장 — 주간 ISSUE와 동일 기준.
 * - period_key당 1행 upsert
 * - 내용 있음 → 로컬 캐시 + Supabase upsert + 해당 기간 사진 prune
 * - 내용 없음([]) → 로컬 캐시 제거 + 원격 행 삭제 + 해당 period_key 사진 전부 삭제
 */
export async function saveCustomerNc(
  periodKey: string,
  items: CustomerNcItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const cleaned = cleanCustomerNcItems(items)
  if (cleaned.length === 0) {
    clearCustomerNcLocal(periodKey)
    await deleteNonconformityPhotosByPeriodKey(periodKey)
    return deleteCustomerNcRemote(periodKey)
  }
  saveCustomerNcLocal(periodKey, cleaned)
  const pushed = await pushCustomerNcRemote(periodKey, cleaned)
  if (pushed.ok) {
    await pruneNonconformityPhotosForPeriod(
      periodKey,
      cleaned.map((i) => i.id),
    )
  }
  return pushed
}

export async function fetchCustomerNcRemote(
  periodKey: string,
): Promise<CustomerNcItem[] | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data, error } = await supabase
    .from('weekly_report_customer_nc')
    .select('items')
    .eq('period_key', periodKey)
    .maybeSingle()
  if (error) {
    console.warn('[customer-nc] fetch failed', error.message)
    return null
  }
  if (!data || !Array.isArray(data.items)) return null
  // 빈 [] 행은 “저장된 현황 없음” (주간 ISSUE와 동일)
  if (data.items.length === 0) return null
  return data.items as CustomerNcItem[]
}

export async function pushCustomerNcRemote(
  periodKey: string,
  items: CustomerNcItem[],
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  if (items.length === 0) {
    return deleteCustomerNcRemote(periodKey)
  }
  const { error } = await supabase.from('weekly_report_customer_nc').upsert(
    {
      period_key: periodKey,
      items,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'period_key' },
  )
  if (error) {
    console.warn('[customer-nc] save failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

async function deleteCustomerNcRemote(
  periodKey: string,
): Promise<{ ok: boolean; synced: boolean; error?: string }> {
  const supabase = getSupabase()
  if (!supabase) {
    return { ok: true, synced: false }
  }
  const { error } = await supabase
    .from('weekly_report_customer_nc')
    .delete()
    .eq('period_key', periodKey)
  if (error) {
    console.warn('[customer-nc] delete failed', error.message)
    return { ok: false, synced: false, error: error.message }
  }
  return { ok: true, synced: true }
}

/**
 * 원격(Supabase)만 Source of Truth. 로컬은 캐시. (주간 ISSUE sync와 동일)
 * - 원격에 내용 있음 → 로컬 캐시 갱신 후 반환
 * - 원격 없음 → 로컬을 원격으로 올리지 않음, [] 반환
 */
export async function syncCustomerNc(
  periodKey: string,
): Promise<CustomerNcItem[]> {
  if (!isCloudSyncEnabled()) {
    return loadCustomerNc(periodKey) ?? []
  }
  const remote = await fetchCustomerNcRemote(periodKey)
  if (remote) {
    saveCustomerNcLocal(periodKey, remote)
    return remote
  }
  clearCustomerNcLocal(periodKey)
  return []
}
