import {
  ANALYSIS_GROUP_BAR_COLORS,
  isAnalyzable,
  matchesAnalysisGroup,
  type AnalysisGroupId,
} from './groups'
import { toEntityId } from './entityId'
import { buildProductDetailHref } from './productDetailNav'
import { failRatePpm } from './format'
import type {
  InspectionRecord,
  MonthlyOrgMetric,
  OrgWeeklyStats,
  WeekPeriod,
  WeeklyIssue,
  WeeklyProductionRow,
  WeeklyReportDetail,
  WeeklyReportMetric,
  WeeklyReportMonthlyView,
  WeeklyReportOrgId,
  WorstProductItem,
} from '../types'

export const WEEKLY_REPORT_MONTHLY_BAR_ORDER: WeeklyReportOrgId[] = [
  'seal',
  'hydraulic',
  'plant2',
]

export const WEEKLY_REPORT_ORGS: {
  id: WeeklyReportOrgId
  label: string
  shortLabel: string
  groupId: AnalysisGroupId
  color: string
  worstMinQty: number
}[] = [
  {
    id: 'seal',
    label: 'SEAL',
    shortLabel: 'SEAL',
    groupId: 'seal',
    color: ANALYSIS_GROUP_BAR_COLORS.find((c) => c.id === 'seal')!.color,
    worstMinQty: 30000,
  },
  {
    id: 'hydraulic',
    label: '유압 및 ORANGE',
    shortLabel: '유압 및 ORANGE',
    groupId: 'hydraulic',
    color: ANALYSIS_GROUP_BAR_COLORS.find((c) => c.id === 'hydraulic')!.color,
    worstMinQty: 3000,
  },
  {
    id: 'plant2',
    label: '2공장',
    shortLabel: '2공장',
    groupId: 'plant2',
    color: ANALYSIS_GROUP_BAR_COLORS.find((c) => c.id === 'plant2')!.color,
    worstMinQty: 3000,
  },
]

const METRIC_LABELS: Record<WeeklyReportMetric, string> = {
  qty: '검수량',
  fail: '부적합수량',
  failRate: '부적합률',
  scrapCost: '폐기비용',
}

export function weeklyReportMetricLabel(metric: WeeklyReportMetric) {
  return METRIC_LABELS[metric]
}

function sum(records: InspectionRecord[], key: keyof InspectionRecord) {
  const total = records.reduce((acc, r) => acc + Number(r[key] || 0), 0)
  return key === 'scrapCost' ? Math.round(total) : total
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

function analyzableRecords(records: InspectionRecord[]) {
  return records.filter(isAnalyzable)
}

function filterByGroup(records: InspectionRecord[], groupId: AnalysisGroupId) {
  return records.filter((r) => matchesAnalysisGroup(r, groupId))
}

function metricValue(
  records: InspectionRecord[],
  metric: WeeklyReportMetric,
): number {
  const qty = sum(records, 'qty')
  const fail = sum(records, 'fail')
  if (metric === 'qty') return qty
  if (metric === 'fail') return fail
  if (metric === 'scrapCost') return sum(records, 'scrapCost')
  return failRatePpm(fail, qty)
}

function orgStats(records: InspectionRecord[]): OrgWeeklyStats {
  const qty = sum(records, 'qty')
  const fail = sum(records, 'fail')
  return {
    qty,
    fail,
    failRate: failRatePpm(fail, qty),
    scrapCost: sum(records, 'scrapCost'),
  }
}

function monthKeyOf(date: Date) {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  return `${y}-${String(m).padStart(2, '0')}`
}

function monthLabelOf(date: Date) {
  const y = String(date.getFullYear()).slice(2)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}.${m}`
}

function rollingMonths(anchor: Date, count = 12) {
  const months: Date[] = []
  const cursor = new Date(anchor.getFullYear(), anchor.getMonth(), 1)
  for (let i = count - 1; i >= 0; i -= 1) {
    months.push(new Date(cursor.getFullYear(), cursor.getMonth() - i, 1))
  }
  return months
}

function inDateRange(date: string, start: string, end: string) {
  return date >= start && date <= end
}

export function getWeekDateRange(
  year: number,
  month: number,
  weekOfMonth: number,
): { startDate: string; endDate: string } {
  const lastDay = new Date(year, month, 0).getDate()
  const startDay = (weekOfMonth - 1) * 7 + 1
  const endDay = Math.min(weekOfMonth * 7, lastDay)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    startDate: `${year}-${pad(month)}-${pad(startDay)}`,
    endDate: `${year}-${pad(month)}-${pad(endDay)}`,
  }
}

export function getWeekOfMonth(dateStr: string) {
  const day = Number(dateStr.slice(8, 10))
  return Math.min(5, Math.ceil(day / 7))
}

function weekLabel(month: number, weekOfMonth: number) {
  return `${String(month).padStart(2, '0')}월 ${weekOfMonth}주차`
}

function recordsInWeek(
  records: InspectionRecord[],
  year: number,
  month: number,
  weekOfMonth: number,
) {
  const { startDate, endDate } = getWeekDateRange(year, month, weekOfMonth)
  return records.filter((r) => inDateRange(r.date, startDate, endDate))
}

function previousWeek(year: number, month: number, weekOfMonth: number) {
  if (weekOfMonth > 1) {
    return { year, month, weekOfMonth: weekOfMonth - 1 }
  }
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const lastDay = new Date(prevYear, prevMonth, 0).getDate()
  const prevWeek = Math.min(5, Math.ceil(lastDay / 7))
  return { year: prevYear, month: prevMonth, weekOfMonth: prevWeek }
}

export function listWeeksInMonth(
  records: InspectionRecord[],
  year: number,
  month: number,
): WeekPeriod[] {
  const lastDay = new Date(year, month, 0).getDate()
  const maxWeek = Math.min(5, Math.ceil(lastDay / 7))
  const analyzable = analyzableRecords(records)

  return Array.from({ length: maxWeek }, (_, i) => {
    const weekOfMonth = i + 1
    const { startDate, endDate } = getWeekDateRange(year, month, weekOfMonth)
    const weekRecords = analyzable.filter((r) =>
      inDateRange(r.date, startDate, endDate),
    )
    return {
      year,
      month,
      weekOfMonth,
      label: weekLabel(month, weekOfMonth),
      startDate,
      endDate,
      hasData: weekRecords.length > 0,
    }
  })
}

export function buildMonthlyReportView(
  records: InspectionRecord[],
  metric: WeeklyReportMetric,
  anchorDate = new Date(),
): WeeklyReportMonthlyView {
  const analyzable = analyzableRecords(records)
  const months = rollingMonths(anchorDate, 12)

  const monthlyMetrics: MonthlyOrgMetric[] = months.map((m) => {
    const key = monthKeyOf(m)
    const monthRecords = analyzable.filter((r) => r.date.startsWith(key))
    const seal = metricValue(filterByGroup(monthRecords, 'seal'), metric)
    const hydraulic = metricValue(filterByGroup(monthRecords, 'hydraulic'), metric)
    const plant2 = metricValue(filterByGroup(monthRecords, 'plant2'), metric)
    let total: number
    if (metric === 'failRate') {
      total = metricValue(monthRecords, metric)
    } else {
      total = seal + hydraulic + plant2
    }
    return {
      monthKey: key,
      monthLabel: monthLabelOf(m),
      seal,
      hydraulic,
      plant2,
      total,
    }
  })

  const valuesByRow = (pick: (m: MonthlyOrgMetric) => number) =>
    Object.fromEntries(monthlyMetrics.map((m) => [m.monthKey, pick(m)]))

  return {
    metric,
    months: monthlyMetrics,
    tableRows: [
      { id: 'seal', label: 'SEAL', values: valuesByRow((m) => m.seal) },
      {
        id: 'hydraulic',
        label: '유압 및 ORANGE',
        values: valuesByRow((m) => m.hydraulic),
      },
      { id: 'plant2', label: '2공장', values: valuesByRow((m) => m.plant2) },
      { id: 'total', label: 'TOTAL', values: valuesByRow((m) => m.total) },
    ],
    range: {
      from: monthlyMetrics[0]?.monthLabel ?? '',
      to: monthlyMetrics[monthlyMetrics.length - 1]?.monthLabel ?? '',
    },
  }
}

function buildWorst5(
  records: InspectionRecord[],
  groupId: AnalysisGroupId,
  minQty: number,
): WorstProductItem[] {
  const scoped = filterByGroup(records, groupId)
  const map = new Map<string, InspectionRecord[]>()
  for (const r of scoped) {
    const list = map.get(r.product) ?? []
    list.push(r)
    map.set(r.product, list)
  }

  return [...map.entries()]
    .map(([product, list]) => {
      const qty = sum(list, 'qty')
      const fail = sum(list, 'fail')
      const failRate = failRatePpm(fail, qty)
      return {
        product,
        qty,
        fail,
        failRate,
        failRatePercent: failRate / 10_000,
        mainDefect: mainDefectOf(list),
      }
    })
    .filter((p) => p.qty >= minQty)
    .sort((a, b) => b.failRate - a.failRate)
    .slice(0, 5)
    .map((p, i) => ({ ...p, rank: i + 1 }))
}

function buildProductionRow(
  records: InspectionRecord[],
  year: number,
  month: number,
  weekOfMonth: number,
  isCurrent: boolean,
): WeeklyProductionRow {
  const weekRecords = recordsInWeek(records, year, month, weekOfMonth)
  const hydraulic = orgStats(filterByGroup(weekRecords, 'hydraulic'))
  const seal = orgStats(filterByGroup(weekRecords, 'seal'))
  const plant2 = orgStats(filterByGroup(weekRecords, 'plant2'))
  const totalQty = hydraulic.qty + seal.qty + plant2.qty
  const totalFail = hydraulic.fail + seal.fail + plant2.fail
  const total: OrgWeeklyStats = {
    qty: totalQty,
    fail: totalFail,
    failRate: failRatePpm(totalFail, totalQty),
    scrapCost: hydraulic.scrapCost + seal.scrapCost + plant2.scrapCost,
  }

  return {
    periodKey: `${year}-${String(month).padStart(2, '0')}-W${weekOfMonth}`,
    periodLabel: weekLabel(month, weekOfMonth),
    isCurrent,
    columns: { hydraulic, seal, plant2, total },
  }
}

export function buildAutoWeeklyIssues(
  detail: WeeklyReportDetail,
  previousDetail?: WeeklyReportDetail,
): WeeklyIssue[] {
  const issues: WeeklyIssue[] = []
  let order = 1

  for (const org of WEEKLY_REPORT_ORGS) {
    const top = detail.worst5[org.id][0]
    if (!top) continue
    issues.push({
      id: `auto-worst-${org.id}`,
      source: 'auto',
      order: order++,
      product: top.product,
      failRatePercent: top.failRatePercent,
      title: `[${org.label}] ${top.product} — ${top.failRatePercent.toFixed(2)}%`,
      bullets: [
        `주요 부적합: ${top.mainDefect}`,
        `검수량 ${top.qty.toLocaleString()} EA · PPM ${top.failRate.toLocaleString()}`,
      ],
    })
  }

  if (previousDetail) {
    const cur = detail.productionRows.find((r) => r.isCurrent)?.columns.total
    const prev = previousDetail.productionRows.find((r) => r.isCurrent)?.columns.total
    if (cur && prev && prev.failRate > 0) {
      const change = ((cur.failRate - prev.failRate) / prev.failRate) * 100
      if (Math.abs(change) >= 10) {
        issues.push({
          id: 'auto-trend-failrate',
          source: 'auto',
          order: order++,
          title: `전주 대비 TOTAL 부적합률 ${change > 0 ? '증가' : '감소'} (${Math.abs(change).toFixed(1)}%)`,
          bullets: [
            `전주: ${(prev.failRate / 10_000).toFixed(2)}%`,
            `금주: ${(cur.failRate / 10_000).toFixed(2)}%`,
          ],
        })
      }
    }
  }

  return issues.slice(0, 5)
}

const ISSUE_STORAGE_KEY = 'weekly-report-issues'

export function loadWeeklyIssues(periodKey: string): WeeklyIssue[] | null {
  try {
    const raw = localStorage.getItem(ISSUE_STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, WeeklyIssue[]>
    return all[periodKey] ?? null
  } catch {
    return null
  }
}

export function saveWeeklyIssues(periodKey: string, issues: WeeklyIssue[]) {
  try {
    const raw = localStorage.getItem(ISSUE_STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, WeeklyIssue[]>) : {}
    all[periodKey] = issues
    localStorage.setItem(ISSUE_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function buildWeeklyReportDetail(
  records: InspectionRecord[],
  year: number,
  month: number,
  weekOfMonth: number,
): WeeklyReportDetail {
  const analyzable = analyzableRecords(records)
  const { startDate, endDate } = getWeekDateRange(year, month, weekOfMonth)
  const weekRecords = analyzable.filter((r) =>
    inDateRange(r.date, startDate, endDate),
  )

  const prev = previousWeek(year, month, weekOfMonth)
  const productionRows: WeeklyProductionRow[] = [
    buildProductionRow(analyzable, prev.year, prev.month, prev.weekOfMonth, false),
    buildProductionRow(analyzable, year, month, weekOfMonth, true),
  ]

  const worst5 = Object.fromEntries(
    WEEKLY_REPORT_ORGS.map((org) => [
      org.id,
      buildWorst5(weekRecords, org.groupId, org.worstMinQty),
    ]),
  ) as WeeklyReportDetail['worst5']

  const worst5Thresholds = Object.fromEntries(
    WEEKLY_REPORT_ORGS.map((org) => [org.id, org.worstMinQty]),
  ) as WeeklyReportDetail['worst5Thresholds']

  const period: WeekPeriod = {
    year,
    month,
    weekOfMonth,
    label: weekLabel(month, weekOfMonth),
    startDate,
    endDate,
    hasData: weekRecords.length > 0,
  }

  const periodKey = periodKeyOf(year, month, weekOfMonth)
  const prevDetail = buildWeeklyReportDetailLite(
    analyzable,
    prev.year,
    prev.month,
    prev.weekOfMonth,
  )
  const saved = loadWeeklyIssues(periodKey)
  const detail: WeeklyReportDetail = {
    period,
    title: `${year}년 ${weekLabel(month, weekOfMonth)} 완성품 부적합 현황`,
    productionRows,
    issues: [],
    worst5,
    worst5Thresholds,
  }
  detail.issues = saved ?? buildAutoWeeklyIssues(detail, prevDetail)
  return detail
}

export function periodKeyOf(year: number, month: number, weekOfMonth: number) {
  return `${year}-${String(month).padStart(2, '0')}-W${weekOfMonth}`
}

function buildWeeklyReportDetailLite(
  records: InspectionRecord[],
  year: number,
  month: number,
  weekOfMonth: number,
): WeeklyReportDetail {
  const { startDate, endDate } = getWeekDateRange(year, month, weekOfMonth)
  const weekRecords = records.filter((r) => inDateRange(r.date, startDate, endDate))
  const worst5 = Object.fromEntries(
    WEEKLY_REPORT_ORGS.map((org) => [
      org.id,
      buildWorst5(weekRecords, org.groupId, org.worstMinQty),
    ]),
  ) as WeeklyReportDetail['worst5']
  const worst5Thresholds = Object.fromEntries(
    WEEKLY_REPORT_ORGS.map((org) => [org.id, org.worstMinQty]),
  ) as WeeklyReportDetail['worst5Thresholds']

  return {
    period: {
      year,
      month,
      weekOfMonth,
      label: weekLabel(month, weekOfMonth),
      startDate,
      endDate,
      hasData: weekRecords.length > 0,
    },
    title: '',
    productionRows: [buildProductionRow(records, year, month, weekOfMonth, true)],
    issues: [],
    worst5,
    worst5Thresholds,
  }
}

export function findDefaultWeek(
  records: InspectionRecord[],
  year: number,
  month: number,
): number {
  const weeks = listWeeksInMonth(records, year, month)
  const withData = weeks.filter((w) => w.hasData)
  if (withData.length) return withData[withData.length - 1].weekOfMonth
  return weeks[weeks.length - 1]?.weekOfMonth ?? 1
}

export function chartDataFromMonthly(view: WeeklyReportMonthlyView) {
  return view.months.map((m) => ({
    date: m.monthLabel,
    monthKey: m.monthKey,
    seal: m.seal,
    hydraulic: m.hydraulic,
    plant2: m.plant2,
    total: m.total,
  }))
}

/** 주간업무 보고 → 품번 상세 (조회 기간 쿼리 유지) */
export function buildWeeklyReportProductLink(
  product: string,
  startDate: string,
  endDate: string,
) {
  return buildProductDetailHref(toEntityId('prd', product), 'weekly-report', {
    startDate,
    endDate,
  })
}
