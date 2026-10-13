import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, FileDown } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ReactNode } from 'react'
import { DailyFailRateTopPanel } from '../components/daily/DailyFailRateTopPanel'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import {
  aggregateDefectShares,
  bucketBySealGrommet,
  latestInspectionDate,
  monthToDateRange,
  recordsForDay,
  recordsForMonthToDate,
  topProductsByFailRate,
  topProductsByScrapCost,
  typeQtyNgSummaries,
  typeScrapCostBars,
  type ProductRankRow,
  type TypeQtyNgSummary,
} from '../lib/dailyAnalysis'
import { filterRecords } from '../lib/analyze'
import { defectColorByRankName, defectTypeColor } from '../lib/defectColors'
import { toEntityId } from '../lib/entityId'
import { formatPercent, formatWon, formatYmdWithWeekday } from '../lib/format'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import {
  buildProductDetailHref,
  type ProductDetailFromId,
} from '../lib/productDetailNav'
import { exportDailyInspectionPdf } from '../lib/dailyAnalysisPdf'
import { getProductPhotoUrlMap } from '../lib/productPhotos'
import { isCloudSyncEnabled } from '../lib/supabase'
import type { InspectionRecord } from '../types'

const QTY_COLOR = '#3b82f6'
const NG_COLOR = '#f97316'
const BAR_COLORS = ['#3b82f6', '#60a5fa', '#93c5fd', '#38bdf8', '#0ea5e9']
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const TOP5_PHOTO_SIZE = 44
const TOP5_X_AXIS_HEIGHT = TOP5_PHOTO_SIZE + 34
const TOP5_CHART_HEIGHT = 300

/** 막대 위 값 — fill을 SVG attribute로 둬 html2canvas PDF에서도 보이게 */
function BarTopValueLabel({
  x = 0,
  y = 0,
  width = 0,
  value,
  formatValue,
}: {
  x?: number | string
  y?: number | string
  width?: number | string
  value?: number | string
  formatValue: (n: number) => string
}) {
  const cx = Number(x) + Number(width) / 2
  const cy = Number(y) - 6
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null
  return (
    <text
      x={cx}
      y={cy}
      textAnchor="middle"
      dominantBaseline="auto"
      fill="#0f172a"
      fontSize={11}
      fontWeight={700}
      paintOrder="stroke"
      stroke="#ffffff"
      strokeWidth={2.5}
      style={{ pointerEvents: 'none' }}
    >
      {formatValue(Number(value ?? 0))}
    </text>
  )
}

type DailyAnalysisViewState = {
  selectedDate: string
}

function readViewState(viewStateKey: string): DailyAnalysisViewState {
  const stored = loadPageViewState<Partial<DailyAnalysisViewState>>(viewStateKey)
  const selectedDate =
    typeof stored?.selectedDate === 'string' && DATE_PATTERN.test(stored.selectedDate)
      ? stored.selectedDate
      : ''
  return { selectedDate }
}

function shortProductLabel(name: string, max = 10) {
  const t = name.trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

function earliestInspectionDate(records: { date?: string }[]): string | null {
  let min: string | null = null
  for (const r of records) {
    const d = r.date?.trim()
    if (!d || !DATE_PATTERN.test(d)) continue
    if (!min || d < min) min = d
  }
  return min
}

function resolveSelectedDate(day: string, fallback: string) {
  return DATE_PATTERN.test(day) ? day : fallback
}

function QtyNgDonut({ summary }: { summary: TypeQtyNgSummary }) {
  // NG률이 1%대면 fail/qty 비율로는 주황이 거의 안 보임 → 링은 NG률(%) 비중으로 그리고
  // 아주 작을 때도 최소 시각 폭을 줘서 주황이 보이도록 함 (가운데·툴팁은 실제 값)
  const ngRate = summary.ngRatePercent
  const hasNg = summary.qty > 0 && ngRate > 0
  const visualNg = hasNg ? Math.max(ngRate, 6) : 0
  const visualOk = summary.qty > 0 ? Math.max(0, 100 - visualNg) : 0
  const data =
    summary.qty > 0
      ? [
          { name: '검사수량', value: visualOk || 100, fill: QTY_COLOR },
          ...(hasNg
            ? [{ name: 'NG률', value: visualNg, fill: NG_COLOR }]
            : []),
        ]
      : [{ name: '없음', value: 1, fill: '#e2e8f0' }]

  return (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <p className="mb-1 text-sm font-bold tracking-wide text-ink">
        {summary.label}
      </p>
      <div className="relative h-[280px] w-full max-w-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius="58%"
              outerRadius="86%"
              paddingAngle={hasNg ? 2 : 0}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.name} fill={d.fill} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                border: '1px solid #dbe3ee',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(_value, name) => {
                if (name === 'NG률') {
                  return [
                    `${formatPercent(ngRate)} (${summary.fail.toLocaleString()}건)`,
                    'NG률',
                  ]
                }
                return [summary.qty.toLocaleString(), '검사수량']
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] font-medium text-muted">검사수량</span>
          <span className="text-lg font-bold tabular-nums text-ink">
            {summary.qty.toLocaleString()}
          </span>
          <span
            className="mt-1 text-base font-bold tabular-nums"
            style={{ color: NG_COLOR }}
          >
            {formatPercent(ngRate)}
          </span>
          <span className="text-[11px] font-medium" style={{ color: NG_COLOR }}>
            NG률
          </span>
        </div>
      </div>
      <div className="mt-1 flex gap-3 text-[11px] font-medium text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ background: QTY_COLOR }}
          />
          검사수량
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ background: NG_COLOR }}
          />
          NG률
        </span>
      </div>
    </div>
  )
}

function DefectSharePie({
  title,
  records,
  accent,
  colorByName,
}: {
  title: string
  records: ReturnType<typeof bucketBySealGrommet>['grommet']
  accent: 'grommet' | 'seal'
  /** 품질분석 TOP10과 동일 팔레트·순위 색 (유형명 → 색) */
  colorByName: Record<string, string>
}) {
  const defects = useMemo(() => aggregateDefectShares(records), [records])
  // 1% 미만 조각도 링에서 보이도록 최소 시각 비중(2.5%) 적용. 범례·툴팁은 실제 share.
  const MIN_VISUAL_SHARE = 2.5
  const chartData = useMemo(() => {
    if (!defects.length) return []
    const withFloor = defects.map((d, i) => ({
      ...d,
      fill: colorByName[d.name] ?? defectTypeColor(i),
      visualShare: Math.max(d.share, MIN_VISUAL_SHARE),
    }))
    const visualTotal = withFloor.reduce((s, d) => s + d.visualShare, 0) || 1
    return withFloor.map((d) => ({
      ...d,
      visualValue: d.visualShare / visualTotal,
    }))
  }, [defects, colorByName])

  const accentColor = accent === 'grommet' ? '#2563eb' : '#dc2626'
  const accentBg =
    accent === 'grommet'
      ? 'rgba(37, 99, 235, 0.06)'
      : 'rgba(220, 38, 38, 0.06)'
  const accentBorder =
    accent === 'grommet'
      ? 'rgba(37, 99, 235, 0.28)'
      : 'rgba(220, 38, 38, 0.28)'

  return (
    <div
      className="daily-defect-type-card flex min-w-0 flex-1 flex-col items-center rounded-2xl border px-3 pb-3 pt-4"
      style={{ background: accentBg, borderColor: accentBorder }}
    >
      <p
        className="daily-defect-type-badge mb-2 rounded-full px-3 text-sm font-bold tracking-wide text-white"
        style={{ background: accentColor }}
      >
        <span className="daily-defect-type-badge-text">{title}</span>
      </p>
      {!chartData.length ? (
        <div className="flex h-[280px] w-full items-center justify-center text-sm text-muted">
          불량 유형 없음
        </div>
      ) : (
        <div className="h-[280px] w-full max-w-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                dataKey="visualValue"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius="86%"
                paddingAngle={1.2}
                stroke="#fff"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {chartData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  border: '1px solid #dbe3ee',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(_value, _n, item) => [
                  `${Number(item.payload.count).toLocaleString()}건 (${item.payload.share}%)`,
                  '발생량',
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      {chartData.length > 0 ? (
        <ul className="daily-defect-legend mt-2 text-[12px]">
          {chartData.map((d) => (
            <li key={d.name} className="daily-defect-legend-row">
              <span
                className="daily-defect-legend-swatch"
                style={{ background: d.fill }}
                aria-hidden
              />
              <span className="daily-defect-legend-name" title={d.name}>
                {d.name}
              </span>
              <span className="daily-defect-legend-pct">
                {formatPercent(d.share)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function ProductTopBarAxisTick({
  x = 0,
  y = 0,
  payload,
  photoUrls,
}: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  photoUrls?: Record<string, string>
}) {
  const product = String(payload?.value ?? '')
  const label = shortProductLabel(product)
  const url = photoUrls?.[product.trim()]
  const imgX = -TOP5_PHOTO_SIZE / 2
  const imgY = 4

  return (
    <g transform={`translate(${x},${y})`}>
      {/* foreignObject는 html2canvas에서 자주 누락 → SVG image 사용 */}
      <rect
        x={imgX}
        y={imgY}
        width={TOP5_PHOTO_SIZE}
        height={TOP5_PHOTO_SIZE}
        rx={6}
        fill="#f8fafc"
        stroke="#e2e8f0"
      />
      {url ? (
        <image
          href={url}
          xlinkHref={url}
          x={imgX + 2}
          y={imgY + 2}
          width={TOP5_PHOTO_SIZE - 4}
          height={TOP5_PHOTO_SIZE - 4}
          preserveAspectRatio="xMidYMid meet"
          crossOrigin="anonymous"
        />
      ) : (
        <text
          x={0}
          y={imgY + TOP5_PHOTO_SIZE / 2 + 4}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize={11}
          fontWeight={700}
        >
          {product.slice(0, 2) || '—'}
        </text>
      )}
      <text
        x={0}
        y={TOP5_PHOTO_SIZE + 20}
        textAnchor="middle"
        fill="#0f172a"
        fontSize={11}
        fontWeight={600}
      >
        {label}
      </text>
    </g>
  )
}

function ProductTopBars({
  title,
  description,
  rows,
  valueKey,
  valueLabel,
  formatValue,
  productFrom,
  vina,
}: {
  title: string
  description: string
  rows: ProductRankRow[]
  valueKey: 'failRatePercent' | 'scrapCost'
  valueLabel: string
  formatValue: (n: number) => string
  productFrom: ProductDetailFromId
  vina?: boolean
}) {
  const navigate = useNavigate()
  const chartData = useMemo(
    () =>
      rows.map((r, i) => ({
        ...r,
        fill: BAR_COLORS[i % BAR_COLORS.length],
        href: buildProductDetailHref(
          toEntityId('prd', r.product),
          productFrom,
          vina ? { vina: true } : undefined,
        ),
      })),
    [rows, productFrom, vina],
  )

  const photoKeys = useMemo(
    () =>
      [...new Set(rows.map((r) => r.product.trim()).filter(Boolean))].sort(),
    [rows],
  )
  const photoKeysSignature = photoKeys.join('\u0001')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isCloudSyncEnabled() || !photoKeys.length) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    void getProductPhotoUrlMap(photoKeys)
      .then(async (map) => {
        // PDF/SVG image 캡처용으로 data URL 변환 (가능하면)
        const entries = await Promise.all(
          Object.entries(map).map(async ([key, url]) => {
            try {
              const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
              if (!res.ok) return [key, url] as const
              const blob = await res.blob()
              const dataUrl = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader()
                reader.onload = () => resolve(String(reader.result))
                reader.onerror = () => reject(reader.error)
                reader.readAsDataURL(blob)
              })
              return [key, dataUrl] as const
            } catch {
              return [key, url] as const
            }
          }),
        )
        if (!cancelled) setPhotoUrls(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setPhotoUrls({})
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKeysSignature])

  return (
    <Panel title={title} description={description}>
      {!chartData.length ? (
        <div
          className="flex items-center justify-center text-sm text-muted"
          style={{ height: TOP5_CHART_HEIGHT }}
        >
          표시할 품번이 없습니다.
        </div>
      ) : (
        <div className="w-full" style={{ height: TOP5_CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 32, right: 8, left: 0, bottom: 8 }}
              barCategoryGap="28%"
            >
              <CartesianGrid stroke="#eef1f5" vertical={false} strokeDasharray="3 6" />
              <XAxis
                dataKey="product"
                interval={0}
                height={TOP5_X_AXIS_HEIGHT}
                tickMargin={0}
                axisLine={false}
                tickLine={false}
                tick={(props) => (
                  <ProductTopBarAxisTick
                    x={
                      typeof props.x === 'number'
                        ? props.x
                        : Number(props.x) || 0
                    }
                    y={
                      typeof props.y === 'number'
                        ? props.y
                        : Number(props.y) || 0
                    }
                    payload={
                      props.payload
                        ? {
                            value: props.payload.value as
                              | string
                              | number
                              | undefined,
                          }
                        : undefined
                    }
                    photoUrls={photoUrls}
                  />
                )}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v) =>
                  valueKey === 'failRatePercent'
                    ? `${v}`
                    : Number(v) >= 1_000_000
                      ? `${Math.round(Number(v) / 1_000_000)}M`
                      : Number(v) >= 1_000
                        ? `${Math.round(Number(v) / 1_000)}K`
                        : String(v)
                }
              />
              <Tooltip
                contentStyle={{
                  border: '1px solid #dbe3ee',
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(value) => [formatValue(Number(value)), valueLabel]}
                labelFormatter={(_l, payload) =>
                  String(payload?.[0]?.payload?.product ?? '')
                }
              />
              <Bar
                dataKey={valueKey}
                radius={[6, 6, 0, 0]}
                maxBarSize={42}
                cursor="pointer"
                isAnimationActive={false}
                onClick={(data) => {
                  const payload = data as {
                    href?: string
                    payload?: { href?: string }
                  }
                  const href = payload?.payload?.href ?? payload?.href
                  if (href) navigate(href)
                }}
              >
                {chartData.map((d) => (
                  <Cell key={d.product} fill={d.fill} />
                ))}
                <LabelList
                  dataKey={valueKey}
                  position="top"
                  content={(props) => (
                    <BarTopValueLabel
                      x={props.x}
                      y={props.y}
                      width={props.width}
                      value={props.value as number | string | undefined}
                      formatValue={formatValue}
                    />
                  )}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Panel>
  )
}

export function DailyAnalysisPanels({
  records,
  title,
  viewStateKey,
  productFrom,
  vina = false,
  beforeHeader,
  afterHeader,
  emptyState,
}: {
  records: InspectionRecord[]
  title: string
  viewStateKey: string
  productFrom: ProductDetailFromId
  vina?: boolean
  beforeHeader?: ReactNode
  afterHeader?: ReactNode
  emptyState?: ReactNode
}) {
  const { filters } = useFilters()
  const [view, setView] = useState<DailyAnalysisViewState>(() =>
    readViewState(viewStateKey),
  )

  useEffect(() => {
    savePageViewState(viewStateKey, view)
  }, [view, viewStateKey])

  // 일간 현황: 상단「분석그룹」「조회기간」과 무관 — 페이지 조회일만 사용
  const scoped = useMemo(
    () =>
      filterRecords(records, filters, true, {
        ignorePeriod: true,
        ignoreAnalysisGroup: true,
      }),
    [records, filters],
  )

  const dataMinDate = useMemo(
    () => earliestInspectionDate(scoped) ?? '',
    [scoped],
  )
  const dataMaxDate = useMemo(
    () => latestInspectionDate(scoped) ?? '',
    [scoped],
  )

  const defaultDay = dataMaxDate

  const selectedDate = useMemo(
    () => resolveSelectedDate(view.selectedDate, defaultDay),
    [view.selectedDate, defaultDay],
  )

  useEffect(() => {
    if (!selectedDate) return
    if (view.selectedDate === selectedDate) return
    setView((prev) => ({ ...prev, selectedDate }))
  }, [selectedDate, view.selectedDate])

  const dayRecords = useMemo(
    () => recordsForDay(scoped, selectedDate || null),
    [scoped, selectedDate],
  )

  const mtdRange = useMemo(
    () => monthToDateRange(selectedDate || null),
    [selectedDate],
  )

  const mtdRecords = useMemo(
    () => recordsForMonthToDate(scoped, selectedDate || null),
    [scoped, selectedDate],
  )

  const mtdTypeSummaries = useMemo(
    () => typeQtyNgSummaries(mtdRecords),
    [mtdRecords],
  )

  const mtdBuckets = useMemo(
    () => bucketBySealGrommet(mtdRecords),
    [mtdRecords],
  )

  // 품질분석 불량유형 TOP10과 동일: 누적 전체 발생량 순위 → DEFECT_TYPE_COLORS
  const mtdDefectColorByName = useMemo(() => {
    const ranked = aggregateDefectShares([
      ...mtdBuckets.grommet,
      ...mtdBuckets.seal,
    ])
    return defectColorByRankName(ranked.map((d) => d.name))
  }, [mtdBuckets])

  const dayFailTop = useMemo(
    () => topProductsByFailRate(dayRecords, 5),
    [dayRecords],
  )

  const mtdScrapTop = useMemo(
    () => topProductsByScrapCost(mtdRecords, 5),
    [mtdRecords],
  )

  const typeCostBars = useMemo(
    () => typeScrapCostBars(mtdRecords),
    [mtdRecords],
  )

  const dayLabel = selectedDate
    ? formatYmdWithWeekday(selectedDate)
    : '날짜 미선택'
  const mtdLabel = mtdRange
    ? `${formatYmdWithWeekday(mtdRange.startDate)} ~ ${formatYmdWithWeekday(mtdRange.endDate)}`
    : dayLabel
  const dayCount = dayRecords.length
  const mtdCount = mtdRecords.length
  const [exportingPdf, setExportingPdf] = useState(false)
  const reportRef = useRef<HTMLDivElement>(null)

  async function handleExportPdf() {
    if (!selectedDate || exportingPdf) return
    const el = reportRef.current
    if (!el) {
      window.alert('내보낼 보고서 영역을 찾지 못했습니다.')
      return
    }
    setExportingPdf(true)
    try {
      await exportDailyInspectionPdf({
        element: el,
        day: selectedDate,
        vina,
      })
    } catch (err) {
      console.error(err)
      window.alert(
        err instanceof Error ? err.message : 'PDF 내보내기에 실패했습니다.',
      )
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="space-y-5">
      {beforeHeader}
      <PageHeader title={title} />
      {afterHeader}
      {emptyState}

      {!emptyState ? (
        <>
      <div className="daily-analysis-datebar">
        <label className="daily-analysis-datebar-picker">
          <span className="daily-analysis-datebar-icon" aria-hidden>
            <CalendarDays size={18} strokeWidth={2.25} />
          </span>
          <span className="daily-analysis-datebar-fields">
            <span className="daily-analysis-datebar-label">조회일</span>
            <span className="daily-analysis-datebar-input-wrap">
              <input
                type="date"
                className="daily-analysis-datebar-input"
                value={selectedDate}
                min={dataMinDate || undefined}
                max={dataMaxDate || undefined}
                onChange={(e) =>
                  setView((prev) => ({
                    ...prev,
                    selectedDate: e.target.value,
                  }))
                }
                aria-label="일간 현황 조회일"
              />
            </span>
          </span>
        </label>
        <div className="daily-analysis-datebar-meta">
          <span className="daily-analysis-datebar-chip">{dayLabel}</span>
          <span className="daily-analysis-datebar-chip daily-analysis-datebar-chip--day">
            일별 <strong>{dayCount.toLocaleString()}</strong>건
          </span>
          <span className="daily-analysis-datebar-chip daily-analysis-datebar-chip--mtd">
            누적 <strong>{mtdCount.toLocaleString()}</strong>건
          </span>
          <button
            type="button"
            className="daily-analysis-pdf-btn"
            onClick={() => void handleExportPdf()}
            disabled={!selectedDate || exportingPdf}
          >
            <FileDown size={16} strokeWidth={2.25} aria-hidden />
            {exportingPdf ? 'PDF 생성 중…' : 'PDF 내보내기'}
          </button>
        </div>
      </div>

      <div ref={reportRef} className="daily-analysis-report-capture">
        <div className="daily-analysis-report-header">
          <img src="/hyundai-logo.png" alt="HYUNDAI" />
          <h2>
            {vina ? 'VINA 일일 검사 보고서' : '일일 검사 보고서'}
          </h2>
          <span>
            {selectedDate
              ? selectedDate.replace(
                  /^(\d{4})-(\d{2})-(\d{2})$/,
                  (_, y, m, d) =>
                    `${y}년 ${Number(m)}월 ${Number(d)}일`,
                )
              : dayLabel}
          </span>
        </div>
        <div className="daily-analysis-report-grid grid gap-5 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-5">
          <Panel
            title="검사수량 대비 NG률 (누적)"
            description={`GROMMET / SEAL · ${mtdLabel}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              {mtdTypeSummaries.map((s) => (
                <QtyNgDonut key={s.id} summary={s} />
              ))}
            </div>
          </Panel>

          <Panel
            title="유형별 NG 현황 (누적)"
            description={`불량 유형 비중 · ${mtdLabel}`}
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
              <DefectSharePie
                title="GROMMET"
                records={mtdBuckets.grommet}
                accent="grommet"
                colorByName={mtdDefectColorByName}
              />
              <DefectSharePie
                title="SEAL"
                records={mtdBuckets.seal}
                accent="seal"
                colorByName={mtdDefectColorByName}
              />
            </div>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <ProductTopBars
            title="ITEM별 불량율 TOP5 (일별)"
            description={`${dayLabel} · 검수량 0 제외`}
            rows={dayFailTop}
            valueKey="failRatePercent"
            valueLabel="불량률"
            formatValue={(n) => formatPercent(n)}
            productFrom={productFrom}
            vina={vina}
          />

          <ProductTopBars
            title="ITEM별 NG 금액 TOP5 (누적)"
            description={`${mtdLabel} · 폐기금액`}
            rows={mtdScrapTop}
            valueKey="scrapCost"
            valueLabel="NG 금액"
            formatValue={(n) => formatWon(n)}
            productFrom={productFrom}
            vina={vina}
          />

          <Panel
            title="종류별 NG 금액 (누적)"
            description={`GROMMET vs SEAL · ${mtdLabel}`}
          >
            {!typeCostBars.some((b) => b.scrapCost > 0) ? (
              <div className="flex h-[200px] items-center justify-center text-sm text-muted">
                NG 금액 데이터가 없습니다.
              </div>
            ) : (
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={typeCostBars}
                    margin={{ top: 32, right: 12, left: 0, bottom: 4 }}
                    barCategoryGap="40%"
                  >
                    <CartesianGrid
                      stroke="#eef1f5"
                      vertical={false}
                      strokeDasharray="3 6"
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: '#0f172a', fontSize: 12, fontWeight: 700 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v) =>
                        Number(v) >= 1_000_000
                          ? `${Math.round(Number(v) / 1_000_000)}M`
                          : Number(v) >= 1_000
                            ? `${Math.round(Number(v) / 1_000)}K`
                            : String(v)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        border: '1px solid #dbe3ee',
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      formatter={(value) => [
                        formatWon(Number(value)),
                        'NG 금액',
                      ]}
                    />
                    <Bar
                      dataKey="scrapCost"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={56}
                      isAnimationActive={false}
                    >
                      {typeCostBars.map((d) => (
                        <Cell key={d.name} fill={d.fill} />
                      ))}
                      <LabelList
                        dataKey="scrapCost"
                        position="top"
                        content={(props) => (
                          <BarTopValueLabel
                            x={props.x}
                            y={props.y}
                            width={props.width}
                            value={props.value as number | string | undefined}
                            formatValue={formatWon}
                          />
                        )}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
        </div>
      </div>

      <DailyFailRateTopPanel
        records={scoped}
        day={selectedDate}
        productFrom={productFrom}
        vina={vina}
        viewStateKey={`${viewStateKey}-fail-top`}
      />
        </>
      ) : null}
    </div>
  )
}

export function DailyAnalysis() {
  const { records } = useData()
  return (
    <DailyAnalysisPanels
      records={records}
      title="일간 현황"
      viewStateKey="daily-analysis"
      productFrom="daily-analysis"
    />
  )
}
