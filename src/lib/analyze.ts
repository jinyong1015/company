import type { FilterState } from '../context/FilterContext'
import { ANALYSIS_GROUPS, isAnalyzable, matchesAnalysisGroup } from './groups'
import type {
  Analytics,
  AnomalyItem,
  CostPoint,
  DailyTrend,
  DefectType,
  EquipmentRow,
  GroupSummary,
  InsightItem,
  InspectionRecord,
  InspectorRow,
  KpiItem,
  MoldRow,
  ProductBreakdown,
  ProductRow,
  Status,
  WorkerProductUph,
  WorkerRow,
} from '../types'

function uniqueSorted(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'))
}

function statusByRate(rate: number): Status {
  if (rate >= 2) return '위험'
  if (rate >= 1.3) return '주의'
  return '정상'
}

function pct(n: number, digits = 2) {
  return `${n.toFixed(digits)}%`
}

function formatCost(n: number) {
  if (n >= 1_000_000) return `₩${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `₩${(n / 10_000).toFixed(0)}만`
  return `₩${Math.round(n).toLocaleString()}`
}

function sum(records: InspectionRecord[], key: keyof InspectionRecord) {
  return records.reduce((acc, r) => acc + Number(r[key] || 0), 0)
}

function failRateOf(records: InspectionRecord[]) {
  const qty = sum(records, 'qty')
  const fail = sum(records, 'fail')
  return qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0
}

function uphOf(records: InspectionRecord[]) {
  const qty = sum(records, 'qty')
  const hours = sum(records, 'hours')
  return hours > 0 ? Math.round(qty / hours) : 0
}

function mainDefectOf(records: InspectionRecord[]) {
  const map = new Map<string, number>()
  for (const r of records) {
    for (const [name, count] of Object.entries(r.defects ?? {})) {
      map.set(name, (map.get(name) ?? 0) + count)
    }
    if (!r.defects || Object.keys(r.defects).length === 0) {
      const key = r.mainDefect || '기타'
      map.set(key, (map.get(key) ?? 0) + r.fail)
    }
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타'
}

function aggregateDefects(records: InspectionRecord[]): DefectType[] {
  const map = new Map<string, number>()
  for (const r of records) {
    const entries = Object.entries(r.defects ?? {})
    if (entries.length === 0 && r.fail > 0) {
      map.set(r.mainDefect || '기타', (map.get(r.mainDefect || '기타') ?? 0) + r.fail)
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

function defectSummaryOf(defects: DefectType[]) {
  if (!defects.length) return '-'
  return defects.map((d) => `${d.name} ${d.count.toLocaleString()}`).join(', ')
}

function minutesOf(records: InspectionRecord[]) {
  return Math.round(sum(records, 'hours') * 60)
}

function parseDate(value: string) {
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function formatDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function resolvePeriodRange(filters: FilterState, records: InspectionRecord[]) {
  const dates = records
    .map((r) => parseDate(r.date))
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())

  const today = dates.at(-1) ?? new Date()
  let start = new Date(today)
  let end = new Date(today)

  switch (filters.period) {
    case 'today':
      break
    case '7d':
      start.setDate(end.getDate() - 6)
      break
    case 'thisMonth':
      start = new Date(end.getFullYear(), end.getMonth(), 1)
      break
    case 'lastMonth':
      start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
      end = new Date(end.getFullYear(), end.getMonth(), 0)
      break
    case 'year':
      start = new Date(end.getFullYear(), 0, 1)
      break
    case 'custom':
      start = parseDate(filters.startDate) ?? start
      end = parseDate(filters.endDate) ?? end
      break
  }

  return { start, end }
}

function previousRange(start: Date, end: Date) {
  const ms = end.getTime() - start.getTime()
  const prevEnd = new Date(start.getTime() - 24 * 60 * 60 * 1000)
  const prevStart = new Date(prevEnd.getTime() - ms)
  return { start: prevStart, end: prevEnd }
}

function inRange(date: string, start: Date, end: Date) {
  const d = parseDate(date)
  if (!d) return false
  const t = d.getTime()
  return t >= start.getTime() && t <= end.getTime()
}

function applyMultiFilters(records: InspectionRecord[], filters: FilterState) {
  const match = (selected: string[], value: string) =>
    selected.length === 0 || selected.includes(value)

  return records.filter(
    (r) =>
      match(filters.teams, r.team) &&
      match(filters.inspectors, r.inspector) &&
      match(filters.workTypes, r.workType) &&
      match(filters.productTypes, r.productType) &&
      match(filters.products, r.product) &&
      match(filters.molds, r.moldNo) &&
      match(filters.equipment, r.equipment) &&
      match(filters.workers, r.worker) &&
      match(filters.lots, r.lot),
  )
}

function deltaTone(
  current: number,
  previous: number,
  higherIsBad: boolean,
): KpiItem['tone'] {
  if (previous === 0 && current === 0) return 'neutral'
  if (current === previous) return 'neutral'
  const up = current > previous
  if (higherIsBad) return up ? 'up-bad' : 'down-good'
  return up ? 'up-good' : 'down-bad'
}

function deltaText(current: number, previous: number, asPoint = false) {
  if (previous === 0) {
    if (current === 0) return '0%'
    return asPoint ? `▲ ${current.toFixed(2)}%p` : '+100%'
  }
  if (asPoint) {
    const diff = Math.round((current - previous) * 100) / 100
    const sign = diff > 0 ? '▲' : diff < 0 ? '▼' : ''
    return `${sign} ${Math.abs(diff).toFixed(2)}%p`.trim()
  }
  const diff = ((current - previous) / Math.abs(previous)) * 100
  const sign = diff > 0 ? '+' : ''
  return `${sign}${diff.toFixed(1)}%`
}

function buildKpis(current: InspectionRecord[], previous: InspectionRecord[]): KpiItem[] {
  const cur = {
    qty: sum(current, 'qty'),
    fail: sum(current, 'fail'),
    failRate: failRateOf(current),
    cost: sum(current, 'scrapCost'),
  }
  const prev = {
    qty: sum(previous, 'qty'),
    fail: sum(previous, 'fail'),
    failRate: failRateOf(previous),
    cost: sum(previous, 'scrapCost'),
  }

  return [
    {
      id: 'qty',
      label: '검수량',
      value: `${cur.qty.toLocaleString()} EA`,
      delta: deltaText(cur.qty, prev.qty),
      deltaLabel: '이전 기간 대비',
      tone: deltaTone(cur.qty, prev.qty, false),
    },
    {
      id: 'failRate',
      label: '부적합률',
      value: pct(cur.failRate),
      delta: deltaText(cur.failRate, prev.failRate, true),
      deltaLabel: '이전 기간 대비',
      tone: deltaTone(cur.failRate, prev.failRate, true),
    },
    {
      id: 'fail',
      label: '부적합수량',
      value: `${cur.fail.toLocaleString()} EA`,
      delta: deltaText(cur.fail, prev.fail),
      deltaLabel: '이전 기간 대비',
      tone: deltaTone(cur.fail, prev.fail, true),
    },
    {
      id: 'cost',
      label: '폐기비용',
      value: formatCost(cur.cost),
      delta: deltaText(cur.cost, prev.cost),
      deltaLabel: '이전 기간 대비',
      tone: deltaTone(cur.cost, prev.cost, true),
    },
  ]
}

function productBreakdown(records: InspectionRecord[]): ProductBreakdown[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.product) ?? []
    list.push(r)
    map.set(r.product, list)
  }
  return [...map.entries()]
    .map(([product, list]) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      return {
        product,
        qty,
        fail,
        failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
        scrapCost: sum(list, 'scrapCost'),
        hours: Math.round(hours * 10) / 10,
        minutes: minutesOf(list),
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        mainDefect: mainDefectOf(list),
      }
    })
    .sort((a, b) => b.qty - a.qty)
}

function buildDailyTrends(records: InspectionRecord[]): DailyTrend[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.date) ?? []
    list.push(r)
    map.set(r.date, list)
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      return {
        date: date.slice(5),
        inspectionCount: list.length,
        qty,
        pass: sum(list, 'pass'),
        fail,
        failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
        hours: Math.round(hours * 10) / 10,
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        scrapCost: sum(list, 'scrapCost'),
      }
    })
}

function buildDefectTypes(records: InspectionRecord[], previous: InspectionRecord[]): DefectType[] {
  const current = aggregateDefects(records).slice(0, 10)
  const prevMap = new Map(aggregateDefects(previous).map((d) => [d.name, d.count]))
  return current.map((d) => {
    const prev = prevMap.get(d.name) ?? 0
    const diff = d.count - prev
    return {
      ...d,
      delta: prev === 0 && d.count === 0 ? '0%' : deltaText(d.count, prev),
      tone: diff > 0 ? 'up-bad' : diff < 0 ? 'down-good' : 'neutral',
    }
  })
}

function buildInspectors(records: InspectionRecord[]): InspectorRow[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.inspector) ?? []
    list.push(r)
    map.set(r.inspector, list)
  }

  return [...map.entries()]
    .map(([name, list], idx) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      return {
        id: `ins-${idx + 1}`,
        name,
        team: list[0]?.team || '미지정',
        count: list.length,
        qty,
        pass: sum(list, 'pass'),
        fail,
        failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
        hours: Math.round(hours * 10) / 10,
        minutes: minutesOf(list),
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        scrapCost: sum(list, 'scrapCost'),
        products: productBreakdown(list),
      }
    })
    .sort((a, b) => b.qty - a.qty)
}

function buildProducts(records: InspectionRecord[], previous: InspectionRecord[]): ProductRow[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.product) ?? []
    list.push(r)
    map.set(r.product, list)
  }
  const prevMap = new Map<string, InspectionRecord[]>()
  for (const r of previous) {
    const list = prevMap.get(r.product) ?? []
    list.push(r)
    prevMap.set(r.product, list)
  }

  return [...map.entries()]
    .map(([name, list], idx) => {
      const qty = sum(list, 'qty')
      const pass = sum(list, 'pass')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      const failRate = qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0
      const defects = aggregateDefects(list)
      const failTotal = defects.reduce((s, d) => s + d.count, 0)
      const prevRate = failRateOf(prevMap.get(name) ?? [])
      return {
        id: `prd-${idx + 1}`,
        name,
        type: list[0]?.productType || '미지정',
        qty,
        pass,
        fail,
        failTotal,
        failRate,
        hours: Math.round(hours * 10) / 10,
        minutes: minutesOf(list),
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        mainDefect: defects[0]?.name ?? mainDefectOf(list),
        defects,
        defectSummary: defectSummaryOf(defects),
        scrapCost: sum(list, 'scrapCost'),
        status: statusByRate(failRate),
        changeRate: Math.round((failRate - prevRate) * 100) / 100,
      }
    })
    .sort((a, b) => b.fail - a.fail)
}

function buildWorkerProductUph(records: InspectionRecord[]): WorkerProductUph[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const key = `${r.worker}||${r.product}`
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }

  return [...map.entries()]
    .map(([key, list], idx) => {
      const [worker, product] = key.split('||')
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      const defects = aggregateDefects(list)
      return {
        id: `wpu-${idx + 1}`,
        worker,
        product,
        productType: list[0]?.productType || '미지정',
        count: list.length,
        qty,
        pass: sum(list, 'pass'),
        fail,
        failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
        minutes: minutesOf(list),
        hours: Math.round(hours * 10) / 10,
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        scrapCost: sum(list, 'scrapCost'),
        mainDefect: defects[0]?.name ?? mainDefectOf(list),
        defects,
        defectSummary: defectSummaryOf(defects),
      }
    })
    .sort((a, b) => a.worker.localeCompare(b.worker, 'ko') || b.uph - a.uph)
}

function buildWorkers(records: InspectionRecord[], workerProductUph: WorkerProductUph[]): WorkerRow[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.worker) ?? []
    list.push(r)
    map.set(r.worker, list)
  }

  return [...map.entries()]
    .map(([name, list], idx) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      const products = workerProductUph.filter((p) => p.worker === name)
      return {
        id: `wrk-${idx + 1}`,
        name,
        count: list.length,
        qty,
        pass: sum(list, 'pass'),
        fail,
        failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
        minutes: minutesOf(list),
        hours: Math.round(hours * 10) / 10,
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        scrapCost: sum(list, 'scrapCost'),
        productCount: products.length,
        products,
      }
    })
    .sort((a, b) => b.qty - a.qty)
}

function buildMolds(records: InspectionRecord[], previous: InspectionRecord[]): MoldRow[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.moldNo) ?? []
    list.push(r)
    map.set(r.moldNo, list)
  }
  const prevMap = new Map<string, InspectionRecord[]>()
  for (const r of previous) {
    const list = prevMap.get(r.moldNo) ?? []
    list.push(r)
    prevMap.set(r.moldNo, list)
  }

  return [...map.entries()]
    .map(([moldNo, list], idx) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const failRate = qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0
      const prevRate = failRateOf(prevMap.get(moldNo) ?? [])
      const diff = Math.round((failRate - prevRate) * 100) / 100
      return {
        id: `mld-${idx + 1}`,
        moldNo,
        product: list[0]?.product || '-',
        qty,
        fail,
        failRate,
        mainDefect: mainDefectOf(list),
        hours: Math.round(sum(list, 'hours') * 10) / 10,
        minutes: minutesOf(list),
        scrapCost: sum(list, 'scrapCost'),
        recentChange: `${diff > 0 ? '+' : ''}${diff.toFixed(2)}%p`,
        changeRate: diff,
        status: statusByRate(failRate),
      }
    })
    .sort((a, b) => b.failRate - a.failRate)
}

function buildEquipment(records: InspectionRecord[], previous: InspectionRecord[]): EquipmentRow[] {
  const map = new Map<string, InspectionRecord[]>()
  for (const r of records) {
    const list = map.get(r.equipment) ?? []
    list.push(r)
    map.set(r.equipment, list)
  }
  const prevMap = new Map<string, InspectionRecord[]>()
  for (const r of previous) {
    const list = prevMap.get(r.equipment) ?? []
    list.push(r)
    prevMap.set(r.equipment, list)
  }

  return [...map.entries()]
    .map(([name, list], idx) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const hours = sum(list, 'hours')
      const failRate = qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0
      const prevRate = failRateOf(prevMap.get(name) ?? [])
      const diff = Math.round((failRate - prevRate) * 100) / 100
      return {
        id: `eq-${idx + 1}`,
        name,
        qty,
        fail,
        hours: Math.round(hours * 10) / 10,
        minutes: minutesOf(list),
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        failRate,
        mainDefect: mainDefectOf(list),
        scrapCost: sum(list, 'scrapCost'),
        status: statusByRate(failRate),
        changeRate: diff,
        products: productBreakdown(list),
      }
    })
    .sort((a, b) => b.failRate - a.failRate)
}

function topCosts(
  records: InspectionRecord[],
  key: keyof InspectionRecord,
  limit = 5,
): CostPoint[] {
  const map = new Map<string, number>()
  for (const r of records) {
    const name = String(r[key] || '기타')
    map.set(name, (map.get(name) ?? 0) + r.scrapCost)
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value / 1000) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
}

function buildAnomalies(
  current: InspectionRecord[],
  previous: InspectionRecord[],
  products: ProductRow[],
  molds: MoldRow[],
  equipment: EquipmentRow[],
  inspectors: InspectorRow[],
): AnomalyItem[] {
  const items: AnomalyItem[] = []
  const curRate = failRateOf(current)
  const prevRate = failRateOf(previous)
  const rateDiff = Math.round((curRate - prevRate) * 100) / 100
  const now = current.map((r) => r.date).sort().at(-1) ?? formatDateInput(new Date())

  if (rateDiff >= 0.3) {
    items.push({
      id: 'an-quality',
      category: '품질 이상',
      title: '부적합률 급증',
      severity: rateDiff >= 0.6 ? 'high' : 'medium',
      occurredAt: `${now} 분석`,
      scope: '선택 기간 전체',
      current: pct(curRate),
      average: pct(prevRate),
      change: `+${rateDiff.toFixed(2)}%p`,
      products: products.slice(0, 2).map((p) => p.name).join(', ') || '-',
      molds: molds.slice(0, 2).map((m) => m.moldNo).join(', ') || '-',
      equipment: equipment.slice(0, 2).map((e) => e.name).join(', ') || '-',
      mainDefect: mainDefectOf(current),
    })
  }

  const riskyProduct = products.find((p) => p.status === '위험')
  if (riskyProduct) {
    items.push({
      id: 'an-product',
      category: '제품 이상',
      title: '특정 제품 불량 증가',
      severity: 'high',
      occurredAt: `${now} 분석`,
      scope: `제품 ${riskyProduct.name}`,
      current: pct(riskyProduct.failRate),
      average: pct(curRate),
      change: `+${(riskyProduct.failRate - curRate).toFixed(2)}%p`,
      products: riskyProduct.name,
      molds: molds.filter((m) => m.product === riskyProduct.name).map((m) => m.moldNo).join(', ') || '-',
      equipment: '-',
      mainDefect: riskyProduct.mainDefect,
    })
  }

  const riskyMold = molds.find((m) => m.status === '위험' || m.recentChange.startsWith('+'))
  if (riskyMold) {
    items.push({
      id: 'an-mold',
      category: '금형 이상',
      title: '금형 불량률 증가',
      severity: riskyMold.status === '위험' ? 'high' : 'medium',
      occurredAt: `${now} 분석`,
      scope: `금형 ${riskyMold.moldNo}`,
      current: pct(riskyMold.failRate),
      average: pct(curRate),
      change: riskyMold.recentChange,
      products: riskyMold.product,
      molds: riskyMold.moldNo,
      equipment: '-',
      mainDefect: riskyMold.mainDefect,
    })
  }

  const riskyEq = equipment.find((e) => e.status !== '정상')
  if (riskyEq) {
    items.push({
      id: 'an-eq',
      category: '설비 이상',
      title: '설비 품질 저하',
      severity: riskyEq.status === '위험' ? 'high' : 'medium',
      occurredAt: `${now} 분석`,
      scope: riskyEq.name,
      current: pct(riskyEq.failRate),
      average: pct(curRate),
      change: `+${(riskyEq.failRate - curRate).toFixed(2)}%p`,
      products: products.slice(0, 2).map((p) => p.name).join(', '),
      molds: molds.slice(0, 2).map((m) => m.moldNo).join(', '),
      equipment: riskyEq.name,
      mainDefect: riskyEq.mainDefect,
    })
  }

  const avgUph = inspectors.length
    ? inspectors.reduce((s, i) => s + i.uph, 0) / inspectors.length
    : 0
  const lowUph = inspectors.find((i) => avgUph > 0 && i.uph < avgUph * 0.9)
  if (lowUph) {
    items.push({
      id: 'an-uph',
      category: '검사 효율 이상',
      title: 'UPH 급감',
      severity: 'low',
      occurredAt: `${now} 분석`,
      scope: `검사자 ${lowUph.name}`,
      current: String(lowUph.uph),
      average: String(Math.round(avgUph)),
      change: `${(((lowUph.uph - avgUph) / avgUph) * 100).toFixed(1)}%`,
      products: '-',
      molds: '-',
      equipment: '-',
      mainDefect: '-',
    })
  }

  const curCost = sum(current, 'scrapCost')
  const prevCost = sum(previous, 'scrapCost')
  if (prevCost > 0 && curCost > prevCost * 1.2) {
    items.push({
      id: 'an-cost',
      category: '비용 이상',
      title: '폐기비용 급증',
      severity: 'high',
      occurredAt: `${now} 분석`,
      scope: '선택 기간 전체',
      current: formatCost(curCost),
      average: formatCost(prevCost),
      change: deltaText(curCost, prevCost),
      products: products.slice(0, 2).map((p) => p.name).join(', '),
      molds: molds.slice(0, 2).map((m) => m.moldNo).join(', '),
      equipment: equipment.slice(0, 1).map((e) => e.name).join(', '),
      mainDefect: mainDefectOf(current),
    })
  }

  return items
}

function buildInsights(
  current: InspectionRecord[],
  previous: InspectionRecord[],
  defects: DefectType[],
  products: ProductRow[],
  anomalies: AnomalyItem[],
): InsightItem[] {
  const insights: InsightItem[] = []
  const curRate = failRateOf(current)
  const prevRate = failRateOf(previous)
  const rateDiff = Math.round((curRate - prevRate) * 100) / 100
  const curUph = uphOf(current)
  const prevUph = uphOf(previous)

  if (rateDiff > 0.1) {
    insights.push({
      id: 'i1',
      tone: 'warn',
      title: '부적합률 상승',
      body: [
        `선택 기간의 부적합률이 이전 기간보다 ${rateDiff.toFixed(2)}%p 증가했습니다.`,
        `주요 원인은 ${defects
          .slice(0, 2)
          .map((d) => d.name)
          .join(', ') || '기타'}이며 전체 부적합의 상당 부분을 차지합니다.`,
        products.filter((p) => p.status !== '정상').length
          ? '특정 제품과 금형에서 증가폭이 높습니다.'
          : '전반적인 품질 변동을 모니터링하십시오.',
      ],
      action: '상세 분석',
      to: '/quality',
    })
  } else if (rateDiff < -0.1) {
    insights.push({
      id: 'i1',
      tone: 'good',
      title: '부적합률 개선',
      body: [
        `선택 기간의 부적합률이 이전 기간보다 ${Math.abs(rateDiff).toFixed(2)}%p 감소했습니다.`,
        '품질 안정화 추세가 확인됩니다.',
      ],
    })
  }

  if (prevUph > 0 && curUph > prevUph) {
    insights.push({
      id: 'i2',
      tone: 'good',
      title: '검사 효율 개선',
      body: [
        `평균 UPH가 이전 기간보다 ${(((curUph - prevUph) / prevUph) * 100).toFixed(1)}% 증가했습니다.`,
        '검사 운영 효율이 개선되고 있습니다.',
      ],
    })
  }

  if (anomalies[0]) {
    insights.push({
      id: 'i3',
      tone: 'danger',
      title: '이상징후',
      body: [
        anomalies[0].title + '가 감지되었습니다.',
        `영향 범위: ${anomalies[0].scope}. 관련 제품/금형/설비를 확인하십시오.`,
      ],
      action: '원인 분석',
      to: '/anomalies',
    })
  }

  if (insights.length === 0) {
    insights.push({
      id: 'i0',
      tone: 'good',
      title: '안정적 품질 상태',
      body: [
        '선택 기간 기준 급격한 이상징후는 감지되지 않았습니다.',
        `현재 부적합률 ${pct(curRate)}, UPH ${curUph} 수준입니다.`,
      ],
    })
  }

  return insights
}

export function filterRecords(
  records: InspectionRecord[],
  filters: FilterState,
  analyzableOnly = false,
) {
  const base = analyzableOnly ? records.filter(isAnalyzable) : records
  const grouped = base.filter((r) => matchesAnalysisGroup(r, filters.analysisGroup))
  const { start, end } = resolvePeriodRange(filters, grouped.length ? grouped : base)
  return applyMultiFilters(grouped, filters).filter((r) => inRange(r.date, start, end))
}

export function analyzeRecords(
  allRecords: InspectionRecord[],
  filters: FilterState,
): Analytics {
  const analyzable = allRecords.filter((r) => isAnalyzable(r))
  const grouped = analyzable.filter((r) =>
    matchesAnalysisGroup(r, filters.analysisGroup ?? 'all'),
  )
  const multiFiltered = applyMultiFilters(grouped, filters)
  const { start, end } = resolvePeriodRange(filters, multiFiltered.length ? multiFiltered : grouped)
  const current = multiFiltered.filter((r) => inRange(r.date, start, end))
  const prev = previousRange(start, end)
  const previous = multiFiltered.filter((r) => inRange(r.date, prev.start, prev.end))

  const source = current.length ? current : multiFiltered
  const compare = previous

  const periodAllGroups = applyMultiFilters(analyzable, filters).filter((r) =>
    inRange(r.date, start, end),
  )
  const groupSummaries: GroupSummary[] = ANALYSIS_GROUPS.map((g) => {
    const list = periodAllGroups.filter((r) => matchesAnalysisGroup(r, g.id))
    const qty = sum(list, 'qty')
    const fail = sum(list, 'fail')
    return {
      id: g.id,
      label: g.label,
      qty,
      fail,
      failRate: qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0,
      scrapCost: sum(list, 'scrapCost'),
    }
  })

  const dailyTrends = buildDailyTrends(source)
  const defectTypes = buildDefectTypes(source, compare)
  const inspectors = buildInspectors(source)
  const products = buildProducts(source, compare)
  const workerProductUph = buildWorkerProductUph(source)
  const workers = buildWorkers(source, workerProductUph)
  const molds = buildMolds(source, compare)
  const equipment = buildEquipment(source, compare)
  const anomalies = buildAnomalies(source, compare, products, molds, equipment, inspectors)
  const insights = buildInsights(source, compare, defectTypes, products, anomalies)

  return {
    kpis: buildKpis(source, compare),
    dailyTrends,
    defectTypes,
    inspectors,
    products,
    workers,
    workerProductUph,
    molds,
    equipment,
    costByPeriod: dailyTrends.map((d) => ({
      name: d.date,
      value: Math.round(d.scrapCost / 1000),
    })),
    costByProduct: topCosts(source, 'product'),
    costByMold: topCosts(source, 'moldNo'),
    costByDefect: topCosts(source, 'mainDefect'),
    anomalies,
    insights,
    groupSummaries,
    filterOptions: {
      teams: uniqueSorted(allRecords.map((r) => r.team)),
      inspectors: uniqueSorted(allRecords.map((r) => r.inspector)),
      workTypes: uniqueSorted(allRecords.map((r) => r.workType)),
      productTypes: uniqueSorted(allRecords.map((r) => r.productType)),
      products: uniqueSorted(allRecords.map((r) => r.product)),
      molds: uniqueSorted(allRecords.map((r) => r.moldNo)),
      equipment: uniqueSorted(allRecords.map((r) => r.equipment)),
      workers: uniqueSorted(allRecords.map((r) => r.worker)),
      lots: uniqueSorted(allRecords.map((r) => r.lot)),
    },
    summary: {
      recordCount: source.length,
      totalQty: sum(source, 'qty'),
      totalFail: sum(source, 'fail'),
      failRate: failRateOf(source),
      totalCost: sum(source, 'scrapCost'),
      excludedCount: allRecords.filter((r) => r.rowClass === 'excluded').length,
    },
  }
}

export function emptyAnalytics(): Analytics {
  return analyzeRecords([], {
    analysisGroup: 'all',
    period: 'thisMonth',
    startDate: '',
    endDate: '',
    teams: [],
    inspectors: [],
    workTypes: [],
    productTypes: [],
    products: [],
    molds: [],
    equipment: [],
    workers: [],
    lots: [],
  })
}
