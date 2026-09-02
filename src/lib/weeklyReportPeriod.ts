export type WeeklyReportPeriodMode = 'week' | 'custom'

export interface WeeklyReportPeriodState {
  selectedMonthKey: string
  week: number
  periodMode: WeeklyReportPeriodMode
  rangeStart: string
  rangeEnd: string
}

const STORAGE_KEY = 'weekly-report-period'
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_PATTERN = /^\d{4}-\d{2}$/

function isValidWeek(week: number) {
  return Number.isInteger(week) && week >= 1 && week <= 6
}

function isValidDateRange(start: string, end: string) {
  return DATE_PATTERN.test(start) && DATE_PATTERN.test(end) && start <= end
}

export function loadWeeklyReportPeriod(): WeeklyReportPeriodState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<WeeklyReportPeriodState>
    if (
      !parsed.selectedMonthKey ||
      !MONTH_PATTERN.test(parsed.selectedMonthKey) ||
      !isValidWeek(parsed.week ?? 0) ||
      (parsed.periodMode !== 'week' && parsed.periodMode !== 'custom') ||
      !parsed.rangeStart ||
      !parsed.rangeEnd ||
      !isValidDateRange(parsed.rangeStart, parsed.rangeEnd)
    ) {
      return null
    }
    return {
      selectedMonthKey: parsed.selectedMonthKey,
      week: parsed.week!,
      periodMode: parsed.periodMode!,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
    }
  } catch {
    return null
  }
}

export function saveWeeklyReportPeriod(state: WeeklyReportPeriodState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* ignore quota errors */
  }
}

export function parseWeeklyReportPeriodFromSearchParams(
  params: URLSearchParams,
): Partial<WeeklyReportPeriodState> | null {
  const month = params.get('month')
  const weekStr = params.get('week')
  const mode = params.get('mode')
  const startDate = params.get('startDate')
  const endDate = params.get('endDate')

  const hasContext =
    (month && MONTH_PATTERN.test(month)) ||
    (startDate && endDate && isValidDateRange(startDate, endDate))

  if (!hasContext) return null

  const partial: Partial<WeeklyReportPeriodState> = {}

  if (month && MONTH_PATTERN.test(month)) {
    partial.selectedMonthKey = month
  }
  if (weekStr) {
    const week = Number(weekStr)
    if (isValidWeek(week)) partial.week = week
  }
  if (mode === 'custom' || mode === 'week') {
    partial.periodMode = mode
  }
  if (startDate && DATE_PATTERN.test(startDate)) {
    partial.rangeStart = startDate
  }
  if (endDate && DATE_PATTERN.test(endDate)) {
    partial.rangeEnd = endDate
  }

  return partial
}

export function buildWeeklyReportSearchParams(
  state: WeeklyReportPeriodState,
): URLSearchParams {
  const params = new URLSearchParams()
  params.set('month', state.selectedMonthKey)
  params.set('week', String(state.week))
  params.set('mode', state.periodMode)
  params.set('startDate', state.rangeStart)
  params.set('endDate', state.rangeEnd)
  return params
}

export function buildWeeklyReportHref(state: WeeklyReportPeriodState): string {
  return `/weekly-report?${buildWeeklyReportSearchParams(state).toString()}`
}

export function weeklyReportPeriodParamsEqual(
  a: URLSearchParams,
  b: URLSearchParams,
) {
  const keys = ['month', 'week', 'mode', 'startDate', 'endDate'] as const
  return keys.every((key) => a.get(key) === b.get(key))
}
