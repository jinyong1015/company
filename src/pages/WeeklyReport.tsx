import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { MonthlyTrendSection } from '../components/weekly-report/MonthlyTrendSection'
import { WeeklyIssuePanel } from '../components/weekly-report/WeeklyIssuePanel'
import { WeeklyProductionTable } from '../components/weekly-report/WeeklyProductionTable'
import { Worst5Card } from '../components/weekly-report/Worst5Card'
import { useData } from '../context/DataContext'
import {
  buildAutoWeeklyIssues,
  buildMonthlyReportView,
  buildWeeklyReportDetail,
  buildWeeklyReportDetailByDateRange,
  findDefaultWeek,
  formatProductionPeriodLabel,
  getWeekDateRange,
  listWeeksInMonth,
  loadWorst5Thresholds,
  periodKeyFromPeriod,
  saveWeeklyIssues,
  saveWorst5Thresholds,
  WEEKLY_REPORT_ORGS,
} from '../lib/weeklyReport'
import {
  formatProductionQueryPeriodTitle,
  loadProductionPeriodLabel,
  productionPeriodLabelKey,
  saveProductionPeriodLabel,
} from '../lib/weeklyReportProductionLabel'
import {
  buildWeeklyReportSearchParams,
  loadWeeklyReportPeriod,
  parseWeeklyReportPeriodFromSearchParams,
  saveWeeklyReportPeriod,
  weeklyReportPeriodParamsEqual,
  type WeeklyReportPeriodMode,
  type WeeklyReportPeriodState,
} from '../lib/weeklyReportPeriod'
import type { WeeklyReportMetric, WeeklyReportOrgId, InspectionRecord } from '../types'

type PeriodMode = WeeklyReportPeriodMode

function parseMonthKey(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  return { year: y, month: m }
}

function defaultMonthKey(records: { date: string }[], anchor: Date) {
  if (records.length) {
    const latest = [...records].sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest.date.slice(0, 7)
  }
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
}

function isValidDateRange(start: string, end: string) {
  return Boolean(start && end && start <= end)
}

function resolveWeeklyReportPeriod(
  records: InspectionRecord[],
  anchor: Date,
  searchParams: URLSearchParams,
): WeeklyReportPeriodState {
  const defaultMonth = defaultMonthKey(records, anchor)
  const { year: defaultYear, month: defaultMonthNum } =
    parseMonthKey(defaultMonth)
  const defaultWeek = findDefaultWeek(records, defaultYear, defaultMonthNum)
  const defaultRange = getWeekDateRange(
    defaultYear,
    defaultMonthNum,
    defaultWeek,
  )

  const base: WeeklyReportPeriodState = {
    selectedMonthKey: defaultMonth,
    week: defaultWeek,
    periodMode: 'week',
    rangeStart: defaultRange.startDate,
    rangeEnd: defaultRange.endDate,
  }

  const fromUrl = parseWeeklyReportPeriodFromSearchParams(searchParams)
  const fromStorage = loadWeeklyReportPeriod()
  const merged: WeeklyReportPeriodState = {
    ...base,
    ...(fromStorage ?? {}),
    ...(fromUrl ?? {}),
  }

  const { year, month } = parseMonthKey(merged.selectedMonthKey)
  if (!merged.week || merged.week < 1) {
    merged.week = findDefaultWeek(records, year, month)
  }

  if (merged.periodMode === 'custom') {
    if (!isValidDateRange(merged.rangeStart, merged.rangeEnd)) {
      merged.periodMode = 'week'
      const range = getWeekDateRange(year, month, merged.week)
      merged.rangeStart = range.startDate
      merged.rangeEnd = range.endDate
    }
  } else {
    merged.periodMode = 'week'
    const range = getWeekDateRange(year, month, merged.week)
    merged.rangeStart = range.startDate
    merged.rangeEnd = range.endDate
  }

  return merged
}

export function WeeklyReport() {
  const { records } = useData()
  const anchor = new Date()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialPeriod] = useState(() =>
    resolveWeeklyReportPeriod(records, anchor, searchParams),
  )
  const [metric, setMetric] = useState<WeeklyReportMetric>('failRate')
  const [selectedMonthKey, setSelectedMonthKey] = useState(
    initialPeriod.selectedMonthKey,
  )
  const [week, setWeek] = useState(initialPeriod.week)
  const [periodMode, setPeriodMode] = useState<PeriodMode>(
    initialPeriod.periodMode,
  )
  const [rangeStart, setRangeStart] = useState(initialPeriod.rangeStart)
  const [rangeEnd, setRangeEnd] = useState(initialPeriod.rangeEnd)
  const [worst5Thresholds, setWorst5Thresholds] = useState(() =>
    loadWorst5Thresholds(),
  )

  const monthlyView = useMemo(
    () => buildMonthlyReportView(records, metric, anchor),
    [records, metric, anchor],
  )

  const { year, month } = useMemo(
    () => parseMonthKey(selectedMonthKey),
    [selectedMonthKey],
  )

  const weeksInMonth = useMemo(
    () => listWeeksInMonth(records, year, month),
    [records, year, month],
  )

  const periodState = useMemo<WeeklyReportPeriodState>(
    () => ({
      selectedMonthKey,
      week,
      periodMode,
      rangeStart,
      rangeEnd,
    }),
    [selectedMonthKey, week, periodMode, rangeStart, rangeEnd],
  )

  useEffect(() => {
    saveWeeklyReportPeriod(periodState)
    const nextParams = buildWeeklyReportSearchParams(periodState)
    if (!weeklyReportPeriodParamsEqual(searchParams, nextParams)) {
      setSearchParams(nextParams, { replace: true })
    }
  }, [periodState, searchParams, setSearchParams])

  const weeklyDetail = useMemo(() => {
    if (
      periodMode === 'custom' &&
      isValidDateRange(rangeStart, rangeEnd)
    ) {
      return buildWeeklyReportDetailByDateRange(
        records,
        rangeStart,
        rangeEnd,
        { year, month, weekOfMonth: week },
        worst5Thresholds,
      )
    }
    return buildWeeklyReportDetail(
      records,
      year,
      month,
      week,
      worst5Thresholds,
    )
  }, [
    periodMode,
    rangeStart,
    rangeEnd,
    records,
    year,
    month,
    week,
    worst5Thresholds,
  ])

  const [issues, setIssues] = useState(weeklyDetail.issues)

  useEffect(() => {
    setIssues(weeklyDetail.issues)
  }, [weeklyDetail])

  const handleMonthSelect = useCallback(
    (monthKey: string) => {
      const { year: y, month: m } = parseMonthKey(monthKey)
      const defaultWeek = findDefaultWeek(records, y, m)
      const range = getWeekDateRange(y, m, defaultWeek)
      setSelectedMonthKey(monthKey)
      setWeek(defaultWeek)
      setPeriodMode('week')
      setRangeStart(range.startDate)
      setRangeEnd(range.endDate)
    },
    [records],
  )

  const handleWeekSelect = useCallback(
    (weekOfMonth: number) => {
      setWeek(weekOfMonth)
      setPeriodMode('week')
      const range = getWeekDateRange(year, month, weekOfMonth)
      setRangeStart(range.startDate)
      setRangeEnd(range.endDate)
    },
    [year, month],
  )

  const handleRangeStartChange = useCallback((value: string) => {
    setRangeStart(value)
    setPeriodMode('custom')
    setRangeEnd((prev) => (prev && value > prev ? value : prev))
  }, [])

  const handleRangeEndChange = useCallback((value: string) => {
    setRangeEnd(value)
    setPeriodMode('custom')
    setRangeStart((prev) => (prev && value < prev ? value : prev))
  }, [])

  const handleSaveIssues = useCallback(
    (next: typeof issues) => {
      const key = periodKeyFromPeriod(weeklyDetail.period)
      saveWeeklyIssues(key, next)
      setIssues(next)
    },
    [weeklyDetail.period],
  )

  const handleAiGenerateIssues = useCallback(() => {
    return buildAutoWeeklyIssues(weeklyDetail)
  }, [weeklyDetail])

  const handleWorst5ThresholdChange = useCallback(
    (orgId: WeeklyReportOrgId, value: number) => {
      setWorst5Thresholds((prev) => {
        const next = { ...prev, [orgId]: value }
        saveWorst5Thresholds(next)
        return next
      })
    },
    [],
  )

  const rangeInvalid =
    periodMode === 'custom' && !isValidDateRange(rangeStart, rangeEnd)

  const customProductionLabelKey = useMemo(() => {
    if (periodMode !== 'custom' || rangeInvalid) return null
    return productionPeriodLabelKey(rangeStart, rangeEnd)
  }, [periodMode, rangeInvalid, rangeStart, rangeEnd])

  const defaultCustomProductionLabel = useMemo(() => {
    if (!customProductionLabelKey) return ''
    return formatProductionPeriodLabel(rangeStart, rangeEnd)
  }, [customProductionLabelKey, rangeStart, rangeEnd])

  const [customProductionLabel, setCustomProductionLabel] = useState('')

  useEffect(() => {
    if (!customProductionLabelKey) return
    const saved = loadProductionPeriodLabel(customProductionLabelKey)
    setCustomProductionLabel(
      saved ?? formatProductionPeriodLabel(rangeStart, rangeEnd),
    )
  }, [customProductionLabelKey, rangeStart, rangeEnd])

  const displayProductionRows = useMemo(() => {
    if (!customProductionLabelKey) return weeklyDetail.productionRows
    return weeklyDetail.productionRows.map((row) =>
      row.isCurrent && row.periodKey.startsWith('custom:')
        ? { ...row, periodLabel: customProductionLabel }
        : row,
    )
  }, [
    weeklyDetail.productionRows,
    customProductionLabelKey,
    customProductionLabel,
  ])

  const handleCustomProductionLabelChange = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      const next =
        trimmed || formatProductionPeriodLabel(rangeStart, rangeEnd)
      setCustomProductionLabel(next)
      if (customProductionLabelKey) {
        saveProductionPeriodLabel(customProductionLabelKey, next)
      }
    },
    [customProductionLabelKey, rangeStart, rangeEnd],
  )

  if (!records.length) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="주간업무 보고"
          description="관리자용 주간 품질·부적합 보고 대시보드"
        />
        <Panel title="데이터 없음">
          <p className="text-sm text-muted">
            검사 DATA를 업로드하면 월별 추세와 주간 상세 현황을 확인할 수 있습니다.
          </p>
          <Link to="/manage" className="mt-3 inline-block text-sm font-medium text-accent">
            데이터 업로드 →
          </Link>
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="주간업무 보고"
        description="월별 품질·부적합 추세와 주차별 상세 현황을 한 화면에서 확인합니다."
      />

      <MonthlyTrendSection
        view={monthlyView}
        metric={metric}
        onMetricChange={setMetric}
        selectedMonthKey={selectedMonthKey}
        onMonthSelect={handleMonthSelect}
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink">
                ◆ {weeklyDetail.title}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <CalendarRange size={14} className="shrink-0 text-accent" />
                <span className="num font-semibold text-ink">
                  {weeklyDetail.period.startDate} ~ {weeklyDetail.period.endDate}
                </span>
                {weeklyDetail.period.isCustom ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    사용자 지정 기간
                  </span>
                ) : (
                  <span>{weeklyDetail.period.label}</span>
                )}
              </p>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div className="flex flex-wrap items-center justify-end gap-2">
                <select
                  value={selectedMonthKey}
                  onChange={(e) => handleMonthSelect(e.target.value)}
                  className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink"
                >
                  {monthlyView.months.map((m) => (
                    <option key={m.monthKey} value={m.monthKey}>
                      {m.monthLabel}
                    </option>
                  ))}
                </select>
                <div className="flex flex-wrap gap-1">
                  {weeksInMonth.map((w) => (
                    <button
                      key={w.weekOfMonth}
                      type="button"
                      onClick={() => handleWeekSelect(w.weekOfMonth)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        periodMode === 'week' && week === w.weekOfMonth
                          ? 'bg-accent text-white'
                          : w.hasData
                            ? 'bg-canvas text-muted hover:text-ink'
                            : 'bg-canvas/50 text-muted/50'
                      }`}
                    >
                      {w.weekOfMonth}주
                    </button>
                  ))}
                </div>
              </div>

              <div
                className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 ${
                  periodMode === 'custom'
                    ? 'border-accent/50 bg-accent/5 ring-1 ring-accent/20'
                    : 'border-line bg-canvas/40'
                }`}
              >
                <span className="text-[11px] font-semibold text-muted">
                  조회 기간
                </span>
                <input
                  type="date"
                  value={rangeStart}
                  onChange={(e) => handleRangeStartChange(e.target.value)}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink"
                  aria-label="시작일"
                />
                <span className="text-xs text-muted">~</span>
                <input
                  type="date"
                  value={rangeEnd}
                  onChange={(e) => handleRangeEndChange(e.target.value)}
                  className="rounded-lg border border-line bg-white px-2 py-1 text-xs text-ink"
                  aria-label="종료일"
                />
                {periodMode === 'week' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setPeriodMode('custom')
                    }}
                    className="text-[11px] text-muted underline-offset-2 hover:text-accent hover:underline"
                  >
                    직접 수정
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleWeekSelect(week)}
                    className="text-[11px] font-medium text-accent hover:underline"
                  >
                    {week}주차로 되돌리기
                  </button>
                )}
              </div>
            </div>
          </div>

          {rangeInvalid ? (
            <p className="mt-3 text-xs text-danger">
              종료일은 시작일과 같거나 이후여야 합니다.
            </p>
          ) : null}
        </div>

        {!rangeInvalid ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-5">
              <Panel
                title="주간 생산/검사 실적"
                description="전주 대비 주차별 실적 비교"
              >
                <WeeklyProductionTable
                  rows={displayProductionRows}
                  editableCustomPeriodLabel={
                    customProductionLabelKey
                      ? {
                          label: customProductionLabel,
                          defaultLabel: defaultCustomProductionLabel,
                          queryPeriodTitle: formatProductionQueryPeriodTitle(
                            rangeStart,
                            rangeEnd,
                          ),
                          onChange: handleCustomProductionLabelChange,
                        }
                      : undefined
                  }
                />
              </Panel>
              <WeeklyIssuePanel
                issues={issues}
                onSave={handleSaveIssues}
                onAiGenerate={handleAiGenerateIssues}
              />
            </div>

            <div className="space-y-4">
              <p className="text-sm font-semibold text-ink">부적합 WORST 5</p>
              {WEEKLY_REPORT_ORGS.map((org) => (
                <Worst5Card
                  key={org.id}
                  title={org.label}
                  color={org.color}
                  minQty={worst5Thresholds[org.id]}
                  onMinQtyChange={(value) =>
                    handleWorst5ThresholdChange(org.id, value)
                  }
                  items={weeklyDetail.worst5[org.id]}
                  period={periodState}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
