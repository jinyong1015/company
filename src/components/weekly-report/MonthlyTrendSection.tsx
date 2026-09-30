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
import type { WeeklyReportMetric, WeeklyReportMonthlyView } from '../../types'

const LINE_COLOR = ANALYSIS_GROUP_TOTAL_LINE_COLOR
const LABEL_COLOR = '#ef4444'

const ROW_ACCENT: Record<
  string,
  { color: string; isTotal?: boolean }
> = {
  seal: { color: WEEKLY_REPORT_ORGS.find((o) => o.id === 'seal')!.color },
  hydraulic: { color: WEEKLY_REPORT_ORGS.find((o) => o.id === 'hydraulic')!.color },
  plant2: { color: WEEKLY_REPORT_ORGS.find((o) => o.id === 'plant2')!.color },
  total: { color: LABEL_COLOR, isTotal: true },
}

function selectedColumnClass(isSelected: boolean) {
  if (!isSelected) return ''
  return 'weekly-selected-column'
}

const LEGEND_ORDER = ['seal', 'hydraulic', 'plant2', 'total']

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
}: {
  view: WeeklyReportMonthlyView
  metric: WeeklyReportMetric
  selectedMonthKey?: string
  onMonthSelect?: (monthKey: string) => void
  large?: boolean
}) {
  const chartData = chartDataFromMonthly(view)
  const groups = WEEKLY_REPORT_MONTHLY_BAR_ORDER.map((id) => {
    const o = WEEKLY_REPORT_ORGS.find((org) => org.id === id)!
    return { id: o.id, label: o.label, color: o.color }
  })

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
                const idx = LEGEND_ORDER.indexOf(String(item.dataKey ?? ''))
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
                    ? (_data, index) => {
                        const item = chartData[index]
                        if (item?.monthKey) onMonthSelect(item.monthKey)
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
          <table className={`w-max min-w-full border-collapse ${tableText}`}>
            <thead>
              <tr className="border-b border-line bg-slate-50/90 text-left text-xs text-muted">
                <th className="sticky left-0 z-20 min-w-[148px] bg-slate-50 px-3 py-3 font-semibold whitespace-nowrap text-ink shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)]">
                  구분
                </th>
                {view.months.map((m) => {
                  const isSelected = m.monthKey === selectedMonthKey
                  return (
                    <th
                      key={m.monthKey}
                      className={`min-w-[5.5rem] px-2.5 py-3 text-right font-semibold whitespace-nowrap transition-colors ${
                        isSelected
                          ? `${selectedColumnClass(true)} text-ink`
                          : onMonthSelect
                            ? 'cursor-pointer hover:bg-white hover:text-accent'
                            : ''
                      }`}
                      onClick={
                        onMonthSelect
                          ? () => onMonthSelect(m.monthKey)
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
                const accent = ROW_ACCENT[row.id]
                const isTotal = accent?.isTotal
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-line/50 transition-colors ${
                      isTotal
                        ? 'border-t-2 border-t-line bg-red-50/35'
                        : rowIndex % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50/45'
                    }`}
                  >
                    <td
                      className={`sticky left-0 z-10 min-w-[148px] px-3 py-3 font-medium whitespace-nowrap shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] ${
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
                    {view.months.map((m) => {
                      const isSelected = m.monthKey === selectedMonthKey
                      const value = row.values[m.monthKey] ?? 0
                      return (
                        <td
                          key={m.monthKey}
                          className={`num min-w-[5.5rem] px-2.5 py-3 text-right whitespace-nowrap transition-colors ${cellText} ${
                            isSelected ? selectedColumnClass(true) : ''
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
                              ? () => onMonthSelect(m.monthKey)
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
}: {
  view: WeeklyReportMonthlyView
  metric: WeeklyReportMetric
  onMetricChange: (m: WeeklyReportMetric) => void
  selectedMonthKey?: string
  onMonthSelect?: (monthKey: string) => void
}) {
  const [fullscreen, setFullscreen] = useState(false)
  const description = `최근 12개월 (${view.range.from} ~ ${view.range.to})`

  return (
    <>
      <Panel
        title="월별 현황"
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
        />
      </Panel>

      <WeeklyFullscreenOverlay
        open={fullscreen}
        title="월별 현황"
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
            large
          />
        </div>
      </WeeklyFullscreenOverlay>
    </>
  )
}
