import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarRange } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { MonthlyTrendSection } from '../components/weekly-report/MonthlyTrendSection'
import { WeeklyIssuePanel } from '../components/weekly-report/WeeklyIssuePanel'
import { WeeklyProductionTable } from '../components/weekly-report/WeeklyProductionTable'
import { WeeklySnapshotBar } from '../components/weekly-report/WeeklySnapshotBar'
import { Worst5Card } from '../components/weekly-report/Worst5Card'
import { useData } from '../context/DataContext'
import { useAdmin } from '../context/AdminContext'
import { useToast } from '../context/ToastContext'
import {
  buildAutoWeeklyIssues,
  buildMonthlyReportView,
  buildWeeklyReportDetail,
  buildWeeklyReportDetailByDateRange,
  collectWorst5DetailRecords,
  findDefaultWeek,
  formatProductionPeriodLabel,
  getWeekDateRange,
  listWeeksInMonth,
  loadWorst5Thresholds,
  periodKeyFromPeriod,
  saveWeeklyIssues,
  saveWorst5Thresholds,
  syncWeeklyIssues,
  WEEKLY_REPORT_ORGS,
} from '../lib/weeklyReport'
import { cacheWeeklySnapshotDetailRecords } from '../lib/weeklySnapshotDetailCache'
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
import { isCloudSyncEnabled } from '../lib/supabase'
import {
  deleteWeeklyReportSnapshot,
  fetchWeeklyReportSnapshot,
  listWeeklyReportSnapshots,
  saveWeeklyReportSnapshot,
  type WeeklyReportSnapshotMeta,
  type WeeklyReportSnapshotRecord,
} from '../lib/weeklyReportSnapshot'

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

function monthHasAnalyzableData(
  records: InspectionRecord[],
  monthKey: string,
) {
  return records.some(
    (r) =>
      r.rowClass !== 'excluded' &&
      r.rowClass !== 'error' &&
      r.date.startsWith(monthKey),
  )
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

  // 저장된/URL 월에 실제 DATA가 없으면 데이터 기준 최신 월로 맞춤
  // (예: 9월만 업로드했는데 이전 선택 8월이 하이라이트되던 문제)
  if (
    records.length > 0 &&
    !monthHasAnalyzableData(records, merged.selectedMonthKey)
  ) {
    merged.selectedMonthKey = defaultMonth
    merged.week = defaultWeek
    merged.periodMode = 'week'
    merged.rangeStart = defaultRange.startDate
    merged.rangeEnd = defaultRange.endDate
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
  const { isAdmin, openLogin } = useAdmin()
  const { pushToast } = useToast()
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
  const [issuesSaving, setIssuesSaving] = useState(false)
  const [snapshotList, setSnapshotList] = useState<WeeklyReportSnapshotMeta[]>([])
  const [snapshotListLoading, setSnapshotListLoading] = useState(false)
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const [activeSnapshot, setActiveSnapshot] =
    useState<WeeklyReportSnapshotRecord | null>(null)
  // clear 시 React state와 Router searchParams가 한 틱 어긋나면
  // URL snapshotId 자동 로드 effect가 스냅샷을 다시 불러오는 것을 막는다.
  const clearingSnapshotRef = useRef(false)

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
    const snapshotId = searchParams.get('snapshotId')
    if (snapshotId && !clearingSnapshotRef.current) {
      nextParams.set('snapshotId', snapshotId)
    }
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
  const [issuesHydratedKey, setIssuesHydratedKey] = useState<string | null>(null)

  const periodKey = periodKeyFromPeriod(weeklyDetail.period)

  // 기간이 바뀌면 일단 로컬/자동 이슈를 보여주고, 이어서 원격 동기화
  useEffect(() => {
    setIssues(weeklyDetail.issues)
    setIssuesHydratedKey(null)
  }, [periodKey]) // eslint-disable-line react-hooks/exhaustive-deps -- period 변경 시에만 초기화

  // PC 간 공유: 원격(Supabase) 이슈를 불러와 반영 (원격이 있으면 항상 우선)
  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      setIssuesHydratedKey(periodKey)
      return
    }
    let cancelled = false
    ;(async () => {
      const synced = await syncWeeklyIssues(periodKey)
      if (cancelled) return
      if (synced) setIssues(synced)
      setIssuesHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey])

  // weeklyDetail이 같은 기간에서 재계산되어도, 이미 원격 반영된 이슈는 덮어쓰지 않음
  useEffect(() => {
    if (issuesHydratedKey === periodKey) return
    if (isCloudSyncEnabled()) return
    setIssues(weeklyDetail.issues)
  }, [weeklyDetail, periodKey, issuesHydratedKey])

  // 기간 변경 시 스냅샷 보기 해제 + 목록 로드
  // (첫 마운트에서는 URL snapshotId를 유지해 상세에서 복귀할 수 있게 함)
  const periodKeyRef = useRef<string | null>(null)
  useEffect(() => {
    const changed =
      periodKeyRef.current !== null && periodKeyRef.current !== periodKey
    periodKeyRef.current = periodKey

    if (changed) {
      clearingSnapshotRef.current = true
      setActiveSnapshot(null)
      setSearchParams(
        (prev) => {
          if (!prev.get('snapshotId')) return prev
          const next = new URLSearchParams(prev)
          next.delete('snapshotId')
          return next
        },
        { replace: true },
      )
    }

    if (!isCloudSyncEnabled()) {
      setSnapshotList([])
      setSnapshotListLoading(false)
      return
    }
    let cancelled = false
    setSnapshotListLoading(true)
    ;(async () => {
      const result = await listWeeklyReportSnapshots(periodKey)
      if (cancelled) return
      setSnapshotListLoading(false)
      setSnapshotList(result.ok ? result.items : [])
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey, setSearchParams])

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

  // 데이터 재업로드 등으로 선택 월에 실적이 없어지면 최신 데이터 월로 이동
  useEffect(() => {
    if (!records.length) return
    if (monthHasAnalyzableData(records, selectedMonthKey)) return
    const nextMonth = defaultMonthKey(records, new Date())
    if (nextMonth === selectedMonthKey) return
    handleMonthSelect(nextMonth)
  }, [records, selectedMonthKey, handleMonthSelect])

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

  const refreshSnapshotList = useCallback(async () => {
    if (!isCloudSyncEnabled()) {
      setSnapshotList([])
      return
    }
    setSnapshotListLoading(true)
    const result = await listWeeklyReportSnapshots(periodKey)
    setSnapshotListLoading(false)
    setSnapshotList(result.ok ? result.items : [])
  }, [periodKey])

  const handleSaveSnapshot = useCallback(async () => {
    if (!isAdmin) {
      openLogin()
      return
    }
    if (activeSnapshot) {
      pushToast('스냅샷 보기 중에는 저장할 수 없습니다. 실시간으로 돌아가 주세요.', 'info')
      return
    }
    setSnapshotSaving(true)
    try {
      const metrics: WeeklyReportMetric[] = [
        'failRate',
        'qty',
        'fail',
        'scrapCost',
      ]
      const monthlyByMetric = Object.fromEntries(
        metrics.map((m) => [m, buildMonthlyReportView(records, m, anchor)]),
      ) as Record<WeeklyReportMetric, ReturnType<typeof buildMonthlyReportView>>

      const detailRecords = collectWorst5DetailRecords(
        records,
        weeklyDetail.period,
        weeklyDetail.worst5,
      )

      const result = await saveWeeklyReportSnapshot({
        periodKey,
        title: weeklyDetail.title,
        payload: {
          period: weeklyDetail.period,
          title: weeklyDetail.title,
          productionRows: weeklyDetail.productionRows,
          issues,
          worst5: weeklyDetail.worst5,
          worst5Thresholds: weeklyDetail.worst5Thresholds,
          monthlyByMetric,
          selectedMonthKey,
          metric,
          detailRecords,
        },
      })
      if (!result.ok) {
        pushToast(`스냅샷 저장 실패: ${result.error ?? '알 수 없음'}`, 'error')
        return
      }
      if (result.id) {
        cacheWeeklySnapshotDetailRecords(result.id, detailRecords, false)
      }
      pushToast('주간보고 확정본을 저장했습니다.', 'success')
      await refreshSnapshotList()
    } finally {
      setSnapshotSaving(false)
    }
  }, [
    isAdmin,
    openLogin,
    activeSnapshot,
    pushToast,
    periodKey,
    weeklyDetail,
    issues,
    refreshSnapshotList,
    records,
    anchor,
    selectedMonthKey,
    metric,
  ])

  const handleSelectSnapshot = useCallback(
    async (id: string, options?: { silent?: boolean }) => {
      const result = await fetchWeeklyReportSnapshot(id)
      if (!result.ok || !result.record) {
        pushToast(`스냅샷을 불러오지 못했습니다: ${result.error ?? '알 수 없음'}`, 'error')
        return
      }
      setActiveSnapshot(result.record)
      const detailRecords = result.record.payload.detailRecords
      const missingDetail = !Object.prototype.hasOwnProperty.call(
        result.record.payload,
        'detailRecords',
      )
      cacheWeeklySnapshotDetailRecords(
        result.record.id,
        detailRecords ?? [],
        missingDetail,
      )
      if (result.record.payload.metric) {
        setMetric(result.record.payload.metric)
      }
      // URL에 snapshotId 유지 (상세 복귀용)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('snapshotId', id)
          return next
        },
        { replace: true },
      )
      if (!options?.silent) {
        pushToast('확정본을 불러왔습니다.', 'info')
      }
    },
    [pushToast, setSearchParams],
  )

  // URL snapshotId → 확정본 자동 로드 (상세에서 복귀 시)
  useEffect(() => {
    const id = searchParams.get('snapshotId')?.trim()
    if (!id) {
      clearingSnapshotRef.current = false
      if (activeSnapshot) setActiveSnapshot(null)
      return
    }
    if (clearingSnapshotRef.current) return
    if (activeSnapshot?.id === id) return
    void handleSelectSnapshot(id, { silent: true })
  }, [searchParams, activeSnapshot, handleSelectSnapshot])

  const clearActiveSnapshot = useCallback(() => {
    clearingSnapshotRef.current = true
    setActiveSnapshot(null)
    setSearchParams(
      (prev) => {
        if (!prev.get('snapshotId')) return prev
        const next = new URLSearchParams(prev)
        next.delete('snapshotId')
        return next
      },
      { replace: true },
    )
  }, [setSearchParams])

  const handleDeleteSnapshot = useCallback(
    async (id: string) => {
      if (!isAdmin) {
        openLogin()
        return
      }
      const confirmed = window.confirm('이 확정본을 삭제할까요?')
      if (!confirmed) return
      const result = await deleteWeeklyReportSnapshot(id)
      if (!result.ok) {
        pushToast(`스냅샷 삭제 실패: ${result.error ?? '알 수 없음'}`, 'error')
        return
      }
      if (activeSnapshot?.id === id) clearActiveSnapshot()
      pushToast('확정본을 삭제했습니다.', 'success')
      await refreshSnapshotList()
    },
    [isAdmin, openLogin, pushToast, activeSnapshot?.id, refreshSnapshotList, clearActiveSnapshot],
  )

  const handleSaveIssues = useCallback(
    async (next: typeof issues) => {
      if (!isAdmin) {
        pushToast('주간 ISSUE 수정은 관리자 모드에서만 가능합니다.', 'info')
        openLogin()
        return
      }
      if (activeSnapshot) {
        pushToast('스냅샷 보기 중에는 이슈를 수정할 수 없습니다.', 'info')
        return
      }
      const key = periodKeyFromPeriod(weeklyDetail.period)
      setIssues(next)
      setIssuesSaving(true)
      try {
        const result = await saveWeeklyIssues(key, next)
        if (!result.ok) {
          pushToast(
            `이슈는 이 PC에만 저장되었습니다. 공유 저장 실패: ${result.error ?? '알 수 없음'}`,
            'error',
          )
          return
        }
        if (result.synced) {
          pushToast('주간 ISSUE를 저장했습니다. 다른 PC에서도 동일하게 보입니다.', 'success')
        } else {
          pushToast(
            '이 PC에만 저장되었습니다. (공유 연결 실패 — 네트워크·Supabase 설정을 확인해 주세요.)',
            'info',
          )
        }
      } finally {
        setIssuesSaving(false)
      }
    },
    [weeklyDetail.period, pushToast, isAdmin, openLogin, activeSnapshot],
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

  const viewingSnapshot = Boolean(activeSnapshot)
  const shownTitle = activeSnapshot?.payload.title ?? weeklyDetail.title
  const shownPeriod = activeSnapshot?.payload.period ?? weeklyDetail.period
  const shownIssues = activeSnapshot?.payload.issues ?? issues
  const shownProductionRows =
    activeSnapshot?.payload.productionRows ?? displayProductionRows
  const shownWorst5 = activeSnapshot?.payload.worst5 ?? weeklyDetail.worst5
  const shownWorst5Thresholds =
    activeSnapshot?.payload.worst5Thresholds ?? worst5Thresholds
  const shownMonthlyView =
    activeSnapshot?.payload.monthlyByMetric?.[metric] ?? monthlyView
  const shownSelectedMonthKey =
    activeSnapshot?.payload.selectedMonthKey ?? selectedMonthKey

  const worst5LinkPeriod = useMemo<WeeklyReportPeriodState>(() => {
    if (!viewingSnapshot || !activeSnapshot) return periodState
    const p = activeSnapshot.payload.period
    return {
      selectedMonthKey: `${p.year}-${String(p.month).padStart(2, '0')}`,
      week: p.weekOfMonth,
      periodMode: p.isCustom ? 'custom' : 'week',
      rangeStart: p.startDate,
      rangeEnd: p.endDate,
    }
  }, [viewingSnapshot, activeSnapshot, periodState])

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
        view={shownMonthlyView}
        metric={metric}
        onMetricChange={setMetric}
        selectedMonthKey={shownSelectedMonthKey}
        onMonthSelect={viewingSnapshot ? () => undefined : handleMonthSelect}
      />

      <div className="space-y-4">
        <div className="rounded-2xl border border-line bg-white px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold text-ink">
                ◆ {shownTitle}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <CalendarRange size={14} className="shrink-0 text-accent" />
                <span className="num font-semibold text-ink">
                  {shownPeriod.startDate} ~ {shownPeriod.endDate}
                </span>
                {viewingSnapshot ? (
                  <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-bold text-accent">
                    확정 스냅샷
                  </span>
                ) : null}
                {shownPeriod.isCustom ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                    사용자 지정 기간
                  </span>
                ) : (
                  <span>{shownPeriod.label}</span>
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
          <>
            <WeeklySnapshotBar
              isAdmin={isAdmin}
              cloudReady={isCloudSyncEnabled()}
              saving={snapshotSaving}
              loadingList={snapshotListLoading}
              snapshots={snapshotList}
              activeSnapshotId={activeSnapshot?.id ?? null}
              onSave={() => void handleSaveSnapshot()}
              onSelect={(id) => void handleSelectSnapshot(id)}
              onClear={clearActiveSnapshot}
              onDelete={(id) => void handleDeleteSnapshot(id)}
              onRequestLogin={openLogin}
            />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="space-y-5 min-w-0">
                <Panel
                  title="주간 생산/검사 실적"
                  description={
                    viewingSnapshot
                      ? '확정본에 저장된 실적'
                      : '전주 대비 주차별 실적 비교'
                  }
                >
                  <WeeklyProductionTable
                    rows={shownProductionRows}
                    editableCustomPeriodLabel={
                      !viewingSnapshot && customProductionLabelKey
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
                  issues={shownIssues}
                  onSave={handleSaveIssues}
                  onAiGenerate={handleAiGenerateIssues}
                  saving={issuesSaving}
                  cloudSync={isCloudSyncEnabled()}
                  syncReady={issuesHydratedKey === periodKey}
                  canEdit={isAdmin && !viewingSnapshot}
                  onRequestLogin={openLogin}
                />
              </div>

              <div className="min-w-0 space-y-4">
                <p className="text-sm font-semibold text-ink">부적합 WORST 5</p>
                {WEEKLY_REPORT_ORGS.map((org) => (
                  <Worst5Card
                    key={org.id}
                    title={org.label}
                    color={org.color}
                    minQty={shownWorst5Thresholds[org.id]}
                    onMinQtyChange={
                      viewingSnapshot
                        ? undefined
                        : (value) => handleWorst5ThresholdChange(org.id, value)
                    }
                    items={shownWorst5[org.id] ?? []}
                    period={worst5LinkPeriod}
                    snapshotId={activeSnapshot?.id ?? null}
                  />
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
