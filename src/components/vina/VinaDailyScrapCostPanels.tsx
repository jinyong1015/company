import { useMemo } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Panel } from '../common/Panel'
import { buildPeriodTrends } from '../../lib/analyze'
import type { FilterState } from '../../context/FilterContext'
import { formatWon, formatWonSuffix, roundWon } from '../../lib/format'
import { sameItemMatchKey } from '../../lib/itemMatchKey'
import type { DailyTrend, InspectionRecord } from '../../types'

const LINE_COLOR = '#f59e0b'

function formatTrendAxisLabel(label: string, grain: 'day' | 'month') {
  if (grain === 'month') return label
  // "10-01" → "10/01"
  return label.replace('-', '/')
}

function ScrapCostLineChart({
  data,
  grain,
}: {
  data: Array<{ date: string; scrapCost: number; fail: number }>
  grain: 'day' | 'month'
}) {
  const showLabels = data.length <= 15
  const maxCost = Math.max(0, ...data.map((d) => d.scrapCost))
  const axisWidth = Math.max(
    56,
    Math.min(
      96,
      `${Math.round(maxCost).toLocaleString('ko-KR')}`.length * 8 + 18,
    ),
  )

  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: showLabels ? 28 : 12, right: 28, left: 8, bottom: 4 }}
        >
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            padding={{ left: 20, right: 20 }}
            tickFormatter={(v) => formatTrendAxisLabel(String(v), grain)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            width={axisWidth}
            tickFormatter={(v) => Number(v).toLocaleString('ko-KR')}
          />
          <Tooltip
            contentStyle={{
              border: '1px solid #e2e6ec',
              borderRadius: 12,
              boxShadow: 'none',
              fontSize: 12,
            }}
            labelFormatter={(label) =>
              formatTrendAxisLabel(String(label), grain)
            }
            formatter={(value, name) => {
              const n = Number(value ?? 0)
              if (name === 'fail') {
                return [`${n.toLocaleString('ko-KR')} EA`, '불량수량']
              }
              return [formatWonSuffix(n), '불량금액']
            }}
          />
          <Line
            type="monotone"
            dataKey="scrapCost"
            name="scrapCost"
            stroke={LINE_COLOR}
            strokeWidth={2.2}
            dot={{ r: 3.5, fill: LINE_COLOR, stroke: LINE_COLOR }}
            activeDot={{ r: 5 }}
          >
            {showLabels ? (
              <LabelList
                dataKey="scrapCost"
                position="top"
                offset={8}
                fill="#1f2937"
                fontSize={10}
                fontWeight={600}
                formatter={(v: unknown) => {
                  const n = Number(v)
                  if (!n) return ''
                  return roundWon(n).toLocaleString('ko-KR')
                }}
              />
            ) : null}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function DailyScrapTable({
  rows,
  grain,
  showFail,
}: {
  rows: DailyTrend[]
  grain: 'day' | 'month'
  showFail?: boolean
}) {
  const visible = rows.filter((r) => r.scrapCost > 0 || r.fail > 0)
  if (!visible.length) {
    return (
      <p className="py-6 text-center text-sm text-muted">
        해당 기간에 불량금액 데이터가 없습니다.
      </p>
    )
  }

  return (
    <div className="max-h-[280px] overflow-auto rounded-xl border border-line">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-[1] bg-canvas">
          <tr className="border-b border-line text-xs text-muted">
            <th className="px-3 py-2 font-medium">
              {grain === 'month' ? '월' : '날짜'}
            </th>
            {showFail ? (
              <th className="px-3 py-2 font-medium text-right">불량수량</th>
            ) : null}
            <th className="px-3 py-2 font-medium text-right">불량금액</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => (
            <tr key={row.date} className="border-b border-line/70">
              <td className="px-3 py-2 font-medium text-ink">
                {formatTrendAxisLabel(row.date, grain)}
              </td>
              {showFail ? (
                <td className="num px-3 py-2 text-right">
                  {row.fail.toLocaleString('ko-KR')}
                </td>
              ) : null}
              <td className="num px-3 py-2 text-right">
                {formatWonSuffix(row.scrapCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * VINA 비용 분석 — 일별(긴 기간은 월별) 불량금액.
 * 금액은 기존 InspectionRecord.scrapCost(NG금액, 없으면 단가×NG) 합산.
 */
export function VinaDailyScrapCostPanels({
  records,
  filters,
  productOptions,
  selectedProduct,
  onSelectProduct,
}: {
  records: InspectionRecord[]
  filters: FilterState
  productOptions: string[]
  selectedProduct: string
  onSelectProduct: (product: string) => void
}) {
  const overall = useMemo(
    () => buildPeriodTrends(records, filters),
    [records, filters],
  )

  const productRecords = useMemo(() => {
    if (!selectedProduct) return []
    return records.filter((r) => sameItemMatchKey(r.product, selectedProduct))
  }, [records, selectedProduct])

  const byProduct = useMemo(
    () => buildPeriodTrends(productRecords, filters),
    [productRecords, filters],
  )

  const overallTotal = useMemo(
    () => roundWon(overall.trends.reduce((s, t) => s + t.scrapCost, 0)),
    [overall.trends],
  )
  const productTotal = useMemo(
    () => roundWon(byProduct.trends.reduce((s, t) => s + t.scrapCost, 0)),
    [byProduct.trends],
  )

  const overallChart = useMemo(
    () =>
      overall.trends.map((t) => ({
        date: t.date,
        scrapCost: roundWon(t.scrapCost),
        fail: t.fail,
      })),
    [overall.trends],
  )
  const productChart = useMemo(
    () =>
      byProduct.trends.map((t) => ({
        date: t.date,
        scrapCost: roundWon(t.scrapCost),
        fail: t.fail,
      })),
    [byProduct.trends],
  )

  const grainLabel = overall.grain === 'month' ? '월별' : '일별'
  const activeProduct =
    selectedProduct &&
    productOptions.some((p) => sameItemMatchKey(p, selectedProduct))
      ? productOptions.find((p) => sameItemMatchKey(p, selectedProduct)) ??
        selectedProduct
      : ''

  return (
    <div className="space-y-5">
      <Panel
        title={`VINA 전체 ${grainLabel} 불량금액`}
        description="조회기간 기준 · VINA DATA의 NG금액(폐기금액)을 날짜별 합산합니다."
        actions={
          <div className="rounded-xl border border-line bg-canvas/70 px-3 py-2 text-right">
            <p className="text-[11px] font-semibold text-muted">기간 합계</p>
            <p className="num text-sm font-bold text-ink">
              {formatWon(overallTotal)}
            </p>
          </div>
        }
      >
        <div className="space-y-4">
          <ScrapCostLineChart data={overallChart} grain={overall.grain} />
          <DailyScrapTable rows={overall.trends} grain={overall.grain} />
        </div>
      </Panel>

      <Panel
        title={`품번별 ${grainLabel} 불량금액`}
        description="품번을 선택하면 해당 품번의 불량수량·불량금액 추이를 표시합니다."
        actions={
          <label className="flex min-w-[12rem] flex-col gap-1 text-left">
            <span className="text-[11px] font-semibold text-muted">품번</span>
            <select
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm text-ink"
              value={activeProduct}
              onChange={(e) => onSelectProduct(e.target.value)}
              aria-label="일별 불량금액 품번 선택"
            >
              <option value="">품번 선택</option>
              {productOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {!activeProduct ? (
          <p className="py-8 text-center text-sm text-muted">
            품번을 선택하면 일별 불량금액 추이가 표시됩니다.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {activeProduct}
                <span className="ml-2 text-xs font-medium text-muted">
                  기간 합계 {formatWonSuffix(productTotal)}
                </span>
              </p>
            </div>
            <ScrapCostLineChart data={productChart} grain={byProduct.grain} />
            <DailyScrapTable
              rows={byProduct.trends}
              grain={byProduct.grain}
              showFail
            />
          </div>
        )}
      </Panel>
    </div>
  )
}
