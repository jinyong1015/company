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

export const PRODUCT_DETAIL_FROM_LABELS: Record<ProductDetailFromId, string> = {
  'weekly-report': '주간업무 보고',
  dashboard: '대시보드',
  products: '품번 분석',
  quality: '품질 분석',
  workers: '성형작업자 분석',
  inspectors: '검사자 분석',
  cost: '비용 분석',
}

export const PRODUCT_DETAIL_FROM_PATHS: Record<ProductDetailFromId, string> = {
  'weekly-report': '/weekly-report',
  dashboard: '/',
  products: '/products',
  quality: '/quality',
  workers: '/workers',
  inspectors: '/inspectors',
  cost: '/costs',
}

export function parseProductDetailFrom(
  value: string | null,
): ProductDetailFromId {
  if (
    value === 'weekly-report' ||
    value === 'dashboard' ||
    value === 'products' ||
    value === 'quality' ||
    value === 'workers' ||
    value === 'inspectors' ||
    value === 'cost'
  ) {
    return value
  }
  return 'products'
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
  return `/products/${productId}?${params.toString()}`
}

/** 품번 상세 → 성형작업자 상세 복귀 */
export function buildWorkerAnalysisBackHref(
  searchParams: URLSearchParams,
): string {
  const workerId = searchParams.get('workerId')?.trim()
  if (workerId) return `/workers/${workerId}`
  return PRODUCT_DETAIL_FROM_PATHS.workers
}

/** 품번 상세 → 검사자 상세 복귀 */
export function buildInspectorAnalysisBackHref(
  searchParams: URLSearchParams,
): string {
  const inspectorId = searchParams.get('inspectorId')?.trim()
  if (inspectorId) return `/inspectors/${inspectorId}`
  return PRODUCT_DETAIL_FROM_PATHS.inspectors
}

/** 품번 상세 → 주간업무 보고 복귀 (조회 조건 유지) */
export function buildWeeklyReportBackHref(
  searchParams: URLSearchParams,
): string {
  const parsed = parseWeeklyReportReturnFromProductDetail(searchParams)
  if (parsed) return buildWeeklyReportHref(parsed)
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
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
    startDate > endDate
  ) {
    if (
      startDate &&
      endDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(startDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(endDate) &&
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
