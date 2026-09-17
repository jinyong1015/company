import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart3, ListOrdered, Package, Trophy, type LucideIcon } from 'lucide-react'
import { formatPercent } from '../../lib/format'

export type QtyTopView = 'rank' | 'bar'

export type QtyTopItem = {
  id: string
  name: string
  meta?: string
  qty: number
  href: string
}

type RankRow = {
  id: string
  name: string
  meta: string
  qty: number
  href: string
  sharePercent: number
  barPercent: number
  rank: number
}

type MetricOpts = {
  valueLabel: string
  valueUnit: string
  formatValue: (n: number) => string
  ValueIcon: LucideIcon
}

function rankTone(rank: number): 'gold' | 'silver' | 'bronze' | 'muted' {
  if (rank === 1) return 'gold'
  if (rank === 2) return 'silver'
  if (rank === 3) return 'bronze'
  return 'muted'
}

function barFill(rank: number): string {
  if (rank === 1) return '#c2410c'
  if (rank === 2) return '#ea580c'
  if (rank === 3) return '#f97316'
  return '#fdba74'
}

function formatQty(n: number) {
  return Math.round(n).toLocaleString('ko-KR')
}

function RankListView({
  rows,
  metric,
}: {
  rows: RankRow[]
  metric: MetricOpts
}) {
  const [hoverId, setHoverId] = useState<string | null>(null)
  const hovered = rows.find((r) => r.id === hoverId) ?? null
  const Icon = metric.ValueIcon

  return (
    <div className="op-prod-top-list" onMouseLeave={() => setHoverId(null)}>
      {rows.map((row) => (
        <div
          key={row.id}
          className="op-prod-top-item"
          data-top={row.rank <= 3 ? 'true' : undefined}
          onMouseEnter={() => setHoverId(row.id)}
        >
          <Link
            to={row.href}
            className="op-prod-top-row"
            data-rank={row.rank}
            title={`${row.name} 상세 보기`}
          >
            <span className="op-prod-top-rank" data-tone={rankTone(row.rank)}>
              {row.rank}
            </span>
            <div className="op-prod-top-main">
              <div className="op-prod-top-row-head">
                <strong className="op-prod-top-name">{row.name}</strong>
                {row.meta ? (
                  <span className="op-prod-top-factory">{row.meta}</span>
                ) : null}
              </div>
              <div className="op-prod-top-track" aria-hidden>
                <div
                  className="op-prod-top-fill"
                  style={{
                    width: `${Math.max(row.barPercent, 3)}%`,
                    background: barFill(row.rank),
                  }}
                />
              </div>
            </div>
            <div className="op-prod-top-metrics">
              <span className="op-prod-top-qty num">
                <Icon size={13} aria-hidden />
                {metric.formatValue(row.qty)}
                {metric.valueUnit ? (
                  <span className="op-prod-top-unit">{metric.valueUnit}</span>
                ) : null}
              </span>
              <span className="op-prod-top-share num">
                {formatPercent(row.sharePercent)}
              </span>
            </div>
          </Link>

          {hovered?.id === row.id ? (
            <div className="op-prod-top-tooltip" role="tooltip">
              <p>
                <strong>{row.rank}위</strong> · {row.name}
              </p>
              {row.meta ? <p>{row.meta}</p> : null}
              <p>
                {metric.valueLabel}: {metric.formatValue(row.qty)}
                {metric.valueUnit ? ` ${metric.valueUnit}` : ''}
              </p>
              <p>전체 대비: {formatPercent(row.sharePercent)}</p>
              <p className="op-prod-top-tooltip-hint">클릭하여 상세 보기</p>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  )
}

function BarChartView({
  rows,
  metric,
}: {
  rows: RankRow[]
  metric: MetricOpts
}) {
  return (
    <div className="op-prod-top-chart op-prod-top-chart--labeled">
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={rows}
          margin={{ top: 36, right: 16, left: 8, bottom: 56 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
          <XAxis
            dataKey="name"
            interval={0}
            height={58}
            tickMargin={10}
            tick={(props) => {
              const { x, y, payload, index } = props
              const row = rows[index ?? 0]
              const name = String(payload?.value ?? '')
              const display = name.length > 8 ? `${name.slice(0, 8)}…` : name
              return (
                <g transform={`translate(${x},${y})`}>
                  <text
                    x={0}
                    y={0}
                    dy={14}
                    textAnchor="middle"
                    className="op-prod-top-bar-name"
                  >
                    {display}
                  </text>
                  {row ? (
                    <text
                      x={0}
                      y={0}
                      dy={30}
                      textAnchor="middle"
                      className="op-prod-top-bar-rank"
                    >
                      {row.rank}위
                    </text>
                  ) : null}
                </g>
              )
            }}
          />
          <YAxis
            tick={{ fill: 'var(--color-muted)', fontSize: 12, fontWeight: 600 }}
            tickFormatter={(v) => metric.formatValue(Number(v))}
            width={84}
          />
          <Tooltip
            contentStyle={{
              background: 'var(--color-surface)',
              border: '1px solid var(--color-line)',
              borderRadius: 12,
            }}
            formatter={(value) => [
              `${metric.formatValue(Number(value))}${
                metric.valueUnit ? ` ${metric.valueUnit}` : ''
              }`,
              metric.valueLabel,
            ]}
            labelFormatter={(_, payload) => {
              const row = payload?.[0]?.payload as RankRow | undefined
              if (!row) return ''
              return row.meta
                ? `${row.rank}위 · ${row.name} (${row.meta})`
                : `${row.rank}위 · ${row.name}`
            }}
          />
          <Bar
            dataKey="qty"
            name={metric.valueLabel}
            radius={[6, 6, 0, 0]}
            maxBarSize={48}
          >
            {rows.map((d) => (
              <Cell key={d.id} fill={barFill(d.rank)} />
            ))}
            <LabelList
              dataKey="qty"
              position="top"
              offset={8}
              className="op-prod-top-bar-value"
              formatter={(value) => metric.formatValue(Number(value))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="op-prod-top-hint">가로 순위 행을 클릭하면 상세로 이동합니다.</p>
    </div>
  )
}

export function QtyTop10Chart({
  items,
  title,
  subtitle,
  badgeLabel = '전체',
  tone = 'all',
  view,
  onViewChange,
  emptyMessage = '표시할 검수량 데이터가 없습니다.',
  typeTabs,
  valueLabel = '검수량',
  valueUnit = 'EA',
  formatValue = formatQty,
  ValueIcon = Package,
}: {
  items: QtyTopItem[]
  title: string
  subtitle: string
  badgeLabel?: string
  tone?: 'all' | 'seal' | 'grommet'
  view: QtyTopView
  onViewChange: (view: QtyTopView) => void
  emptyMessage?: string
  typeTabs?: ReactNode
  valueLabel?: string
  valueUnit?: string
  formatValue?: (n: number) => string
  ValueIcon?: LucideIcon
}) {
  const metric: MetricOpts = useMemo(
    () => ({ valueLabel, valueUnit, formatValue, ValueIcon }),
    [valueLabel, valueUnit, formatValue, ValueIcon],
  )

  const { chartRows, topSum, totalQty, topShare } = useMemo(() => {
    const positive = items.filter((r) => r.qty > 0)
    const total = positive.reduce((s, r) => s + r.qty, 0)
    const ranked = [...positive].sort((a, b) => b.qty - a.qty).slice(0, 10)
    const max = ranked[0]?.qty ?? 0
    const sum = ranked.reduce((s, r) => s + r.qty, 0)

    return {
      totalQty: total,
      topSum: sum,
      topShare: total > 0 ? (sum / total) * 100 : 0,
      chartRows: ranked.map((r, idx) => ({
        id: r.id,
        name: r.name,
        meta: r.meta ?? '',
        qty: r.qty,
        href: r.href,
        sharePercent: total > 0 ? (r.qty / total) * 100 : 0,
        barPercent: max > 0 ? (r.qty / max) * 100 : 0,
        rank: idx + 1,
      })) as RankRow[],
    }
  }, [items])

  return (
    <section className="op-prod-top" data-tone={tone}>
      <header className="op-prod-top-head">
        <div className="op-prod-top-head-main">
          <span className="op-prod-top-badge">
            <Trophy size={14} aria-hidden />
            {badgeLabel}
          </span>
          <div>
            <h2 className="op-prod-top-title">{title}</h2>
            <p className="op-prod-top-sub">{subtitle}</p>
          </div>
        </div>
        <div className="op-prod-top-head-controls">
          {typeTabs}
          <div className="filter-pills" role="tablist" aria-label="보기 방식">
            <button
              type="button"
              className="filter-pill"
              role="tab"
              aria-selected={view === 'rank'}
              data-active={view === 'rank'}
              onClick={() => onViewChange('rank')}
            >
              <ListOrdered size={14} aria-hidden />
              가로 순위
            </button>
            <button
              type="button"
              className="filter-pill"
              role="tab"
              aria-selected={view === 'bar'}
              data-active={view === 'bar'}
              onClick={() => onViewChange('bar')}
            >
              <BarChart3 size={14} aria-hidden />
              막대 차트
            </button>
          </div>
        </div>
      </header>

      {chartRows.length === 0 ? (
        <p className="op-prod-top-empty">{emptyMessage}</p>
      ) : (
        <div className="op-prod-top-body">
          <div className="op-prod-top-summary">
            <div className="op-prod-top-stat">
              <span className="op-prod-top-stat-label">TOP 10 합계</span>
              <strong className="op-prod-top-stat-value">
                {metric.formatValue(topSum)}
                {metric.valueUnit ? <span>{metric.valueUnit}</span> : null}
              </strong>
            </div>
            <div className="op-prod-top-stat">
              <span className="op-prod-top-stat-label">전체 대비</span>
              <strong className="op-prod-top-stat-value">
                {formatPercent(topShare)}
              </strong>
            </div>
            <div className="op-prod-top-stat">
              <span className="op-prod-top-stat-label">조회 범위 전체</span>
              <strong className="op-prod-top-stat-value">
                {metric.formatValue(totalQty)}
                {metric.valueUnit ? <span>{metric.valueUnit}</span> : null}
              </strong>
            </div>
          </div>

          {view === 'bar' ? (
            <BarChartView rows={chartRows} metric={metric} />
          ) : (
            <RankListView rows={chartRows} metric={metric} />
          )}
        </div>
      )}
    </section>
  )
}
