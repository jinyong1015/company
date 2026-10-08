import { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Maximize2 } from 'lucide-react'
import { Panel } from '../common/Panel'
import { WeeklyFullscreenOverlay } from './WeeklyFullscreenOverlay'
import { ANALYSIS_GROUP_TOTAL_LINE_COLOR } from '../../lib/groups'
import { formatPpm, formatWon } from '../../lib/format'
import {
  WEEKLY_REPORT_MONTHLY_BAR_ORDER,
  WEEKLY_REPORT_ORGS,
  chartDataFromMonthly,
  weeklyReportMetricLabel,
} from '../../lib/weeklyReport'
import type {
  WeeklyReportMetric,
  WeeklyReportMonthlyView,
  WeeklyReportOrgId,
} from '../../types'

const LINE_COLOR = ANALYSIS_GROUP_TOTAL_LINE_COLOR
const LABEL_COLOR = '#ef4444'

export type MonthlyTrendOrg = {
  id: WeeklyReportOrgId
  label: string
  color: string
}

const DEFAULT_ORGS: MonthlyTrendOrg[] = WEEKLY_REPORT_MONTHLY_BAR_ORDER.map(
  (id) => {
    const o = WEEKLY_REPORT_ORGS.find((org) => org.id === id)!
    return { id: o.id, label: o.label, color: o.color }
  },
)

function rowAccentMap(orgs: MonthlyTrendOrg[]) {
  const map: Record<string, { color: string; isTotal?: boolean }> = {
    total: { color: LABEL_COLOR, isTotal: true },
  }
  for (const o of orgs) map[o.id] = { color: o.color }
  return map
}

function selectedColumnClass(isSelected: boolean) {
  if (!isSelected) return ''
  return 'weekly-selected-column'
}

/** "26.07" → "2026-07" (표기·키가 어긋난 스냅샷 대비) */
function monthKeyFromLabel(monthLabel: string): string | null {
  const m = /^(\d{2})\.(\d{2})$/.exec(monthLabel.trim())
  if (!m) return null
  return `20${m[1]}-${m[2]}`
}

function normalizeMonthKey(raw?: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed
  const fromLabel = monthKeyFromLabel(trimmed)
  if (fromLabel) return fromLabel
  // YYYY-MM-DD 등
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 7)
  return null
}

/** 선택 비교용 — monthLabel이 있으면 라벨 기준(표시와 일치), 없으면 monthKey */
function canonicalMonthKey(m: {
  monthKey: string
  monthLabel: string
}): string | null {
  const fromLabel = monthKeyFromLabel(m.monthLabel)
  if (fromLabel) return fromLabel
  return normalizeMonthKey(m.monthKey)
}

const metrics = [
  { id: 'failRate' as const, label: '부적합률' },
  { id: 'qty' as const, label: '검수량' },
  { id: 'fail' as const, label: '부적합수량' },
  { id: 'scrapCost' as const, label: '폐기비용' },
]

function formatValue(metric: WeeklyReportMetric, value: number) {
  if (metric === 'failRate') return formatPpm(value)
  if (metric === 'scrapCost') return formatWon(value)
  return value.toLocaleString()
}

function formatCell(metric: WeeklyReportMetric, value: number) {
  if (metric === 'failRate') return formatPpm(value)
  if (metric === 'scrapCost') return `${value.toLocaleString()}원`
  return value.toLocaleString()
}

function yAxisTick(metric: WeeklyReportMetric, v: number) {
  if (metric === 'failRate') return `${Math.round(v / 1000)}k`
  if (metric === 'scrapCost') {
    return Math.round(v).toLocaleString('ko-KR')
  }
  return Math.round(v).toLocaleString('ko-KR')
}

function MetricTabs({
  metric,
  onMetricChange,
}: {
  metric: WeeklyReportMetric
  onMetricChange: (m: WeeklyReportMetric) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {metrics.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onMetricChange(m.id)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            metric === m.id
              ? 'bg-accent text-white'
              : 'bg-canvas text-muted hover:text-ink'
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  )
}

function MonthlyTrendBody({
  view,
  metric,
  selectedMonthKey,
  onMonthSelect,
  large = false,
  orgs = DEFAULT_ORGS,
}: {
  view: WeeklyReportMonthlyView
  metric: WeeklyReportMetric
  selectedMonthKey?: string
  onMonthSelect?: (monthKey: string) => void
  large?: boolean
  orgs?: MonthlyTrendOrg[]
}) {
  const chartData = chartDataFromMonthly(view)
  const groups = orgs
  const rowAccent = rowAccentMap(orgs)
  const legendOrder = [...orgs.map((o) => o.id), 'total']
  const selectedKey = normalizeMonthKey(selectedMonthKey)
  // 한 열만 하이라이트. monthKey·라벨이 둘 다 맞는 열 우선 (스냅샷 키 어긋남 대비)
  const selectedMonthIndex = (() => {
    if (!selectedKey) return -1
    const bothMatch = view.months.findIndex((m) => {
      const byKey = normalizeMonthKey(m.monthKey) === selectedKey
      const byLabel = monthKeyFromLabel(m.monthLabel) === selectedKey
      return byKey && (byLabel || !m.monthLabel)
    })
    if (bothMatch >= 0) return bothMatch
    return view.months.findIndex((m) => canonicalMonthKey(m) === selectedKey)
  })()

  const chartHeight = large ? 'min(52vh, 520px)' : '380px'
  const tickSize = large ? 12 : 11
  const labelSize = large ? 12 : 10
  const cellText = large ? 'text-[14px]' : 'text-[13px]'
  const tableText = large ? 'text-[15px]' : 'text-sm'

  return (
    <>
      <div
        className={`mb-4 w-full ${large ? 'rounded-xl bg-canvas/40 p-3 sm:p-4' : ''}`}
      >
        <div style={{ height: chartHeight }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{
                top: large ? 36 : 28,
                right: large ? 20 : 16,
                left: large ? 12 : 8,
                bottom: 8,
              }}
            >
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: tickSize, fill: '#5b6577' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              minTickGap={2}
            />
            <YAxis
              tick={{ fontSize: tickSize, fill: '#5b6577' }}
              axisLine={false}
              tickLine={false}
              width={metric === 'scrapCost' ? (large ? 88 : 80) : large ? 64 : 56}
              tickFormatter={(v) => yAxisTick(metric, Number(v))}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #e2e6ec',
                borderRadius: 12,
                fontSize: large ? 13 : 12,
              }}
              formatter={(value, name) => [
                formatValue(metric, Number(value ?? 0)),
                String(name),
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: large ? 13 : 12, paddingTop: 8 }}
              itemSorter={(item) => {
                const idx = legendOrder.indexOf(String(item.dataKey ?? ''))
                return idx === -1 ? 99 : idx
              }}
            />
            {groups.map((g) => (
              <Bar
                key={g.id}
                dataKey={g.id}
                name={g.label}
                fill={g.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={large ? 36 : 28}
                cursor={onMonthSelect ? 'pointer' : undefined}
                onClick={
                  onMonthSelect
                    ? (data) => {
                        // index는 0높이 막대 필터 후와 어긋날 수 있어 payload.monthKey 사용
                        const row = data as {
                          monthKey?: string
                          payload?: { monthKey?: string }
                        }
                        const key = row.monthKey ?? row.payload?.monthKey
                        if (key) onMonthSelect(key)
                      }
                    : undefined
                }
              />
            ))}
            <Line
              type="monotone"
              dataKey="total"
              name="TOTAL"
              stroke={LINE_COLOR}
              strokeWidth={large ? 2.8 : 2.4}
              dot={{
                r: large ? 5 : 4,
                fill: LABEL_COLOR,
                stroke: LABEL_COLOR,
              }}
            >
              <LabelList
                dataKey="total"
                position="top"
                offset={8}
                fill={LABEL_COLOR}
                fontSize={labelSize}
                fontWeight={600}
                formatter={(v: unknown) => {
                  const n = Number(v ?? 0)
                  if (!Number.isFinite(n)) return ''
                  if (metric === 'failRate') return formatPpm(n)
                  if (metric === 'scrapCost')
                    return `${Math.round(n).toLocaleString('ko-KR')}원`
                  return Math.round(n).toLocaleString()
                }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2.5">
          <p
            className={`font-medium text-ink ${large ? 'text-sm' : 'text-xs'}`}
          >
            월별 수치표
          </p>
          <p className={`${large ? 'text-xs' : 'text-[11px]'} text-muted`}>
            단위: {weeklyReportMetricLabel(metric)}
            {metric === 'scrapCost'
              ? ' (원)'
              : metric === 'failRate'
                ? ' (ppm)'
                : ' (EA)'}
          </p>
        </div>

        <div className="overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <table
            className={`w-max min-w-full border-separate border-spacing-0 ${tableText}`}
          >
            <thead>
              <tr className="border-b border-line bg-slate-50/90 text-left text-xs text-muted">
                <th className="sticky left-0 z-20 min-w-[148px] border-b border-line bg-slate-50 px-3 py-3 font-semibold whitespace-nowrap text-ink shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)]">
                  구분
                </th>
                {view.months.map((m, monthIndex) => {
                  const isSelected = monthIndex === selectedMonthIndex
                  return (
                    <th
                      key={`${m.monthKey}-${monthIndex}`}
                      className={`min-w-[5.5rem] border-b border-line px-2.5 py-3 text-right font-semibold whitespace-nowrap ${
                        isSelected
                          ? `${selectedColumnClass(true)} text-ink`
                          : `bg-slate-50/90 ${
                              onMonthSelect
                                ? 'cursor-pointer hover:bg-white hover:text-accent'
                                : ''
                            }`
                      }`}
                      onClick={
                        onMonthSelect
                          ? () =>
                              onMonthSelect(
                                canonicalMonthKey(m) ?? m.monthKey,
                              )
                          : undefined
                      }
                    >
                      {m.monthLabel}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {view.tableRows.map((row, rowIndex) => {
                const accent = rowAccent[row.id]
                const isTotal = accent?.isTotal
                const rowBg = isTotal
                  ? 'bg-red-50/35'
                  : rowIndex % 2 === 0
                    ? 'bg-white'
                    : 'bg-slate-50/45'
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-line/50 ${
                      isTotal ? 'border-t-2 border-t-line' : ''
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 min-w-[148px] border-b border-line/50 px-3 py-3 font-medium whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] ${
                        isTotal
                          ? 'bg-red-50 font-semibold text-danger'
                          : rowIndex % 2 === 0
                            ? 'bg-white text-ink'
                            : 'bg-slate-50 text-ink'
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {accent && !isTotal ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                            style={{ backgroundColor: accent.color }}
                            aria-hidden
                          />
                        ) : null}
                        {isTotal ? (
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full bg-danger ring-1 ring-danger/30"
                            aria-hidden
                          />
                        ) : null}
                        <span>{row.label}</span>
                      </span>
                    </td>
                    {view.months.map((m, monthIndex) => {
                      const isSelected = monthIndex === selectedMonthIndex
                      const value =
                        row.values[m.monthKey] ??
                        row.values[canonicalMonthKey(m) ?? ''] ??
                        0
                      return (
                        <td
                          key={`${m.monthKey}-${monthIndex}`}
                          className={`num min-w-[5.5rem] border-b border-line/50 px-2.5 py-3 text-right whitespace-nowrap ${cellText} ${
                            isSelected
                              ? selectedColumnClass(true)
                              : rowBg
                          } ${
                            isTotal
                              ? 'font-semibold text-danger'
                              : 'text-ink/90'
                          } ${
                            onMonthSelect
                              ? 'cursor-pointer hover:bg-accent/5'
                              : ''
                          }`}
                          onClick={
                            onMonthSelect
                              ? () =>
                                  onMonthSelect(
                                    canonicalMonthKey(m) ?? m.monthKey,
                                  )
                              : undefined
                          }
                        >
                          {formatCell(metric, value)}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

export function MonthlyTrendSection({
  view,
  metric,
  onMetricChange,
  selectedMonthKey,
  onMonthSelect,
  title = '월별 현황',
  descriptionPrefix,
  orgs = DEFAULT_ORGS,
}: {
  view: WeeklyReportMonthlyView
  metric: WeeklyReportMetric
  onMetricChange: (m: WeeklyReportMetric) => void
  selectedMonthKey?: string
  onMonthSelect?: (monthKey: string) => void
  title?: string
  /** 예: "VINA 데이터 · " */
  descriptionPrefix?: string
  orgs?: MonthlyTrendOrg[]
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const description = `${descriptionPrefix ?? ''}최근 12개월 (${view.range.from} ~ ${view.range.to})`

  return (
    <>
      <Panel
        title={title}
        description={description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn inline-flex items-center gap-1.5 text-xs"
              onClick={() => setFullscreen(true)}
            >
              <Maximize2 size={14} strokeWidth={2.25} aria-hidden />
              전체화면 보기
            </button>
            <MetricTabs metric={metric} onMetricChange={onMetricChange} />
          </div>
        }
      >
        <MonthlyTrendBody
          view={view}
          metric={metric}
          selectedMonthKey={selectedMonthKey}
          onMonthSelect={onMonthSelect}
          orgs={orgs}
        />
      </Panel>

      <WeeklyFullscreenOverlay
        open={fullscreen}
        title={title}
        description={description}
        onClose={() => setFullscreen(false)}
        actions={
          <MetricTabs metric={metric} onMetricChange={onMetricChange} />
        }
      >
        <div className="mx-auto w-full max-w-7xl rounded-2xl border border-line bg-white p-5 shadow-sm sm:p-6">
          <MonthlyTrendBody
            view={view}
            metric={metric}
            selectedMonthKey={selectedMonthKey}
            onMonthSelect={onMonthSelect}
            orgs={orgs}
            large
          />
        </div>
      </WeeklyFullscreenOverlay>
    </>
  )
}
