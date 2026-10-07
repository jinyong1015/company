import {
  resolvedPeriodDateStrings,
  type PeriodRangeFilters,
} from './analyze'
import type { WeeklyReportPeriodState } from './weeklyReportPeriod'
import { buildWeeklyReportHref } from './weeklyReportPeriod'

export type ProductDetailFromId =
  | 'weekly-report'
  | 'dashboard'
  | 'products'
  | 'quality'
  | 'workers'
  | 'inspectors'
  | 'cost'
  | 'equipment'
  | 'ai'
  | 'compare'
  | 'vina-products'
  | 'vina-quality'
  | 'vina-inspectors'
  | 'vina-cost'
  | 'vina-ai'
  | 'vina-compare'

export const PRODUCT_DETAIL_FROM_LABELS: Record<ProductDetailFromId, string> = {
  'weekly-report': '주간업무 보고',
  dashboard: '대시보드',
  products: '품번 분석',
  quality: '품질 분석',
  workers: '성형작업자 분석',
  inspectors: '검사자 분석',
  cost: '비용 분석',
  equipment: '설비 분석',
  ai: 'AI 질문',
  compare: '스마트 비교',
  'vina-products': 'VINA 품번 분석',
  'vina-quality': 'VINA 품질 분석',
  'vina-inspectors': 'VINA 검사자 분석',
  'vina-cost': 'VINA 비용 분석',
  'vina-ai': 'AI 질문 (VINA)',
  'vina-compare': 'VINA 스마트 비교',
}

export const PRODUCT_DETAIL_FROM_PATHS: Record<ProductDetailFromId, string> = {
  'weekly-report': '/weekly-report',
  dashboard: '/',
  products: '/products',
  quality: '/quality',
  workers: '/workers',
  inspectors: '/inspectors',
  cost: '/costs',
  equipment: '/equipment',
  ai: '/products',
  compare: '/compare',
  'vina-products': '/vina/products',
  'vina-quality': '/vina/quality',
  'vina-inspectors': '/vina/inspectors',
  'vina-cost': '/vina/costs',
  'vina-ai': '/vina/products',
  'vina-compare': '/vina/compare',
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const PERIOD_CARRY_KEYS = [
  'startDate',
  'endDate',
  'month',
  'week',
  'mode',
  'snapshotId',
] as const

export function parseProductDetailFrom(
  value: string | null,
  options?: { vina?: boolean },
): ProductDetailFromId {
  if (
    value === 'weekly-report' ||
    value === 'dashboard' ||
    value === 'products' ||
    value === 'quality' ||
    value === 'workers' ||
    value === 'inspectors' ||
    value === 'cost' ||
    value === 'equipment' ||
    value === 'ai' ||
    value === 'compare' ||
    value === 'vina-products' ||
    value === 'vina-quality' ||
    value === 'vina-inspectors' ||
    value === 'vina-cost' ||
    value === 'vina-ai' ||
    value === 'vina-compare'
  ) {
    return value
  }
  return options?.vina ? 'vina-products' : 'products'
}

/** 전역 필터 기간을 상세 URL에 실을 때 사용 (7차: 목록→상세 기간 유지)
 * 프리셋(올해·이번달 등)은 startDate/endDate 필드가 갱신되지 않을 수 있으므로
 * resolvePeriodRange로 실제 구간을 계산한다.
 */
export function periodOptionsFromFilters(
  filters: PeriodRangeFilters,
): { startDate?: string; endDate?: string } {
  const { startDate, endDate } = resolvedPeriodDateStrings({
    period: filters.period,
    startDate: filters.startDate?.trim() ?? '',
    endDate: filters.endDate?.trim() ?? '',
  })
  if (
    !DATE_PATTERN.test(startDate) ||
    !DATE_PATTERN.test(endDate) ||
    startDate > endDate
  ) {
    return {}
  }
  return { startDate, endDate }
}

/** URL의 startDate·endDate (유효할 때만) */
export function readUrlDateRange(searchParams: URLSearchParams) {
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  if (
    !startDate ||
    !endDate ||
    !DATE_PATTERN.test(startDate) ||
    !DATE_PATTERN.test(endDate) ||
    startDate > endDate
  ) {
    return null
  }
  return { startDate, endDate }
}

function appendCarriedPeriodParams(
  params: URLSearchParams,
  source: URLSearchParams,
) {
  for (const key of PERIOD_CARRY_KEYS) {
    const value = source.get(key)
    if (value) params.set(key, value)
  }
  // 7차: AI·VINA 목록 등 from 값을 상세 URL에 유지
  const from = source.get('from')
  if (from) params.set('from', from)
}

export function buildProductDetailHref(
  productId: string,
  from: ProductDetailFromId,
  options?: {
    startDate?: string
    endDate?: string
    weeklyReportPeriod?: WeeklyReportPeriodState
    worker?: string
    workerId?: string
    inspector?: string
    inspectorId?: string
    snapshotId?: string
    vina?: boolean
  },
): string {
  const params = new URLSearchParams({ from })
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  if (options?.weeklyReportPeriod) {
    const wr = options.weeklyReportPeriod
    params.set('month', wr.selectedMonthKey)
    params.set('week', String(wr.week))
    params.set('mode', wr.periodMode)
  }
  if (options?.worker) params.set('worker', options.worker)
  if (options?.workerId) params.set('workerId', options.workerId)
  if (options?.inspector) params.set('inspector', options.inspector)
  if (options?.inspectorId) params.set('inspectorId', options.inspectorId)
  if (options?.snapshotId) params.set('snapshotId', options.snapshotId)
  const base =
    options?.vina || from.startsWith('vina-')
      ? '/vina/products'
      : '/products'
  return `${base}/${productId}?${params.toString()}`
}

/** 품번 상세 → 성형작업자 상세 (조회기간·주간보고 복귀 파라미터 유지) */
export function buildWorkerDetailHref(
  workerId: string,
  options?: { product?: string; carryFrom?: URLSearchParams },
): string {
  const params = new URLSearchParams()
  if (options?.product) params.set('product', options.product)
  if (options?.carryFrom) appendCarriedPeriodParams(params, options.carryFrom)
  const q = params.toString()
  return `/workers/${workerId}${q ? `?${q}` : ''}`
}

/** 품번 상세 → 검사자 상세 (조회기간·주간보고 복귀 파라미터 유지) */
export function buildInspectorDetailHref(
  inspectorId: string,
  options?: { product?: string; carryFrom?: URLSearchParams; vina?: boolean },
): string {
  const params = new URLSearchParams()
  if (options?.product) params.set('product', options.product)
  if (options?.carryFrom) appendCarriedPeriodParams(params, options.carryFrom)
  const q = params.toString()
  const base = options?.vina ? '/vina/inspectors' : '/inspectors'
  return `${base}/${inspectorId}${q ? `?${q}` : ''}`
}

/**
 * 작업자/검사자 상세 → 품번 상세 복귀.
 * 주간보고에서 이어진 경우 from·기간을 유지한다.
 */
export function buildProductDetailReturnHref(
  productId: string,
  searchParams: URLSearchParams,
  options: {
    worker?: string
    workerId?: string
    inspector?: string
    inspectorId?: string
    vina?: boolean
  },
): string {
  const fromWeekly = searchParams.get('from') === 'weekly-report'
  const dateRange = readUrlDateRange(searchParams)
  const weeklyReportPeriod = fromWeekly
    ? parseWeeklyReportReturnFromProductDetail(searchParams)
    : null
  const from: ProductDetailFromId = fromWeekly
    ? 'weekly-report'
    : options.vina
      ? 'vina-inspectors'
      : options.worker || options.workerId
        ? 'workers'
        : 'inspectors'

  return buildProductDetailHref(productId, from, {
    startDate: dateRange?.startDate,
    endDate: dateRange?.endDate,
    weeklyReportPeriod: weeklyReportPeriod ?? undefined,
    worker: options.worker,
    workerId: options.workerId,
    inspector: options.inspector,
    inspectorId: options.inspectorId,
    snapshotId: searchParams.get('snapshotId') ?? undefined,
    vina: options.vina,
  })
}

/** 품번 상세 → 성형작업자 상세 복귀 */
export function buildWorkerAnalysisBackHref(
  searchParams: URLSearchParams,
  productName?: string,
): string {
  const workerId = searchParams.get('workerId')?.trim()
  if (!workerId) return PRODUCT_DETAIL_FROM_PATHS.workers
  return buildWorkerDetailHref(workerId, {
    product: productName,
    carryFrom: searchParams,
  })
}

/** 품번 상세 → 검사자 상세 복귀 */
export function buildInspectorAnalysisBackHref(
  searchParams: URLSearchParams,
  productName?: string,
  options?: { vina?: boolean },
): string {
  const inspectorId = searchParams.get('inspectorId')?.trim()
  if (!inspectorId) {
    return options?.vina
      ? PRODUCT_DETAIL_FROM_PATHS['vina-inspectors']
      : PRODUCT_DETAIL_FROM_PATHS.inspectors
  }
  return buildInspectorDetailHref(inspectorId, {
    product: productName,
    carryFrom: searchParams,
    vina: options?.vina,
  })
}

/** 품번 상세 → 주간업무 보고 복귀 (조회 조건 유지) */
export function buildWeeklyReportBackHref(
  searchParams: URLSearchParams,
): string {
  const parsed = parseWeeklyReportReturnFromProductDetail(searchParams)
  const snapshotId = searchParams.get('snapshotId')?.trim()
  if (parsed) {
    const href = buildWeeklyReportHref(parsed)
    if (!snapshotId) return href
    const params = new URLSearchParams(href.split('?')[1] ?? '')
    params.set('snapshotId', snapshotId)
    return `/weekly-report?${params.toString()}`
  }
  if (snapshotId) {
    return `/weekly-report?snapshotId=${encodeURIComponent(snapshotId)}`
  }
  return PRODUCT_DETAIL_FROM_PATHS['weekly-report']
}

function parseWeeklyReportReturnFromProductDetail(
  searchParams: URLSearchParams,
): WeeklyReportPeriodState | null {
  if (searchParams.get('from') !== 'weekly-report') return null

  const month = searchParams.get('month')
  const weekStr = searchParams.get('week')
  const mode = searchParams.get('mode')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  if (
    !month ||
    !/^\d{4}-\d{2}$/.test(month) ||
    !weekStr ||
    !startDate ||
    !endDate ||
    !DATE_PATTERN.test(startDate) ||
    !DATE_PATTERN.test(endDate) ||
    startDate > endDate
  ) {
    if (
      startDate &&
      endDate &&
      DATE_PATTERN.test(startDate) &&
      DATE_PATTERN.test(endDate) &&
      startDate <= endDate
    ) {
      return {
        selectedMonthKey: startDate.slice(0, 7),
        week: 1,
        periodMode: 'custom',
        rangeStart: startDate,
        rangeEnd: endDate,
      }
    }
    return null
  }

  const week = Number(weekStr)
  if (!Number.isInteger(week) || week < 1 || week > 6) return null

  const periodMode = mode === 'custom' ? 'custom' : 'week'

  return {
    selectedMonthKey: month,
    week,
    periodMode,
    rangeStart: startDate,
    rangeEnd: endDate,
  }
}
