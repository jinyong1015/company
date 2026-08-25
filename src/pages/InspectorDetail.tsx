import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { filterRecords, buildPeriodTrends } from '../lib/analyze'
import { fromEntityId, toEntityId } from '../lib/entityId'
import { useMemo, useState } from 'react'
import { failRatePpm, formatPpm, formatWon } from '../lib/format'
import type { ProductBreakdown } from '../types'

function buildProductStats(
  records: { product: string; qty: number; fail: number; hours: number; scrapCost: number; mainDefect: string }[],
): ProductBreakdown[] {
  const map = new Map<string, typeof records>()
  for (const r of records) {
    const list = map.get(r.product) ?? []
    list.push(r)
    map.set(r.product, list)
  }
  return [...map.entries()]
    .map(([product, list]) => {
      const qty = list.reduce((s, r) => s + r.qty, 0)
      const fail = list.reduce((s, r) => s + r.fail, 0)
      const hours = list.reduce((s, r) => s + r.hours, 0)
      const defectCounts = list.reduce<Record<string, number>>((acc, r) => {
        acc[r.mainDefect] = (acc[r.mainDefect] ?? 0) + r.fail
        return acc
      }, {})
      const mainDefect =
        Object.entries(defectCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '기타'
      return {
        product,
        qty,
        fail,
        failRate: failRatePpm(fail, qty),
        scrapCost: list.reduce((s, r) => s + r.scrapCost, 0),
        hours: Math.round(hours * 10) / 10,
        minutes: Math.round(hours * 60),
        uph: hours > 0 ? Math.round(qty / hours) : 0,
        mainDefect,
      }
    })
    .sort((a, b) => b.qty - a.qty)
}

export function InspectorDetail() {
  const { id } = useParams()
  const { analytics, records } = useData()
  const { filters } = useFilters()
  const name = fromEntityId(id, 'ins')
  const [selectedProduct, setSelectedProduct] = useState('')

  const inspector =
    analytics.inspectors.find((i) => i.id === id || i.id === toEntityId('ins', name) || i.name === name) ??
    null

  const scoped = useMemo(
    () => filterRecords(records, filters, true).filter((r) => r.inspector === name),
    [records, filters, name],
  )

  const productOptions = useMemo(() => {
    if (scoped.length) return buildProductStats(scoped)
    return inspector?.products ?? []
  }, [scoped, inspector])

  const hasSelection = Boolean(selectedProduct)

  const filtered = useMemo(() => {
    if (!hasSelection) return scoped
    return scoped.filter((r) => r.product === selectedProduct)
  }, [scoped, hasSelection, selectedProduct])

  const selectedStats = useMemo(() => {
    if (!hasSelection) return productOptions
    return productOptions.filter((p) => p.product === selectedProduct)
  }, [productOptions, hasSelection, selectedProduct])

  const { trends: byDate, grain: trendGrain } = useMemo(
    () => buildPeriodTrends(filtered, filters),
    [filtered, filters],
  )

  if (!name) {
    return (
      <div className="space-y-5">
        <PageHeader title="검사자 상세" description="대상을 찾을 수 없습니다." />
      </div>
    )
  }

  if (!inspector && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={name}
          description="선택한 기간/분석 그룹에 이 검사자의 DATA가 없습니다."
          actions={
            <Link to="/inspectors" className="text-sm text-accent hover:underline">
              ← 목록으로
            </Link>
          }
        />
        <Panel>
          <p className="text-sm text-muted">기간이나 분석 그룹을 바꿔 다시 확인해 주세요.</p>
        </Panel>
      </div>
    )
  }

  const row = inspector ?? {
    id: toEntityId('ins', name),
    name,
    team: scoped[0]?.team || '미지정',
    count: scoped.length,
    qty: scoped.reduce((s, r) => s + r.qty, 0),
    pass: scoped.reduce((s, r) => s + r.pass, 0),
    fail: scoped.reduce((s, r) => s + r.fail, 0),
    failRate: 0,
    hours: scoped.reduce((s, r) => s + r.hours, 0),
    minutes: 0,
    uph: 0,
    scrapCost: scoped.reduce((s, r) => s + r.scrapCost, 0),
    products: productOptions,
  }

  const qty = filtered.reduce((s, r) => s + r.qty, 0)
  const fail = filtered.reduce((s, r) => s + r.fail, 0)
  const hours = filtered.reduce((s, r) => s + r.hours, 0)
  const scrapCost = filtered.reduce((s, r) => s + r.scrapCost, 0)
  const failRate = failRatePpm(fail, qty)
  const uph = hours > 0 ? Math.round(qty / hours) : 0
  const grainLabel = trendGrain === 'month' ? '월별' : '일별'
  // 일별: qty·UPH가 모두 0인 날짜는 그래프에서 제외
  const chartData =
    trendGrain === 'day' ? byDate.filter((d) => d.qty > 0 || d.uph > 0) : byDate
  // 일별(이번달·지난달·2개월 미만): 전체/품번 선택 모두, 실제 검사일 포인트 15개 초과 시 합계 라벨 숨김
  const showValueLabels = trendGrain === 'month' || chartData.length <= 15

  const qtyAxisWidth = Math.max(
    48,
    Math.min(88, String(Math.max(0, ...chartData.map((d) => d.qty), 0).toLocaleString('ko-KR')).length * 8 + 14),
  )
  const uphAxisWidth = Math.max(
    48,
    Math.min(88, String(Math.max(0, ...chartData.map((d) => d.uph), 0).toLocaleString('ko-KR')).length * 8 + 14),
  )
  const failRateAxisWidth = Math.max(
    52,
    Math.min(
      96,
      (() => {
        const max = Math.max(0, ...chartData.map((d) => d.failRate), 0)
        const sample = max >= 1000 ? `${Math.round(max / 1000)}k` : Math.round(max).toLocaleString('ko-KR')
        return sample.length * 8 + 18
      })(),
    ),
  )

  const molds = [...new Set(filtered.map((r) => r.moldNo))]
  const defects = Object.entries(
    filtered.reduce<Record<string, number>>((acc, r) => {
      acc[r.mainDefect] = (acc[r.mainDefect] ?? 0) + r.fail
      return acc
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  const scopeLabel = hasSelection ? `품번 ${selectedProduct} 기준` : '전체 품번 기준'

  return (
    <div className="space-y-5">
      <PageHeader
        title={row.name}
        description={`${row.team} · 선택한 기간/분석 그룹 기준 · ${scopeLabel}`}
        actions={
          <Link to="/inspectors" className="text-sm text-accent hover:underline">
            ← 목록으로
          </Link>
        }
      />

      <Panel
        title="작업 품번 선택"
        description="해당 기간에 검사한 품번을 선택하면 아래 지표가 선택한 품번 기준으로 바뀝니다."
      >
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-muted" htmlFor="inspector-product-select">
            품번
          </label>
          <select
            id="inspector-product-select"
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            className="min-w-[220px] rounded-lg border border-line bg-white px-3 py-2 text-sm"
            disabled={!productOptions.length}
          >
            <option value="">전체 ({productOptions.length})</option>
            {productOptions.map((p) => (
              <option key={p.product} value={p.product}>
                {p.product} · {p.qty.toLocaleString()} EA
              </option>
            ))}
          </select>
          {!productOptions.length && (
            <p className="text-sm text-muted">해당 기간에 작업한 품번이 없습니다.</p>
          )}
        </div>
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['검수량', qty.toLocaleString()],
          ['부적합률', formatPpm(failRate)],
          ['UPH', String(uph)],
          ['폐기비용', formatWon(scrapCost)],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title={`기간별 검사량 (${grainLabel})`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: showValueLabels ? 28 : 12, right: 28, left: 12, bottom: 4 }}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 28, right: 28 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  width={qtyAxisWidth}
                  tickFormatter={(v) => Number(v).toLocaleString('ko-KR')}
                />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Bar dataKey="qty" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={22}>
                  {showValueLabels && (
                    <LabelList
                      dataKey="qty"
                      position="top"
                      offset={6}
                      fill="#1f2937"
                      fontSize={11}
                      fontWeight={600}
                      formatter={(v: unknown) => Number(v).toLocaleString()}
                    />
                  )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={`기간별 UPH (${grainLabel})`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: showValueLabels ? 28 : 12, right: 28, left: 12, bottom: 4 }}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 28, right: 28 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  width={uphAxisWidth}
                  tickFormatter={(v) => Number(v).toLocaleString('ko-KR')}
                />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Line
                  type="monotone"
                  dataKey="uph"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#3b82f6', stroke: '#3b82f6' }}
                >
                  {showValueLabels && (
                    <LabelList
                      dataKey="uph"
                      position="top"
                      offset={8}
                      fill="#1f2937"
                      fontSize={11}
                      fontWeight={600}
                      formatter={(v: unknown) => {
                        const n = Number(v)
                        if (!n) return ''
                        return n.toLocaleString()
                      }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={`기간별 부적합률 (${grainLabel})`}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: showValueLabels ? 28 : 12, right: 40, left: 12, bottom: 4 }}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  padding={{ left: 28, right: 28 }}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#5b6577' }}
                  axisLine={false}
                  tickLine={false}
                  width={failRateAxisWidth}
                  tickFormatter={(v) => {
                    const n = Number(v)
                    if (n >= 1000) return `${Math.round(n / 1000)}k`
                    return Math.round(n).toLocaleString('ko-KR')
                  }}
                />
                <Tooltip
                  contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
                  formatter={(v: unknown) => [formatPpm(Number(v)), '부적합률']}
                />
                <Line
                  type="monotone"
                  dataKey="failRate"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={{ r: 3.5, fill: '#ef4444', stroke: '#ef4444' }}
                >
                  {showValueLabels && (
                    <LabelList
                      dataKey="failRate"
                      position="top"
                      offset={8}
                      fill="#1f2937"
                      fontSize={11}
                      fontWeight={600}
                      formatter={(v: unknown) => {
                        const n = Number(v)
                        if (!n) return ''
                        return formatPpm(n)
                      }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="선택 품번별 지표" description="선택한 품번(또는 전체)의 검사량 · UPH · 부적합률">
        <div className="overflow-x-auto">
          <table className="min-w-[560px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">품번</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">UPH</th>
              </tr>
            </thead>
            <tbody>
              {selectedStats.map((p) => (
                <tr key={p.product} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{p.product}</td>
                  <td className="num px-2 py-2.5">{p.qty.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{p.fail.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{formatPpm(p.failRate)}</td>
                  <td className="num px-2 py-2.5 font-semibold">{p.uph}</td>
                </tr>
              ))}
              {!selectedStats.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-muted">
                    표시할 품번이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
        <Panel title="담당 금형">
          <ul className="space-y-2 text-sm">
            {molds.slice(0, 8).map((m) => (
              <li key={m} className="border-b border-line/60 py-1.5">
                {m}
              </li>
            ))}
            {!molds.length && <li className="text-muted">데이터 없음</li>}
          </ul>
        </Panel>
        <Panel title="주요 불량 유형">
          <ul className="space-y-2 text-sm">
            {defects.map(([defectName, count]) => (
              <li key={defectName} className="flex justify-between border-b border-line/60 py-1.5">
                <span>{defectName}</span>
                <span className="num text-muted">{count.toLocaleString()}</span>
              </li>
            ))}
            {!defects.length && <li className="text-muted">데이터 없음</li>}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
