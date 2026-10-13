import { normalizeProductType } from './groups'
import { itemMatchKey, preferDisplayItem } from './itemMatchKey'
import type { DefectType, InspectionRecord } from '../types'

export type DailyTypeBucket = 'grommet' | 'seal'

export type TypeQtyNgSummary = {
  id: DailyTypeBucket
  label: string
  qty: number
  fail: number
  /** fail/qty × 100 */
  ngRatePercent: number
  scrapCost: number
}

export type ProductRankRow = {
  product: string
  qty: number
  fail: number
  failRatePercent: number
  scrapCost: number
}

function isSealType(type: string) {
  const t = (normalizeProductType(type) || type).toLowerCase()
  return t.includes('seal') || type.includes('실링') || type.includes('씰')
}

function isGrommetType(type: string) {
  const n = normalizeProductType(type) || type
  if (n === 'GROMMET') return true
  const lower = type.toLowerCase()
  return (
    lower.includes('grommet') ||
    type.includes('그로멧') ||
    type.includes('그로메트') ||
    type.includes('유압')
  )
}

export function dailyTypeBucketOf(
  productType: string,
): DailyTypeBucket | null {
  if (isSealType(productType)) return 'seal'
  if (isGrommetType(productType)) return 'grommet'
  return null
}

export function latestInspectionDate(records: InspectionRecord[]): string | null {
  let max: string | null = null
  for (const r of records) {
    const d = r.date?.trim()
    if (!d) continue
    if (!max || d > max) max = d
  }
  return max
}

export function recordsForDay(
  records: InspectionRecord[],
  day: string | null,
): InspectionRecord[] {
  if (!day) return []
  return records.filter((r) => r.date === day)
}

/** 조회일이 속한 달의 1일 ~ 조회일(포함) 누적 */
export function monthToDateRange(day: string | null): {
  startDate: string
  endDate: string
} | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((day ?? '').trim())
  if (!m) return null
  return {
    startDate: `${m[1]}-${m[2]}-01`,
    endDate: `${m[1]}-${m[2]}-${m[3]}`,
  }
}

export function recordsForMonthToDate(
  records: InspectionRecord[],
  day: string | null,
): InspectionRecord[] {
  const range = monthToDateRange(day)
  if (!range) return []
  return records.filter((r) => {
    const d = r.date?.trim()
    if (!d) return false
    return d >= range.startDate && d <= range.endDate
  })
}

function sumQtyFailScrap(records: InspectionRecord[]) {
  let qty = 0
  let fail = 0
  let scrapCost = 0
  for (const r of records) {
    qty += r.qty
    fail += r.fail
    scrapCost += r.scrapCost
  }
  return { qty, fail, scrapCost }
}

function ngRatePercent(fail: number, qty: number) {
  if (qty <= 0) return 0
  return Math.round((fail / qty) * 10000) / 100
}

export function bucketBySealGrommet(
  records: InspectionRecord[],
): Record<DailyTypeBucket, InspectionRecord[]> {
  const out: Record<DailyTypeBucket, InspectionRecord[]> = {
    grommet: [],
    seal: [],
  }
  for (const r of records) {
    const bucket = dailyTypeBucketOf(r.productType)
    if (bucket) out[bucket].push(r)
  }
  return out
}

export function typeQtyNgSummaries(
  records: InspectionRecord[],
): TypeQtyNgSummary[] {
  const buckets = bucketBySealGrommet(records)
  return (['grommet', 'seal'] as const).map((id) => {
    const { qty, fail, scrapCost } = sumQtyFailScrap(buckets[id])
    return {
      id,
      label: id === 'grommet' ? 'GROMMET' : 'SEAL',
      qty,
      fail,
      ngRatePercent: ngRatePercent(fail, qty),
      scrapCost: Math.round(scrapCost),
    }
  })
}

/** 불량 유형 비중 (share = %) */
export function aggregateDefectShares(
  records: InspectionRecord[],
): DefectType[] {
  const map = new Map<string, number>()
  for (const r of records) {
    const entries = Object.entries(r.defects ?? {})
    if (entries.length === 0 && r.fail > 0) {
      const key = r.mainDefect || '기타'
      map.set(key, (map.get(key) ?? 0) + r.fail)
      continue
    }
    for (const [name, count] of entries) {
      map.set(name, (map.get(name) ?? 0) + count)
    }
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0) || 1
  return [...map.entries()]
    .map(([name, count]) => ({
      name,
      count,
      share: Math.round((count / total) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count)
}

function aggregateByProduct(records: InspectionRecord[]) {
  type Acc = {
    names: string[]
    qty: number
    fail: number
    scrapCost: number
  }
  const map = new Map<string, Acc>()
  for (const r of records) {
    const name = r.product?.trim()
    if (!name) continue
    const key = itemMatchKey(name) || name
    const cur = map.get(key)
    if (cur) {
      cur.names.push(name)
      cur.qty += r.qty
      cur.fail += r.fail
      cur.scrapCost += r.scrapCost
    } else {
      map.set(key, {
        names: [name],
        qty: r.qty,
        fail: r.fail,
        scrapCost: r.scrapCost,
      })
    }
  }
  return [...map.values()].map((row) => {
    const product = preferDisplayItem(row.names)
    return {
      product,
      qty: row.qty,
      fail: row.fail,
      failRatePercent: ngRatePercent(row.fail, row.qty),
      scrapCost: Math.round(row.scrapCost),
    } satisfies ProductRankRow
  })
}

/** 검수량 0 제외 · 불량률 % 내림차순 TOP N */
export function topProductsByFailRate(
  records: InspectionRecord[],
  limit = 5,
): ProductRankRow[] {
  return aggregateByProduct(records)
    .filter((p) => p.qty > 0)
    .sort(
      (a, b) =>
        b.failRatePercent - a.failRatePercent ||
        b.fail - a.fail ||
        a.product.localeCompare(b.product, 'ko'),
    )
    .slice(0, limit)
}

/** NG 금액 내림차순 TOP N */
export function topProductsByScrapCost(
  records: InspectionRecord[],
  limit = 5,
): ProductRankRow[] {
  return aggregateByProduct(records)
    .filter((p) => p.scrapCost > 0)
    .sort(
      (a, b) =>
        b.scrapCost - a.scrapCost ||
        b.fail - a.fail ||
        a.product.localeCompare(b.product, 'ko'),
    )
    .slice(0, limit)
}

export function typeScrapCostBars(
  records: InspectionRecord[],
): Array<{ name: string; scrapCost: number; fill: string }> {
  const summaries = typeQtyNgSummaries(records)
  return summaries.map((s) => ({
    name: s.label,
    scrapCost: s.scrapCost,
    fill: s.id === 'grommet' ? '#3b82f6' : '#ef4444',
  }))
}
