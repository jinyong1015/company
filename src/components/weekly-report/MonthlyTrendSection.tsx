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
import { Panel } from '../common/Panel'
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
  return 'bg-amber-50/90 ring-1 ring-inset ring-amber-200/70'
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
  if (metric === 'scrapCost' && v >= 1_000_000) {
    return `${Math.round(v / 1_000_000)}M`
  }
  return Math.round(v).toLocaleString('ko-KR')
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
  const chartData = chartDataFromMonthly(view)
  const groups = WEEKLY_REPORT_MONTHLY_BAR_ORDER.map((id) => {
    const o = WEEKLY_REPORT_ORGS.find((org) => org.id === id)!
    return { id: o.id, label: o.label, color: o.color }
  })

  return (
    <Panel
      title="월별 현황"
      description={`최근 12개월 (${view.range.from} ~ ${view.range.to})`}
      actions={
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
      }
    >
      <div className="mb-4 h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 28, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#5b6577' }}
              axisLine={false}
              tickLine={false}
              interval={0}
              minTickGap={2}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#5b6577' }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v) => yAxisTick(metric, Number(v))}
            />
            <Tooltip
              contentStyle={{
                border: '1px solid #e2e6ec',
                borderRadius: 12,
                fontSize: 12,
              }}
              formatter={(value, name) => [
                formatValue(metric, Number(value ?? 0)),
                String(name),
              ]}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
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
                maxBarSize={28}
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
              strokeWidth={2.4}
              dot={{ r: 4, fill: LABEL_COLOR, stroke: LABEL_COLOR }}
            >
              <LabelList
                dataKey="total"
                position="top"
                offset={8}
                fill={LABEL_COLOR}
                fontSize={10}
                fontWeight={600}
                formatter={(v: unknown) => {
                  const n = Number(v ?? 0)
                  if (!Number.isFinite(n)) return ''
                  if (metric === 'failRate') return formatPpm(n)
                  if (metric === 'scrapCost') return `${Math.round(n / 1000)}k`
                  return Math.round(n).toLocaleString()
                }}
              />
            </Line>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-hidden rounded-xl border border-line shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/60 px-4 py-2.5">
          <p className="text-xs font-medium text-ink">월별 수치표</p>
          <p className="text-[11px] text-muted">
            단위: {weeklyReportMetricLabel(metric)}
            {metric === 'scrapCost' ? ' (원)' : metric === 'failRate' ? ' (ppm)' : ' (EA)'}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] table-fixed text-sm">
            <colgroup>
              <col className="w-[156px]" />
              {view.months.map((m) => (
                <col key={m.monthKey} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-line bg-slate-50/90 text-left text-xs text-muted">
                <th className="sticky left-0 z-20 bg-slate-50/95 px-3 py-3 font-semibold text-ink shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)]">
                  구분
                </th>
                {view.months.map((m) => {
                  const isSelected = m.monthKey === selectedMonthKey
                  return (
                    <th
                      key={m.monthKey}
                      className={`px-2 py-3 text-right font-semibold whitespace-nowrap transition-colors ${
                        isSelected
                          ? `${selectedColumnClass(true)} text-ink`
                          : onMonthSelect
                            ? 'cursor-pointer hover:bg-white hover:text-accent'
                            : ''
                      }`}
                      onClick={onMonthSelect ? () => onMonthSelect(m.monthKey) : undefined}
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
                      className={`sticky left-0 z-10 px-3 py-3 font-medium shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)] ${
                        isTotal
                          ? 'bg-red-50/90 font-semibold text-danger'
                          : 'bg-inherit text-ink'
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
                          className={`num px-2 py-3 text-right text-[13px] whitespace-nowrap transition-colors ${
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
                          onClick={onMonthSelect ? () => onMonthSelect(m.monthKey) : undefined}
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
    </Panel>
  )
}
