import type { WeeklyReportPeriodState } from './weeklyReportPeriod'
import { buildWeeklyReportHref } from './weeklyReportPeriod'

export type ProductDetailFromId =
  | 'weekly-report'
  | 'dashboard'
  | 'products'
  | 'quality'

export const PRODUCT_DETAIL_FROM_LABELS: Record<ProductDetailFromId, string> = {
  'weekly-report': '주간업무 보고',
  dashboard: '대시보드',
  products: '품번 분석',
  quality: '품질 분석',
}

export const PRODUCT_DETAIL_FROM_PATHS: Record<ProductDetailFromId, string> = {
  'weekly-report': '/weekly-report',
  dashboard: '/',
  products: '/products',
  quality: '/quality',
}

export function parseProductDetailFrom(
  value: string | null,
): ProductDetailFromId {
  if (
    value === 'weekly-report' ||
    value === 'dashboard' ||
    value === 'products' ||
    value === 'quality'
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
  return `/products/${productId}?${params.toString()}`
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
