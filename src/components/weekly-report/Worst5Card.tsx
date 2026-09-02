import { useMemo } from 'react'
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
import { formatPpm, formatPpmAsPercent } from '../../lib/format'
import { buildWeeklyReportProductLink } from '../../lib/weeklyReport'
import type { WorstProductItem } from '../../types'

function niceYMax(max: number) {
  if (max <= 0) return 1
  const padded = max * 1.18
  if (padded <= 1) return Math.ceil(padded * 100) / 100
  if (padded <= 5) return Math.ceil(padded * 10) / 10
  return Math.ceil(padded)
}

export function Worst5Card({
  title,
  color,
  minQty,
  items,
  periodStart,
  periodEnd,
}: {
  title: string
  color: string
  minQty: number
  items: WorstProductItem[]
  periodStart: string
  periodEnd: string
}) {
  const chartData = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        label:
          item.product.length > 10
            ? `${item.product.slice(0, 9)}…`
            : item.product,
        ratePercent: item.failRatePercent,
      })),
    [items],
  )

  const yMax = useMemo(
    () => niceYMax(Math.max(...chartData.map((d) => d.ratePercent), 0)),
    [chartData],
  )

  const yAxisWidth = useMemo(() => {
    const sample = `${yMax.toFixed(2)}%`
    return Math.max(44, Math.min(56, sample.length * 8 + 10))
  }, [yMax])

  return (
    <section className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        <p className="text-[11px] text-muted">
          대상: 검수량 {minQty.toLocaleString()}EA 이상
        </p>
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">
          조건에 맞는 품번이 없습니다.
        </p>
      ) : (
        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <div
            className="w-full overflow-visible pr-1"
            style={{ height: Math.max(220, items.length * 34 + 56) }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 18, right: 8, left: 4, bottom: 4 }}
                barCategoryGap="18%"
              >
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={0}
                  textAnchor="middle"
                  height={42}
                  tickMargin={8}
                  padding={{ left: 8, right: 8 }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  width={yAxisWidth}
                  domain={[0, yMax]}
                  tickCount={5}
                  tickFormatter={(v) => `${Number(v).toFixed(2)}%`}
                />
                <Tooltip
                  formatter={(v, _n, p) => [
                    `${Number(v).toFixed(2)}% (${formatPpm((p?.payload as WorstProductItem)?.failRate ?? 0)})`,
                    '부적합률',
                  ]}
                  labelFormatter={(_l, payload) =>
                    (payload?.[0]?.payload as WorstProductItem)?.product ?? ''
                  }
                />
                <Bar
                  dataKey="ratePercent"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  isAnimationActive={false}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.product} fill={color} />
                  ))}
                  <LabelList
                    dataKey="ratePercent"
                    position="top"
                    offset={4}
                    formatter={(v: unknown) => `${Number(v).toFixed(2)}%`}
                    style={{ fontSize: 10, fontWeight: 600, fill: '#334155' }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex min-w-0 flex-col justify-center">
            <div className="overflow-hidden rounded-lg border border-line">
              <table className="w-full table-fixed text-xs">
                <colgroup>
                  <col className="w-9" />
                  <col />
                  <col className="w-[68px]" />
                  <col className="w-[60px]" />
                  <col className="w-[76px]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-line bg-canvas/80 text-[11px] text-muted">
                    <th className="px-2 py-2 text-center font-semibold">순</th>
                    <th className="px-2 py-2 text-left font-semibold">품번</th>
                    <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">
                      부적합률
                    </th>
                    <th className="whitespace-nowrap px-2 py-2 text-right font-semibold">PPM</th>
                    <th className="whitespace-nowrap px-2 py-2 text-left font-semibold">
                      주요 부적합
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.product}
                      className="border-b border-line/50 last:border-b-0 hover:bg-canvas/40"
                    >
                      <td className="px-2 py-2.5 text-center font-semibold text-ink/70">
                        {item.rank}
                      </td>
                      <td className="px-2 py-2.5">
                        <Link
                          to={buildWeeklyReportProductLink(
                            item.product,
                            periodStart,
                            periodEnd,
                          )}
                          className="block truncate font-semibold text-accent hover:underline"
                          title={item.product}
                        >
                          {item.product}
                        </Link>
                      </td>
                      <td className="num whitespace-nowrap px-2 py-2.5 text-right font-semibold text-danger">
                        {formatPpmAsPercent(item.failRate)}
                      </td>
                      <td className="num px-2 py-2.5 text-right text-ink/80">
                        {item.failRate.toLocaleString()}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className="block truncate text-ink/75"
                          title={item.mainDefect}
                        >
                          {item.mainDefect}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
