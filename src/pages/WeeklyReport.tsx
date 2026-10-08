import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CalendarRange, Maximize2 } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { ApprovalDocPanel } from '../components/weekly-report/ApprovalDocPanel'
import { CustomerNcPanel } from '../components/weekly-report/CustomerNcPanel'
import { InfoSharePanel } from '../components/weekly-report/InfoSharePanel'
import { MeasurementStatusPanel } from '../components/weekly-report/MeasurementStatusPanel'
import { MonthlyTrendSection } from '../components/weekly-report/MonthlyTrendSection'
import { WeeklyFullscreenOverlay } from '../components/weekly-report/WeeklyFullscreenOverlay'
import { WeeklyIssuePanel } from '../components/weekly-report/WeeklyIssuePanel'
import {
  VINA_PRODUCTION_COLUMNS,
  VINA_PRODUCTION_METRICS,
  WeeklyProductionTable,
} from '../components/weekly-report/WeeklyProductionTable'
import { WeeklySectionHeading } from '../components/weekly-report/WeeklySectionHeading'
import { WeeklySnapshotBar } from '../components/weekly-report/WeeklySnapshotBar'
import { Worst5Card } from '../components/weekly-report/Worst5Card'
import { useData } from '../context/DataContext'
import { useAdmin } from '../context/AdminContext'
import { useToast } from '../context/ToastContext'
import {
  buildAutoWeeklyIssues,
  buildMonthlyReportView,
  buildVinaMonthlyReportView,
  buildVinaWeeklyProductionRows,
  buildVinaWorst5Map,
  buildWeeklyReportDetail,
  buildWeeklyReportDetailByDateRange,
  collectWorst5DetailRecords,
  findDefaultWeek,
  formatProductionPeriodLabel,
  getWeekDateRange,
  listWeeksInMonth,
  loadVinaWorst5Thresholds,
  loadWorst5Thresholds,
  periodKeyFromPeriod,
  saveWeeklyIssues,
  saveVinaWorst5Thresholds,
  saveWorst5Thresholds,
  syncWeeklyIssues,
  VINA_MONTHLY_ORGS,
  WEEKLY_REPORT_ORGS,
} from '../lib/weeklyReport'
import { buildProductDetailHref } from '../lib/productDetailNav'
import { toEntityId } from '../lib/entityId'
import { loadVinaRecords } from '../lib/vinaStorage'
import {
  loadApprovalDocs,
  saveApprovalDocs,
  syncApprovalDocs,
} from '../lib/weeklyReportApprovalDocs'
import {
  loadCustomerNc,
  saveCustomerNc,
  syncCustomerNc,
} from '../lib/weeklyReportCustomerNc'
import {
  loadInfoShare,
  saveInfoShare,
  syncInfoShare,
} from '../lib/weeklyReportInfoShare'
import {
  loadMeasurementStatus,
  saveMeasurementStatus,
  syncMeasurementStatus,
} from '../lib/weeklyReportMeasurementStatus'
import {
  cacheWeeklySnapshotDetailRecords,
  cacheWeeklySnapshotVinaDetailRecords,
} from '../lib/weeklySnapshotDetailCache'
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
import type {
  ApprovalDocItem,
  CustomerNcItem,
  InfoShareItem,
  MeasurementStatusItem,
  WeeklyReportMetric,
  WeeklyReportOrgId,
  InspectionRecord,
} from '../types'
import { isCloudSyncEnabled } from '../lib/supabase'
import { listNonconformityPhotoRowsByIds } from '../lib/nonconformityPhotos'
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
  const { isAdmin, canEditWeeklyContent, openLogin } = useAdmin()
  const { pushToast } = useToast()
  const productOptions = useMemo(() => {
    const set = new Set<string>()
    for (const r of records) {
      const name = r.product?.trim()
      if (name && name !== '미지정') set.add(name)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [records])
  const anchor = new Date()
  const [searchParams, setSearchParams] = useSearchParams()
  const [initialPeriod] = useState(() =>
    resolveWeeklyReportPeriod(records, anchor, searchParams),
  )
  const [metric, setMetric] = useState<WeeklyReportMetric>('failRate')
  const [vinaMetric, setVinaMetric] = useState<WeeklyReportMetric>('failRate')
  const [vinaRecords, setVinaRecords] = useState<InspectionRecord[]>([])
  const [vinaRecordsReady, setVinaRecordsReady] = useState(false)
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
  const [vinaWorst5Thresholds, setVinaWorst5Thresholds] = useState(() =>
    loadVinaWorst5Thresholds(),
  )
  const [issuesSaving, setIssuesSaving] = useState(false)
  const [customerNc, setCustomerNc] = useState<CustomerNcItem[]>([])
  const [customerNcHydratedKey, setCustomerNcHydratedKey] = useState<
    string | null
  >(null)
  const [customerNcSaving, setCustomerNcSaving] = useState(false)
  const [approvalDocs, setApprovalDocs] = useState<ApprovalDocItem[]>([])
  const [approvalDocsHydratedKey, setApprovalDocsHydratedKey] = useState<
    string | null
  >(null)
  const [approvalDocsSaving, setApprovalDocsSaving] = useState(false)
  const [measurementStatus, setMeasurementStatus] = useState<
    MeasurementStatusItem[]
  >([])
  const [measurementStatusHydratedKey, setMeasurementStatusHydratedKey] =
    useState<string | null>(null)
  const [measurementStatusSaving, setMeasurementStatusSaving] = useState(false)
  const [infoShare, setInfoShare] = useState<InfoShareItem[]>([])
  const [infoShareHydratedKey, setInfoShareHydratedKey] = useState<
    string | null
  >(null)
  const [infoShareSaving, setInfoShareSaving] = useState(false)
  const [snapshotList, setSnapshotList] = useState<WeeklyReportSnapshotMeta[]>([])
  const [snapshotListLoading, setSnapshotListLoading] = useState(false)
  const [snapshotSaving, setSnapshotSaving] = useState(false)
  const [activeSnapshot, setActiveSnapshot] =
    useState<WeeklyReportSnapshotRecord | null>(null)
  const [productionFullscreen, setProductionFullscreen] = useState(false)
  const [vinaProductionFullscreen, setVinaProductionFullscreen] =
    useState(false)
  const [worst5Fullscreen, setWorst5Fullscreen] = useState(false)
  const [vinaWorst5Fullscreen, setVinaWorst5Fullscreen] = useState(false)
  const [pendingDeleteSnapshotId, setPendingDeleteSnapshotId] = useState<
    string | null
  >(null)
  const [snapshotDeleting, setSnapshotDeleting] = useState(false)
  // clear 시 React state와 Router searchParams가 한 틱 어긋나면
  // URL snapshotId 자동 로드 effect가 스냅샷을 다시 불러오는 것을 막는다.
  const clearingSnapshotRef = useRef(false)

  const monthlyView = useMemo(
    () => buildMonthlyReportView(records, metric, anchor),
    [records, metric, anchor],
  )

  // 주간보고에서도 VINA IndexedDB를 읽어 3-2 월별 현황·스냅샷에 사용
  useEffect(() => {
    let cancelled = false
    void loadVinaRecords()
      .then((loaded) => {
        if (cancelled) return
        setVinaRecords(loaded)
        setVinaRecordsReady(true)
      })
      .catch(() => {
        if (cancelled) return
        setVinaRecords([])
        setVinaRecordsReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const vinaMonthlyView = useMemo(
    () => buildVinaMonthlyReportView(vinaRecords, vinaMetric, anchor),
    [vinaRecords, vinaMetric, anchor],
  )

  const { year, month } = useMemo(
    () => parseMonthKey(selectedMonthKey),
    [selectedMonthKey],
  )

  const vinaProductionRows = useMemo(
    () =>
      buildVinaWeeklyProductionRows(vinaRecords, {
        year,
        month,
        weekOfMonth: week,
        periodMode,
        rangeStart,
        rangeEnd,
      }),
    [vinaRecords, year, month, week, periodMode, rangeStart, rangeEnd],
  )

  const vinaWorst5Period = useMemo(() => {
    if (periodMode === 'custom' && isValidDateRange(rangeStart, rangeEnd)) {
      return { startDate: rangeStart, endDate: rangeEnd }
    }
    return getWeekDateRange(year, month, week)
  }, [periodMode, rangeStart, rangeEnd, year, month, week])

  const vinaWorst5 = useMemo(
    () =>
      buildVinaWorst5Map(
        vinaRecords,
        vinaWorst5Period,
        vinaWorst5Thresholds,
      ),
    [vinaRecords, vinaWorst5Period, vinaWorst5Thresholds],
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

  // 기간이 바뀌면 일단 자동 이슈를 보여주고, 이어서 원격 동기화
  useEffect(() => {
    setIssues(weeklyDetail.issues)
    setIssuesHydratedKey(null)
  }, [periodKey]) // eslint-disable-line react-hooks/exhaustive-deps -- period 변경 시에만 초기화

  // 원격(Supabase)만 Source of Truth. 있으면 반영, 없으면 자동 이슈 유지(로컬 재업로드 없음)
  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      setIssuesHydratedKey(periodKey)
      return
    }
    let cancelled = false
    ;(async () => {
      const synced = await syncWeeklyIssues(periodKey)
      if (cancelled) return
      if (synced) {
        setIssues(synced)
      } else {
        setIssues(weeklyDetail.issues)
      }
      setIssuesHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey]) // eslint-disable-line react-hooks/exhaustive-deps -- period 변경 시 원격 조회

  // 클라우드 미사용: weeklyDetail 재계산 시 이슈 반영
  useEffect(() => {
    if (issuesHydratedKey === periodKey) return
    if (isCloudSyncEnabled()) return
    setIssues(weeklyDetail.issues)
  }, [weeklyDetail, periodKey, issuesHydratedKey])

  // 고객사 부적합 현황 — 기간 변경 시 초기화 후 원격/로컬 동기화
  useEffect(() => {
    setCustomerNc([])
    setCustomerNcHydratedKey(null)
  }, [periodKey])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isCloudSyncEnabled()) {
        if (cancelled) return
        setCustomerNc(loadCustomerNc(periodKey) ?? [])
        setCustomerNcHydratedKey(periodKey)
        return
      }
      const synced = await syncCustomerNc(periodKey)
      if (cancelled) return
      setCustomerNc(synced)
      setCustomerNcHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey])

  // 승인서류 제출현황 — 기간 변경 시 초기화 후 원격/로컬 동기화
  useEffect(() => {
    setApprovalDocs([])
    setApprovalDocsHydratedKey(null)
  }, [periodKey])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isCloudSyncEnabled()) {
        if (cancelled) return
        setApprovalDocs(loadApprovalDocs(periodKey) ?? [])
        setApprovalDocsHydratedKey(periodKey)
        return
      }
      const synced = await syncApprovalDocs(periodKey)
      if (cancelled) return
      setApprovalDocs(synced)
      setApprovalDocsHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey])

  // 측정현황 — 기간 변경 시 초기화 후 원격/로컬 동기화
  useEffect(() => {
    setMeasurementStatus([])
    setMeasurementStatusHydratedKey(null)
  }, [periodKey])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isCloudSyncEnabled()) {
        if (cancelled) return
        setMeasurementStatus(loadMeasurementStatus(periodKey) ?? [])
        setMeasurementStatusHydratedKey(periodKey)
        return
      }
      const synced = await syncMeasurementStatus(periodKey)
      if (cancelled) return
      setMeasurementStatus(synced)
      setMeasurementStatusHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey])

  // 정보공유 및 대외일정 — 기간 변경 시 초기화 후 원격/로컬 동기화
  useEffect(() => {
    setInfoShare([])
    setInfoShareHydratedKey(null)
  }, [periodKey])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!isCloudSyncEnabled()) {
        if (cancelled) return
        setInfoShare(loadInfoShare(periodKey) ?? [])
        setInfoShareHydratedKey(periodKey)
        return
      }
      const synced = await syncInfoShare(periodKey)
      if (cancelled) return
      setInfoShare(synced)
      setInfoShareHydratedKey(periodKey)
    })()
    return () => {
      cancelled = true
    }
  }, [periodKey])

  // 기간(주차·지정기간) 변경 시 스냅샷 보기만 해제
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
  }, [periodKey, setSearchParams])

  // 선택 월 기준 스냅샷 목록 (해당 월 주차·조회기간이 월에 겹치는 확정본 전부)
  useEffect(() => {
    if (!isCloudSyncEnabled()) {
      setSnapshotList([])
      setSnapshotListLoading(false)
      return
    }
    let cancelled = false
    setSnapshotListLoading(true)
    ;(async () => {
      const result = await listWeeklyReportSnapshots(selectedMonthKey)
      if (cancelled) return
      setSnapshotListLoading(false)
      setSnapshotList(result.ok ? result.items : [])
    })()
    return () => {
      cancelled = true
    }
  }, [selectedMonthKey])

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

  // 데이터 재업로드 등으로 선택 월에 실적이 없어진 경우에만 최신 데이터 월로 이동.
  // selectedMonthKey를 deps에 넣으면 실적 없는 월을 골라도 즉시 되돌아가 제목이 안 바뀌는 것처럼 보인다.
  useEffect(() => {
    if (!records.length) return
    if (monthHasAnalyzableData(records, selectedMonthKey)) return
    const nextMonth = defaultMonthKey(records, new Date())
    if (nextMonth === selectedMonthKey) return
    handleMonthSelect(nextMonth)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- records 변경 시에만 보정
  }, [records])

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
    const result = await listWeeklyReportSnapshots(selectedMonthKey)
    setSnapshotListLoading(false)
    setSnapshotList(result.ok ? result.items : [])
  }, [selectedMonthKey])

  const handleSaveSnapshot = useCallback(async () => {
    if (!isAdmin) {
      openLogin('admin')
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

      // 스냅샷 시점의 VINA 월별 현황을 지표별로 동결 저장
      let vinaSource = vinaRecords
      try {
        vinaSource = await loadVinaRecords()
      } catch {
        /* 이미 로드된 vinaRecords 사용 */
      }
      const vinaMonthlyByMetric = Object.fromEntries(
        metrics.map((m) => [
          m,
          buildVinaMonthlyReportView(vinaSource, m, anchor),
        ]),
      ) as Record<
        WeeklyReportMetric,
        ReturnType<typeof buildVinaMonthlyReportView>
      >

      const snapVinaProductionRows = buildVinaWeeklyProductionRows(vinaSource, {
        year,
        month,
        weekOfMonth: week,
        periodMode,
        rangeStart,
        rangeEnd,
      })

      const snapVinaWorst5Period =
        periodMode === 'custom' && isValidDateRange(rangeStart, rangeEnd)
          ? { startDate: rangeStart, endDate: rangeEnd }
          : getWeekDateRange(year, month, week)
      const snapVinaWorst5 = buildVinaWorst5Map(
        vinaSource,
        snapVinaWorst5Period,
        vinaWorst5Thresholds,
      )

      const detailRecords = collectWorst5DetailRecords(
        records,
        weeklyDetail.period,
        weeklyDetail.worst5,
      )
      const vinaDetailRecords = collectWorst5DetailRecords(
        vinaSource,
        snapVinaWorst5Period,
        snapVinaWorst5,
      )

      const customerNcPhotos = await listNonconformityPhotoRowsByIds(
        customerNc.map((item) => item.id),
        periodKey,
      )

      const result = await saveWeeklyReportSnapshot({
        periodKey,
        title: weeklyDetail.title,
        payload: {
          period: weeklyDetail.period,
          title: weeklyDetail.title,
          productionRows: weeklyDetail.productionRows,
          issues,
          customerNc,
          customerNcPhotos,
          approvalDocs,
          measurementStatus,
          infoShare,
          worst5: weeklyDetail.worst5,
          worst5Thresholds: weeklyDetail.worst5Thresholds,
          monthlyByMetric,
          vinaMonthlyByMetric,
          vinaMetric,
          vinaProductionRows: snapVinaProductionRows,
          vinaWorst5: snapVinaWorst5,
          vinaWorst5Thresholds,
          selectedMonthKey,
          metric,
          detailRecords,
          vinaDetailRecords,
        },
      })
      if (!result.ok) {
        pushToast(`스냅샷 저장 실패: ${result.error ?? '알 수 없음'}`, 'error')
        return
      }
      if (result.id) {
        cacheWeeklySnapshotDetailRecords(result.id, detailRecords, false)
        cacheWeeklySnapshotVinaDetailRecords(
          result.id,
          vinaDetailRecords,
          false,
        )
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
    customerNc,
    approvalDocs,
    measurementStatus,
    infoShare,
    refreshSnapshotList,
    records,
    vinaRecords,
    anchor,
    selectedMonthKey,
    metric,
    vinaMetric,
    year,
    month,
    week,
    periodMode,
    rangeStart,
    rangeEnd,
    vinaWorst5Thresholds,
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
      const missingVinaDetail = !Object.prototype.hasOwnProperty.call(
        result.record.payload,
        'vinaDetailRecords',
      )
      cacheWeeklySnapshotVinaDetailRecords(
        result.record.id,
        result.record.payload.vinaDetailRecords ?? [],
        missingVinaDetail,
      )
      if (result.record.payload.metric) {
        setMetric(result.record.payload.metric)
      }
      if (result.record.payload.vinaMetric) {
        setVinaMetric(result.record.payload.vinaMetric)
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
    (id: string) => {
      if (!isAdmin) {
        openLogin('admin')
        return
      }
      setPendingDeleteSnapshotId(id)
    },
    [isAdmin, openLogin],
  )

  const handleConfirmDeleteSnapshot = useCallback(async () => {
    const id = pendingDeleteSnapshotId
    if (!id || snapshotDeleting) return
    setSnapshotDeleting(true)
    try {
      const result = await deleteWeeklyReportSnapshot(id)
      if (!result.ok) {
        pushToast(`스냅샷 삭제 실패: ${result.error ?? '알 수 없음'}`, 'error')
        return
      }
      if (activeSnapshot?.id === id) clearActiveSnapshot()
      pushToast('확정본을 삭제했습니다.', 'success')
      setPendingDeleteSnapshotId(null)
      await refreshSnapshotList()
    } finally {
      setSnapshotDeleting(false)
    }
  }, [
    pendingDeleteSnapshotId,
    snapshotDeleting,
    pushToast,
    activeSnapshot?.id,
    clearActiveSnapshot,
    refreshSnapshotList,
  ])

  const handleSaveIssues = useCallback(
    async (next: typeof issues) => {
      if (!canEditWeeklyContent) {
        pushToast(
          'WORST 주간 ISSUE 수정은 실무자 또는 관리자 로그인이 필요합니다.',
          'info',
        )
        openLogin('manager')
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
          pushToast('WORST 주간 ISSUE를 저장했습니다. 다른 PC에서도 동일하게 보입니다.', 'success')
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
    [
      weeklyDetail.period,
      pushToast,
      canEditWeeklyContent,
      openLogin,
      activeSnapshot,
    ],
  )

  const handleSaveCustomerNc = useCallback(
    async (next: CustomerNcItem[]) => {
      if (!canEditWeeklyContent) {
        pushToast(
          '고객사 부적합 현황 수정은 실무자 또는 관리자 로그인이 필요합니다.',
          'info',
        )
        openLogin('manager')
        return
      }
      if (activeSnapshot) {
        pushToast(
          '스냅샷 보기 중에는 고객사 부적합 현황을 수정할 수 없습니다.',
          'info',
        )
        return
      }
      const key = periodKeyFromPeriod(weeklyDetail.period)
      setCustomerNc(next)
      setCustomerNcSaving(true)
      try {
        const result = await saveCustomerNc(key, next)
        if (!result.ok) {
          pushToast(
            `고객사 부적합은 이 PC에만 저장되었습니다. 공유 저장 실패: ${result.error ?? '알 수 없음'}`,
            'error',
          )
          return
        }
        if (result.synced) {
          pushToast(
            '고객사 부적합 현황을 저장했습니다. 다른 PC에서도 동일하게 보입니다.',
            'success',
          )
        } else {
          pushToast(
            '이 PC에만 저장되었습니다. (공유 연결 실패 — 네트워크·Supabase 설정을 확인해 주세요.)',
            'info',
          )
        }
      } finally {
        setCustomerNcSaving(false)
      }
    },
    [
      weeklyDetail.period,
      pushToast,
      canEditWeeklyContent,
      openLogin,
      activeSnapshot,
    ],
  )

  const handleSaveApprovalDocs = useCallback(
    async (next: ApprovalDocItem[]) => {
      if (!canEditWeeklyContent) {
        pushToast(
          '승인서류 제출현황 수정은 실무자 또는 관리자 로그인이 필요합니다.',
          'info',
        )
        openLogin('manager')
        return
      }
      if (activeSnapshot) {
        pushToast(
          '스냅샷 보기 중에는 승인서류 제출현황을 수정할 수 없습니다.',
          'info',
        )
        return
      }
      const key = periodKeyFromPeriod(weeklyDetail.period)
      setApprovalDocs(next)
      setApprovalDocsSaving(true)
      try {
        const result = await saveApprovalDocs(key, next)
        if (!result.ok) {
          pushToast(
            `승인서류 제출현황은 이 PC에만 저장되었습니다. 공유 저장 실패: ${result.error ?? '알 수 없음'}`,
            'error',
          )
          return
        }
        if (result.synced) {
          pushToast(
            '승인서류 제출현황을 저장했습니다. 다른 PC에서도 동일하게 보입니다.',
            'success',
          )
        } else {
          pushToast(
            '이 PC에만 저장되었습니다. (공유 연결 실패 — 네트워크·Supabase 설정을 확인해 주세요.)',
            'info',
          )
        }
      } finally {
        setApprovalDocsSaving(false)
      }
    },
    [
      weeklyDetail.period,
      pushToast,
      canEditWeeklyContent,
      openLogin,
      activeSnapshot,
    ],
  )

  const handleSaveMeasurementStatus = useCallback(
    async (next: MeasurementStatusItem[]) => {
      if (!canEditWeeklyContent) {
        pushToast(
          '측정현황 수정은 실무자 또는 관리자 로그인이 필요합니다.',
          'info',
        )
        openLogin('manager')
        return
      }
      if (activeSnapshot) {
        pushToast('스냅샷 보기 중에는 측정현황을 수정할 수 없습니다.', 'info')
        return
      }
      const key = periodKeyFromPeriod(weeklyDetail.period)
      setMeasurementStatus(next)
      setMeasurementStatusSaving(true)
      try {
        const result = await saveMeasurementStatus(key, next)
        if (!result.ok) {
          pushToast(
            `측정현황은 이 PC에만 저장되었습니다. 공유 저장 실패: ${result.error ?? '알 수 없음'}`,
            'error',
          )
          return
        }
        if (result.synced) {
          pushToast(
            '측정현황을 저장했습니다. 다른 PC에서도 동일하게 보입니다.',
            'success',
          )
        } else {
          pushToast(
            '이 PC에만 저장되었습니다. (공유 연결 실패 — 네트워크·Supabase 설정을 확인해 주세요.)',
            'info',
          )
        }
      } finally {
        setMeasurementStatusSaving(false)
      }
    },
    [
      weeklyDetail.period,
      pushToast,
      canEditWeeklyContent,
      openLogin,
      activeSnapshot,
    ],
  )

  const handleSaveInfoShare = useCallback(
    async (next: InfoShareItem[]) => {
      if (!canEditWeeklyContent) {
        pushToast(
          '정보공유 및 대외일정 수정은 실무자 또는 관리자 로그인이 필요합니다.',
          'info',
        )
        openLogin('manager')
        return
      }
      if (activeSnapshot) {
        pushToast(
          '스냅샷 보기 중에는 정보공유 및 대외일정을 수정할 수 없습니다.',
          'info',
        )
        return
      }
      const key = periodKeyFromPeriod(weeklyDetail.period)
      setInfoShare(next)
      setInfoShareSaving(true)
      try {
        const result = await saveInfoShare(key, next)
        if (!result.ok) {
          pushToast(
            `정보공유 및 대외일정은 이 PC에만 저장되었습니다. 공유 저장 실패: ${result.error ?? '알 수 없음'}`,
            'error',
          )
          return
        }
        if (result.synced) {
          pushToast(
            '정보공유 및 대외일정을 저장했습니다. 다른 PC에서도 동일하게 보입니다.',
            'success',
          )
        } else {
          pushToast(
            '이 PC에만 저장되었습니다. (공유 연결 실패 — 네트워크·Supabase 설정을 확인해 주세요.)',
            'info',
          )
        }
      } finally {
        setInfoShareSaving(false)
      }
    },
    [
      weeklyDetail.period,
      pushToast,
      canEditWeeklyContent,
      openLogin,
      activeSnapshot,
    ],
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

  const handleVinaWorst5ThresholdChange = useCallback(
    (orgId: WeeklyReportOrgId, value: number) => {
      setVinaWorst5Thresholds((prev) => {
        const next = { ...prev, [orgId]: value }
        saveVinaWorst5Thresholds(next)
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

  const displayVinaProductionRows = useMemo(() => {
    if (!customProductionLabelKey) return vinaProductionRows
    return vinaProductionRows.map((row) =>
      row.isCurrent && row.periodKey.startsWith('custom:')
        ? { ...row, periodLabel: customProductionLabel }
        : row,
    )
  }, [vinaProductionRows, customProductionLabelKey, customProductionLabel])

  const viewingSnapshot = Boolean(activeSnapshot)
  const shownTitle = activeSnapshot?.payload.title ?? weeklyDetail.title
  const shownPeriod = activeSnapshot?.payload.period ?? weeklyDetail.period
  const shownIssues = activeSnapshot?.payload.issues ?? issues
  const shownCustomerNc = viewingSnapshot
    ? (activeSnapshot?.payload.customerNc ?? [])
    : customerNc
  const shownApprovalDocs = viewingSnapshot
    ? (activeSnapshot?.payload.approvalDocs ?? [])
    : approvalDocs
  const shownMeasurementStatus = viewingSnapshot
    ? (activeSnapshot?.payload.measurementStatus ?? [])
    : measurementStatus
  const shownInfoShare = viewingSnapshot
    ? (activeSnapshot?.payload.infoShare ?? [])
    : infoShare
  /** 스냅샷에 customerNcPhotos 키가 있으면 동결본 사용, 없으면(구버전) 해당 period 실시간 조회 */
  const shownCustomerNcPhotos = useMemo(() => {
    if (!viewingSnapshot || !activeSnapshot) return undefined
    if (
      !Object.prototype.hasOwnProperty.call(
        activeSnapshot.payload,
        'customerNcPhotos',
      )
    ) {
      return undefined
    }
    return activeSnapshot.payload.customerNcPhotos ?? {}
  }, [viewingSnapshot, activeSnapshot])
  const shownProductionRows =
    activeSnapshot?.payload.productionRows ?? displayProductionRows
  const shownWorst5 = activeSnapshot?.payload.worst5 ?? weeklyDetail.worst5
  const shownWorst5Thresholds =
    activeSnapshot?.payload.worst5Thresholds ?? worst5Thresholds
  const shownMonthlyView =
    activeSnapshot?.payload.monthlyByMetric?.[metric] ?? monthlyView
  const shownVinaMonthlyView =
    activeSnapshot?.payload.vinaMonthlyByMetric?.[vinaMetric] ??
    vinaMonthlyView
  const hasShownVinaMonthly = viewingSnapshot
    ? Boolean(activeSnapshot?.payload.vinaMonthlyByMetric)
    : vinaRecords.length > 0
  const shownVinaProductionRows =
    activeSnapshot?.payload.vinaProductionRows ?? displayVinaProductionRows
  const hasShownVinaProduction = viewingSnapshot
    ? Boolean(activeSnapshot?.payload.vinaProductionRows)
    : vinaRecords.length > 0
  const shownVinaWorst5 =
    activeSnapshot?.payload.vinaWorst5 ?? vinaWorst5
  const shownVinaWorst5Thresholds =
    activeSnapshot?.payload.vinaWorst5Thresholds ?? vinaWorst5Thresholds
  const hasShownVinaWorst5 = viewingSnapshot
    ? Boolean(activeSnapshot?.payload.vinaWorst5)
    : vinaRecords.length > 0
  const hasAnyVinaSection =
    hasShownVinaMonthly || hasShownVinaProduction || hasShownVinaWorst5
  const shownSelectedMonthKey =
    activeSnapshot?.payload.selectedMonthKey ?? selectedMonthKey

  const vinaWorst5LinkRange = useMemo(() => {
    if (viewingSnapshot && activeSnapshot) {
      return {
        startDate: activeSnapshot.payload.period.startDate,
        endDate: activeSnapshot.payload.period.endDate,
      }
    }
    return vinaWorst5Period
  }, [viewingSnapshot, activeSnapshot, vinaWorst5Period])

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

  const vinaWorst5ProductHref = useCallback(
    (product: string) =>
      buildProductDetailHref(toEntityId('prd', product), 'weekly-report', {
        vina: true,
        startDate: vinaWorst5LinkRange.startDate,
        endDate: vinaWorst5LinkRange.endDate,
        weeklyReportPeriod: worst5LinkPeriod,
        snapshotId: activeSnapshot?.id ?? undefined,
      }),
    [
      vinaWorst5LinkRange.startDate,
      vinaWorst5LinkRange.endDate,
      worst5LinkPeriod,
      activeSnapshot?.id,
    ],
  )

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

  const editableCustomPeriodLabel =
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

  const productionDescription = viewingSnapshot
    ? '확정본에 저장된 실적'
    : '전주 대비 주차별 실적 비교'

  const closeProductionFullscreen = useCallback(() => {
    setProductionFullscreen(false)
  }, [])

  const closeVinaProductionFullscreen = useCallback(() => {
    setVinaProductionFullscreen(false)
  }, [])

  const closeWorst5Fullscreen = useCallback(() => {
    setWorst5Fullscreen(false)
  }, [])

  const closeVinaWorst5Fullscreen = useCallback(() => {
    setVinaWorst5Fullscreen(false)
  }, [])

  const vinaProductionDescription = viewingSnapshot
    ? '확정본에 저장된 VINA 실적'
    : 'VINA 데이터 · 전주 대비 주차별 실적 비교'

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
      <PageHeader title="주간업무 보고" />

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
        onDelete={handleDeleteSnapshot}
        onRequestLogin={() => openLogin('admin')}
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
            <WeeklySectionHeading title="1. 고객사 부적합 현황" />
            <CustomerNcPanel
              items={shownCustomerNc}
              productOptions={productOptions}
              periodKey={
                viewingSnapshot
                  ? shownCustomerNcPhotos !== undefined
                    ? `snapshot:${activeSnapshot?.id ?? ''}`
                    : (activeSnapshot?.periodKey ?? periodKey)
                  : periodKey
              }
              periodLabel={
                shownPeriod.isCustom
                  ? `${shownPeriod.startDate} ~ ${shownPeriod.endDate}`
                  : shownPeriod.label
              }
              frozenPhotos={shownCustomerNcPhotos}
              onSave={handleSaveCustomerNc}
              saving={customerNcSaving}
              cloudSync={isCloudSyncEnabled()}
              syncReady={
                viewingSnapshot || customerNcHydratedKey === periodKey
              }
              canEdit={canEditWeeklyContent && !viewingSnapshot}
              onRequestLogin={() => openLogin('manager')}
            />

            <WeeklySectionHeading title="2. 승인서류 제출현황" />
            <ApprovalDocPanel
              items={shownApprovalDocs}
              onSave={handleSaveApprovalDocs}
              saving={approvalDocsSaving}
              cloudSync={isCloudSyncEnabled()}
              syncReady={
                viewingSnapshot || approvalDocsHydratedKey === periodKey
              }
              canEdit={canEditWeeklyContent && !viewingSnapshot}
              onRequestLogin={() => openLogin('manager')}
            />

            <WeeklySectionHeading title="3. 사내 부적합 현황" />

            <MonthlyTrendSection
              view={shownMonthlyView}
              metric={metric}
              onMetricChange={setMetric}
              selectedMonthKey={shownSelectedMonthKey}
            />

            <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div className="space-y-5 min-w-0">
                <Panel
                  title="주간 생산/검사 실적"
                  description={productionDescription}
                  actions={
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-1.5 text-xs"
                      onClick={() => setProductionFullscreen(true)}
                    >
                      <Maximize2 size={14} strokeWidth={2.25} aria-hidden />
                      전체화면 보기
                    </button>
                  }
                >
                  <WeeklyProductionTable
                    rows={shownProductionRows}
                    editableCustomPeriodLabel={editableCustomPeriodLabel}
                  />
                </Panel>
                <WeeklyIssuePanel
                  issues={shownIssues}
                  productOptions={productOptions}
                  onSave={handleSaveIssues}
                  onAiGenerate={handleAiGenerateIssues}
                  saving={issuesSaving}
                  cloudSync={isCloudSyncEnabled()}
                  syncReady={issuesHydratedKey === periodKey}
                  canEdit={canEditWeeklyContent && !viewingSnapshot}
                  onRequestLogin={() => openLogin('manager')}
                />
              </div>

              <div className="min-w-0">
                <Panel
                  title="부적합 WORST 5"
                  bodyClassName="!space-y-5 !bg-canvas/50 !p-3"
                  actions={
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-1.5 text-xs"
                      onClick={() => setWorst5Fullscreen(true)}
                    >
                      <Maximize2 size={14} strokeWidth={2.25} aria-hidden />
                      전체화면 보기
                    </button>
                  }
                >
                  {WEEKLY_REPORT_ORGS.map((org) => (
                    <Worst5Card
                      key={org.id}
                      title={org.label}
                      color={org.color}
                      minQty={shownWorst5Thresholds[org.id]}
                      onMinQtyChange={
                        viewingSnapshot
                          ? undefined
                          : (value) =>
                              handleWorst5ThresholdChange(org.id, value)
                      }
                      items={shownWorst5[org.id] ?? []}
                      period={worst5LinkPeriod}
                      snapshotId={activeSnapshot?.id ?? null}
                    />
                  ))}
                </Panel>
              </div>
            </div>

            <WeeklySectionHeading title="3-2. VINA 부적합 현황" />
            {!viewingSnapshot && !vinaRecordsReady ? (
              <p className="text-sm text-muted">VINA 현황 불러오는 중…</p>
            ) : !hasAnyVinaSection ? (
              <div className="rounded-2xl border border-dashed border-line bg-surface px-4 py-8 text-center shadow-sm">
                <p className="text-sm font-medium text-ink">
                  {viewingSnapshot
                    ? '이 확정본에는 VINA 부적합 현황이 포함되어 있지 않습니다.'
                    : 'VINA 데이터가 없습니다.'}
                </p>
                {!viewingSnapshot ? (
                  <p className="mt-1 text-sm text-muted">
                    VINA 분석 → 데이터 업로드 후 스냅샷을 저장하면 이 구간에
                    기록됩니다.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-5">
                {hasShownVinaMonthly ? (
                  <MonthlyTrendSection
                    view={shownVinaMonthlyView}
                    metric={vinaMetric}
                    onMetricChange={setVinaMetric}
                    selectedMonthKey={shownSelectedMonthKey}
                    title="VINA 월별 현황"
                    descriptionPrefix="VINA 데이터 · 제품유형 기준 · "
                    orgs={VINA_MONTHLY_ORGS}
                  />
                ) : null}

                {hasShownVinaProduction || hasShownVinaWorst5 ? (
                  <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                    <div className="min-w-0">
                      {hasShownVinaProduction ? (
                        <Panel
                          title="VINA 주간 생산/검사 실적"
                          description={vinaProductionDescription}
                          actions={
                            <button
                              type="button"
                              className="btn inline-flex items-center gap-1.5 text-xs"
                              onClick={() => setVinaProductionFullscreen(true)}
                            >
                              <Maximize2
                                size={14}
                                strokeWidth={2.25}
                                aria-hidden
                              />
                              전체화면 보기
                            </button>
                          }
                        >
                          <WeeklyProductionTable
                            rows={shownVinaProductionRows}
                            columns={VINA_PRODUCTION_COLUMNS}
                            metrics={VINA_PRODUCTION_METRICS}
                            editableCustomPeriodLabel={
                              editableCustomPeriodLabel
                            }
                          />
                        </Panel>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      {hasShownVinaWorst5 ? (
                        <Panel
                          title="VINA 부적합 WORST 5"
                          description={
                            viewingSnapshot
                              ? '확정본에 저장된 VINA WORST 5'
                              : 'VINA · 제품유형별 부적합률 상위 품번'
                          }
                          bodyClassName="!space-y-5 !bg-canvas/50 !p-3"
                          actions={
                            <button
                              type="button"
                              className="btn inline-flex items-center gap-1.5 text-xs"
                              onClick={() => setVinaWorst5Fullscreen(true)}
                            >
                              <Maximize2
                                size={14}
                                strokeWidth={2.25}
                                aria-hidden
                              />
                              전체화면 보기
                            </button>
                          }
                        >
                          {VINA_MONTHLY_ORGS.map((org) => (
                            <Worst5Card
                              key={`vina-${org.id}`}
                              title={org.label}
                              color={org.color}
                              minQty={shownVinaWorst5Thresholds[org.id]}
                              onMinQtyChange={
                                viewingSnapshot
                                  ? undefined
                                  : (value) =>
                                      handleVinaWorst5ThresholdChange(
                                        org.id,
                                        value,
                                      )
                              }
                              items={shownVinaWorst5[org.id] ?? []}
                              period={worst5LinkPeriod}
                              getProductHref={vinaWorst5ProductHref}
                            />
                          ))}
                        </Panel>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <WeeklySectionHeading title="4. 측정현황" />
            <MeasurementStatusPanel
              items={shownMeasurementStatus}
              onSave={handleSaveMeasurementStatus}
              saving={measurementStatusSaving}
              cloudSync={isCloudSyncEnabled()}
              syncReady={
                viewingSnapshot || measurementStatusHydratedKey === periodKey
              }
              canEdit={canEditWeeklyContent && !viewingSnapshot}
              onRequestLogin={() => openLogin('manager')}
            />

            <WeeklySectionHeading title="정보공유 및 대외일정" />
            <InfoSharePanel
              items={shownInfoShare}
              onSave={handleSaveInfoShare}
              saving={infoShareSaving}
              cloudSync={isCloudSyncEnabled()}
              syncReady={
                viewingSnapshot || infoShareHydratedKey === periodKey
              }
              canEdit={canEditWeeklyContent && !viewingSnapshot}
              onRequestLogin={() => openLogin('manager')}
            />

            <WeeklyFullscreenOverlay
              open={productionFullscreen}
              title="주간 생산/검사 실적"
              description={productionDescription}
              onClose={closeProductionFullscreen}
              centerContent
            >
              <div className="mx-auto w-full max-w-5xl text-[15px] sm:text-base [&_table]:min-w-0 [&_td]:py-3.5 [&_th]:py-3">
                <WeeklyProductionTable
                  rows={shownProductionRows}
                  editableCustomPeriodLabel={editableCustomPeriodLabel}
                />
              </div>
            </WeeklyFullscreenOverlay>

            <WeeklyFullscreenOverlay
              open={vinaProductionFullscreen}
              title="VINA 주간 생산/검사 실적"
              description={vinaProductionDescription}
              onClose={closeVinaProductionFullscreen}
              centerContent
            >
              <div className="mx-auto w-full max-w-5xl text-[15px] sm:text-base [&_table]:min-w-0 [&_td]:py-3.5 [&_th]:py-3">
                <WeeklyProductionTable
                  rows={shownVinaProductionRows}
                  columns={VINA_PRODUCTION_COLUMNS}
                  metrics={VINA_PRODUCTION_METRICS}
                  editableCustomPeriodLabel={editableCustomPeriodLabel}
                />
              </div>
            </WeeklyFullscreenOverlay>

            <WeeklyFullscreenOverlay
              open={vinaWorst5Fullscreen}
              title="VINA 부적합 WORST 5"
              description={
                viewingSnapshot
                  ? '확정본에 저장된 VINA WORST 5'
                  : 'VINA · 제품유형별 부적합률 상위 품번'
              }
              onClose={closeVinaWorst5Fullscreen}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                {VINA_MONTHLY_ORGS.map((org) => (
                  <Worst5Card
                    key={`vina-fs-${org.id}`}
                    title={org.label}
                    color={org.color}
                    minQty={shownVinaWorst5Thresholds[org.id]}
                    onMinQtyChange={
                      viewingSnapshot
                        ? undefined
                        : (value) =>
                            handleVinaWorst5ThresholdChange(org.id, value)
                    }
                    items={shownVinaWorst5[org.id] ?? []}
                    period={worst5LinkPeriod}
                    getProductHref={vinaWorst5ProductHref}
                    variant="fullscreen"
                  />
                ))}
              </div>
            </WeeklyFullscreenOverlay>

            <WeeklyFullscreenOverlay
              open={worst5Fullscreen}
              title="부적합 WORST 5"
              description={
                viewingSnapshot
                  ? '확정본에 저장된 WORST 5'
                  : '조직별 부적합률 상위 품번'
              }
              onClose={closeWorst5Fullscreen}
            >
              <div className="grid gap-4 lg:grid-cols-3">
                {WEEKLY_REPORT_ORGS.map((org) => (
                  <Worst5Card
                    key={`fs-${org.id}`}
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
                    variant="fullscreen"
                  />
                ))}
              </div>
            </WeeklyFullscreenOverlay>
          </>
        ) : null}
      </div>

      {pendingDeleteSnapshotId ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          onClick={() => {
            if (!snapshotDeleting) setPendingDeleteSnapshotId(null)
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-white px-8 py-8 shadow-xl sm:max-w-lg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snapshot-delete-title"
            onClick={(e) => e.stopPropagation()}
          >
            <p
              id="snapshot-delete-title"
              className="text-center text-lg font-semibold text-ink sm:text-xl"
            >
              정말 삭제하시겠습니까?
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3">
              <button
                type="button"
                className="btn btn-primary py-3 text-base"
                disabled={snapshotDeleting}
                onClick={() => void handleConfirmDeleteSnapshot()}
              >
                {snapshotDeleting ? '삭제 중…' : '예'}
              </button>
              <button
                type="button"
                className="btn py-3 text-base"
                disabled={snapshotDeleting}
                onClick={() => setPendingDeleteSnapshotId(null)}
              >
                아니요
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
