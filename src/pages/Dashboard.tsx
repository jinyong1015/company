import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { KpiCard } from '../components/kpi/KpiCard'
import { Panel } from '../components/common/Panel'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { groupLabel } from '../lib/groups'
import { useFilters } from '../context/FilterContext'
import { downloadExcel } from '../lib/download'
import { formatPpm } from '../lib/format'
import type { DailyTrend, GroupTrendSeries } from '../types'
import { Sparkles } from 'lucide-react'

const trendMetrics = [
  { id: 'qty', label: '검수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'fail', label: '부적합수량' },
  { id: 'scrapCost', label: '폐기비용' },
] as const

type TrendMetricId = (typeof trendMetrics)[number]['id']

const GROUP_BAR_STYLE: { id: string; color: string }[] = [
  { id: 'seal', color: '#22c55e' },
  { id: 'hydraulic', color: '#38bdf8' },
  { id: 'plant2', color: '#a78bfa' },
]

const LINE_COLOR = '#f97316'
const LABEL_COLOR = '#ef4444'

const DEFECT_PIE_COLORS = [
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#84cc16',
  '#eab308',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#a855f7',
]

const PIE_LABEL_RADIAN = Math.PI / 180

function DefectPieLabel({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  name,
  payload,
}: {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  name?: string
  payload?: { share?: number }
}) {
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null
  ) {
    return null
  }
  const share = Number(payload?.share ?? 0)
  if (share < 3) return null
  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RADIAN)
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 600, pointerEvents: 'none' }}
    >
      <tspan x={x} dy="-0.55em">
        {name}
      </tspan>
      <tspan x={x} dy="1.25em">
        {share}%
      </tspan>
    </text>
  )
}

function formatTrendValue(metric: TrendMetricId, value: number) {
  if (metric === 'failRate') return formatPpm(value)
  if (metric === 'scrapCost') return `₩${value.toLocaleString()}`
  return value.toLocaleString()
}

function formatLineLabel(value: unknown) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return ''
  return Math.round(n).toLocaleString()
}

function yAxisTick(metric: TrendMetricId, v: number) {
  if (metric === 'failRate') return `${Math.round(v / 1000)}k`
  if (metric === 'scrapCost') {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(0)}M`
    if (v >= 1_000) return `${Math.round(v / 1_000)}k`
    return String(v)
  }
  return v.toLocaleString()
}

function buildGroupedTrendData(
  groupTrends: GroupTrendSeries[],
  totals: DailyTrend[],
  metric: TrendMetricId,
) {
  const dates = totals.map((t) => t.date)
  return dates.map((date, i) => {
    const row: Record<string, string | number> = {
      date,
      total: totals[i]?.[metric] ?? 0,
    }
    for (const g of groupTrends) {
      row[g.id] = g.trends[i]?.[metric] ?? 0
    }
    return row
  })
}

function QualityTrendChart({
  data,
  metric,
  metricLabel,
  trendGrain,
  groups,
}: {
  data: Record<string, string | number>[]
  metric: TrendMetricId
  metricLabel: string
  trendGrain: 'day' | 'month'
  groups?: { id: string; label: string; color: string }[]
}) {
  const tilt = trendGrain === 'day' && data.length > 14
  const grouped = Boolean(groups?.length)
  const denseLabels = data.length > 16

  return (
    <div className={`w-full ${grouped ? 'h-[380px]' : 'h-[320px]'}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{
            top: denseLabels ? 28 : 36,
            right: 16,
            left: 4,
            bottom: tilt ? 28 : 8,
          }}
        >
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={4}
            angle={tilt ? -35 : 0}
            textAnchor={tilt ? 'end' : 'middle'}
            height={tilt ? 50 : 30}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            width={metric === 'failRate' || metric === 'scrapCost' ? 56 : 48}
            tickFormatter={(v) => yAxisTick(metric, Number(v))}
          />
          <Tooltip
            contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
            formatter={(value, name) => [formatTrendValue(metric, Number(value ?? 0)), String(name)]}
            labelFormatter={(label) => (trendGrain === 'month' ? `${label}` : `날짜 ${label}`)}
          />
          {grouped ? <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} /> : null}
          {grouped
            ? groups!.map((g) => (
                <Bar
                  key={g.id}
                  dataKey={g.id}
                  name={g.label}
                  fill={g.color}
                  radius={[3, 3, 0, 0]}
                  maxBarSize={trendGrain === 'month' ? 28 : 16}
                />
              ))
            : (
                <Bar
                  dataKey={metric}
                  name={metricLabel}
                  fill="#93c5fd"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={trendGrain === 'month' ? 40 : 28}
                />
              )}
          <Line
            type="monotone"
            dataKey={grouped ? 'total' : metric}
            name={grouped ? `합계(${metricLabel})` : metricLabel}
            stroke={LINE_COLOR}
            strokeWidth={2.4}
            dot={{ r: 4, fill: LABEL_COLOR, stroke: LABEL_COLOR }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey={grouped ? 'total' : metric}
              position="top"
              offset={8}
              fill={LABEL_COLOR}
              fontSize={denseLabels ? 9 : 11}
              fontWeight={600}
              formatter={(v: unknown) => formatLineLabel(v)}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function Dashboard() {
  const { analytics, hasUploadedData, meta } = useData()
  const { filters } = useFilters()
  const { kpis, products, dailyTrends, defectTypes, groupSummaries, trendGrain, groupTrends } =
    analytics
  const [metric, setMetric] = useState<TrendMetricId>('qty')
  const [productSort, setProductSort] = useState<'fail' | 'failRate' | 'qty' | 'scrapCost' | 'changeRate'>('fail')

  const productTop = [...products]
    .sort((a, b) => b[productSort] - a[productSort])
    .slice(0, 10)

  const metricLabel = trendMetrics.find((m) => m.id === metric)?.label ?? ''
  const showGrouped = filters.analysisGroup === 'all'

  const chartGroups = useMemo(
    () =>
      groupTrends.map((g) => ({
        id: g.id,
        label: g.label,
        color: GROUP_BAR_STYLE.find((c) => c.id === g.id)?.color ?? '#94a3b8',
      })),
    [groupTrends],
  )

  const chartData = useMemo(() => {
    if (showGrouped) return buildGroupedTrendData(groupTrends, dailyTrends, metric)
    return dailyTrends.map((d) => ({ ...d }))
  }, [showGrouped, groupTrends, dailyTrends, metric])

  return (
    <div className="space-y-5">
      <PageHeader
        title="대시보드"
        description={
          hasUploadedData
            ? `${meta.fileName} · ${groupLabel(filters.analysisGroup)} 기준 품질 현황`
            : `${groupLabel(filters.analysisGroup)} 기준 품질 현황`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  '대시보드.xlsx',
                  groupSummaries.map((g) => ({
                    그룹: g.label,
                    검수량: g.qty,
                    부적합률_ppm: g.failRate,
                    부적합수량: g.fail,
                    폐기비용: g.scrapCost,
                  })),
                )
              }
              className="rounded-full border border-line bg-white px-3.5 py-2 text-sm hover:bg-canvas"
            >
              Excel 다운로드
            </button>
            <Link
              to="/ai"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <Sparkles size={14} />
              AI 분석
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </div>

      <Panel title="분석 그룹 비교" description="#N/A 제외 유효 DATA">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">그룹</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
              </tr>
            </thead>
            <tbody>
              {groupSummaries.map((g) => (
                <tr key={g.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{g.label}</td>
                  <td className="num px-2 py-2.5">{g.qty.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{formatPpm(g.failRate)}</td>
                  <td className="num px-2 py-2.5">{g.fail.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">₩{g.scrapCost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="품질 추이"
        description={
          showGrouped
            ? `${trendGrain === 'month' ? '월별' : '일별'} · 그룹 막대 + 합계 추이선`
            : trendGrain === 'month'
              ? '월별 집계'
              : '일별 집계'
        }
        actions={
          <div className="flex flex-wrap gap-1">
            {trendMetrics.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  metric === m.id ? 'bg-accent text-white' : 'bg-canvas text-muted'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <QualityTrendChart
          data={chartData}
          metric={metric}
          metricLabel={metricLabel}
          trendGrain={trendGrain}
          groups={showGrouped ? chartGroups : undefined}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="불량 유형 TOP 10" description="선택 기간 기준 점유율">
          <div className="h-[340px]">
            {defectTypes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                표시할 불량 유형 데이터가 없습니다.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={defectTypes}
                    dataKey="count"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={118}
                    paddingAngle={2}
                    stroke="#fff"
                    strokeWidth={2}
                    label={DefectPieLabel}
                    labelLine={false}
                  >
                    {defectTypes.map((d, i) => (
                      <Cell key={d.name} fill={DEFECT_PIE_COLORS[i % DEFECT_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
                    formatter={(value, name, item) => {
                      const share = Number(item?.payload?.share ?? 0)
                      return [`${Number(value ?? 0).toLocaleString()}건 (${share}%)`, String(name)]
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {defectTypes.map((d, i) => (
              <li key={d.name} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: DEFECT_PIE_COLORS[i % DEFECT_PIE_COLORS.length] }}
                  />
                  {d.name}
                </span>
                <span className="num text-muted">{d.share}%</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="품번 기준 불량 TOP 10"
          actions={
            <select
              value={productSort}
              onChange={(e) => setProductSort(e.target.value as typeof productSort)}
              className="rounded-lg border border-line px-2 py-1 text-xs"
            >
              <option value="fail">부적합수량</option>
              <option value="failRate">부적합률</option>
              <option value="qty">검수량</option>
              <option value="scrapCost">폐기비용</option>
              <option value="changeRate">증가율</option>
            </select>
          }
        >
          <div className="space-y-2">
            {productTop.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="flex items-center justify-between rounded-xl bg-canvas/70 px-3 py-2.5 hover:bg-accent-soft"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="num text-xs text-muted">
                    부적합 {p.fail.toLocaleString()} · {formatPpm(p.failRate)} · {p.mainDefect}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
