import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Coins, Gauge, Package, Users } from 'lucide-react'
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
import { ResponsiveGrid } from '../components/common/ResponsiveGrid'
import {
  DetailBackNav,
  DetailHero,
  DetailKpiStrip,
  DetailProductPicker,
  DetailSnapshotBanner,
} from '../components/detail/DetailChrome'
import { DEFECT_TYPE_COLORS } from '../lib/defectColors'
import { useData } from '../context/DataContext'
import { cloneFilterState, useFilters, type FilterState } from '../context/FilterContext'
import { filterRecords, buildPeriodTrends, resolvePeriodRange } from '../lib/analyze'
import { fromEntityId, toEntityId } from '../lib/entityId'
import {
  buildProductDetailHref,
  buildProductDetailReturnHref,
  readUrlDateRange,
} from '../lib/productDetailNav'
import { useWeeklySnapshotSourceRecords } from '../hooks/useWeeklySnapshotSourceRecords'
import { useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react'
import { failRatePpm, formatPpm, formatWon } from '../lib/format'
import type { ProductBreakdown } from '../types'

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function InspectorDetailBackNav({
  productName,
  productHref,
  periodRange,
}: {
  productName?: string
  productHref?: string
  periodRange?: { start: string; end: string } | null
}) {
  const toProduct = Boolean(productName && productHref)
  return (
    <DetailBackNav
      to={toProduct ? productHref! : '/inspectors'}
      label={toProduct ? productName! : '검사자 분석'}
      ariaLabel="검사자 상세 돌아가기"
      Icon={toProduct ? Package : Users}
      metas={[
        ...(toProduct ? [{ label: '품번', value: productName! }] : []),
        ...(periodRange
          ? [
              {
                label: '조회기간',
                value: `${periodRange.start} ~ ${periodRange.end}`,
              },
            ]
          : []),
      ]}
    />
  )
}

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
  const [searchParams] = useSearchParams()
  const { analytics } = useData()
  const { filters, setCustomDateRange, replaceFilters } = useFilters()
  const name = fromEntityId(id, 'ins')
  const productFromUrl = searchParams.get('product')?.trim() ?? ''
  const snapshotId = searchParams.get('snapshotId')?.trim() || null
  const {
    records: sourceRecords,
    usingSnapshot,
    status: snapshotStatus,
    error: snapshotError,
  } = useWeeklySnapshotSourceRecords(snapshotId)
  const urlDateRange = useMemo(
    () => readUrlDateRange(searchParams),
    [searchParams],
  )
  const [selectedProduct, setSelectedProduct] = useState(productFromUrl)
  const [productQuery, setProductQuery] = useState('')
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  useLayoutEffect(() => {
    if (!urlDateRange) return
    const snapshot = cloneFilterState(filtersRef.current)
    setCustomDateRange(urlDateRange.startDate, urlDateRange.endDate)
    return () => {
      replaceFilters(snapshot)
    }
  }, [
    urlDateRange?.startDate,
    urlDateRange?.endDate,
    setCustomDateRange,
    replaceFilters,
  ])

  const effectiveFilters = useMemo<FilterState>(() => {
    const base: FilterState = usingSnapshot
      ? {
          ...filters,
          analysisGroup: 'all',
          teams: [],
          inspectors: [],
          workTypes: [],
          productTypes: [],
          products: [],
          molds: [],
          equipment: [],
          workers: [],
          lots: [],
        }
      : filters
    if (!urlDateRange) return base
    return {
      ...base,
      period: 'custom',
      startDate: urlDateRange.startDate,
      endDate: urlDateRange.endDate,
    }
  }, [filters, urlDateRange, usingSnapshot])

  const inspector =
    analytics.inspectors.find((i) => i.id === id || i.id === toEntityId('ins', name) || i.name === name) ??
    null

  const scoped = useMemo(
    () => filterRecords(sourceRecords, effectiveFilters, true).filter((r) => r.inspector === name),
    [sourceRecords, effectiveFilters, name],
  )

  const productOptions = useMemo(() => {
    if (scoped.length) return buildProductStats(scoped)
    return inspector?.products ?? []
  }, [scoped, inspector])

  useEffect(() => {
    if (!productFromUrl) return
    if (productOptions.some((p) => p.product === productFromUrl)) {
      setSelectedProduct(productFromUrl)
    }
  }, [productFromUrl, productOptions])

  const activeProduct = productOptions.some((p) => p.product === selectedProduct)
    ? selectedProduct
    : ''
  const hasSelection = Boolean(activeProduct)

  const backNavProduct = productFromUrl || ''
  const periodRange = urlDateRange
    ? { start: urlDateRange.startDate, end: urlDateRange.endDate }
    : null
  const backNavProps = {
    ...(backNavProduct
      ? {
          productName: backNavProduct,
          productHref: buildProductDetailReturnHref(
            toEntityId('prd', backNavProduct),
            searchParams,
            {
              inspector: name,
              inspectorId: id ?? toEntityId('ins', name),
            },
          ),
        }
      : {}),
    periodRange,
  }

  const visibleProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase()
    if (!q) return productOptions
    return productOptions.filter((p) => p.product.toLowerCase().includes(q))
  }, [productOptions, productQuery])

  const filtered = useMemo(() => {
    if (!hasSelection) return scoped
    return scoped.filter((r) => r.product === activeProduct)
  }, [scoped, hasSelection, activeProduct])

  const selectedStats = useMemo(() => {
    if (!hasSelection) return productOptions
    return productOptions.filter((p) => p.product === activeProduct)
  }, [productOptions, hasSelection, activeProduct])

  const { trends: byDate, grain: trendGrain } = useMemo(
    () => buildPeriodTrends(filtered, effectiveFilters),
    [filtered, effectiveFilters],
  )

  const snapshotBanner = usingSnapshot ? (
    <DetailSnapshotBanner status={snapshotStatus} error={snapshotError} />
  ) : null

  if (!name) {
    return (
      <div className="space-y-5">
        <InspectorDetailBackNav {...backNavProps} />
        <PageHeader title="검사자 상세" description="대상을 찾을 수 없습니다." />
      </div>
    )
  }

  if (usingSnapshot && snapshotStatus === 'loading') {
    return (
      <div className="space-y-5">
        <InspectorDetailBackNav {...backNavProps} />
        {snapshotBanner}
      </div>
    )
  }

  if (!inspector && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <InspectorDetailBackNav {...backNavProps} />
        {snapshotBanner}
        <DetailHero
          eyebrow="검사자 상세"
          title={name}
          description="선택한 기간/분석 그룹에 이 검사자의 DATA가 없습니다."
        />
        <Panel>
          <p className="text-sm text-muted">
            {usingSnapshot
              ? '스냅샷에 저장된 원본 행 기준으로 해당 검사자 DATA가 없습니다.'
              : '기간이나 분석 그룹을 바꿔 다시 확인해 주세요.'}
          </p>
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

  const scopeLabel = hasSelection ? `품번 ${activeProduct}` : '전체 품번'
  const totalQty = productOptions.reduce((s, p) => s + p.qty, 0)
  const period = resolvePeriodRange(effectiveFilters)
  const periodStart = toDateInput(period.start)
  const periodEnd = toDateInput(period.end)
  const inspectorId = row.id

  function productDetailHref(productName: string) {
    if (urlDateRange || searchParams.get('from') === 'weekly-report') {
      return buildProductDetailReturnHref(
        toEntityId('prd', productName),
        searchParams,
        {
          inspector: name,
          inspectorId,
        },
      )
    }
    return buildProductDetailHref(toEntityId('prd', productName), 'inspectors', {
      startDate: periodStart,
      endDate: periodEnd,
      inspector: name,
      inspectorId,
    })
  }

  return (
    <div className="space-y-5">
      <InspectorDetailBackNav {...backNavProps} />
      {snapshotBanner}
      <DetailHero
        eyebrow="검사자 상세"
        title={row.name}
        description={`${row.team} · 선택한 기간/분석 그룹 기준 · ${scopeLabel}`}
        chips={[row.team, scopeLabel]}
      />

      <DetailProductPicker
        productQuery={productQuery}
        onQueryChange={setProductQuery}
        selectId="inspector-product-select"
        activeProduct={activeProduct}
        onSelectProduct={setSelectedProduct}
        productOptions={productOptions}
        visibleProducts={visibleProducts}
        totalQty={totalQty}
        qtyLabel="검수"
        renderMeta={(p) => (
          <span className="detail-pick-meta">
            <span>
              검수 <strong className="num">{p.qty.toLocaleString()}</strong>
            </span>
            <span>
              부적합 <strong className="num">{formatPpm(p.failRate ?? 0)}</strong>
            </span>
            <span>
              UPH <strong className="num">{(p.uph ?? 0).toLocaleString()}</strong>
            </span>
          </span>
        )}
      />

      <DetailKpiStrip
        items={[
          { label: '검수량', value: qty.toLocaleString(), tone: 'accent', icon: Package },
          {
            label: '부적합률',
            value: formatPpm(failRate),
            tone: failRate > 0 ? 'danger' : 'default',
            icon: AlertTriangle,
          },
          { label: 'UPH', value: String(uph), tone: 'accent', icon: Gauge },
          { label: '폐기비용', value: formatWon(scrapCost), tone: 'warn', icon: Coins },
        ]}
      />

      <ResponsiveGrid variant="cards">
        <Panel
          title={`기간별 검사량 (${grainLabel})`}
          description="선택한 기간·품번 기준 일별 검사량"
        >
          <div className="detail-chart-frame">
            <div className="h-[248px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{
                    top: showValueLabels ? 26 : 10,
                    right: 10,
                    left: 0,
                    bottom: 4,
                  }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid
                    stroke="#e8eef5"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dy={4}
                    padding={{ left: 12, right: 12 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={Math.min(qtyAxisWidth, 52)}
                    tickFormatter={(v) => {
                      const n = Number(v)
                      if (n >= 1_000_000)
                        return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
                      if (n >= 1_000) return `${Math.round(n / 1000)}K`
                      return String(n)
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #dbe3ee',
                      borderRadius: 14,
                      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.97)',
                      padding: '10px 12px',
                    }}
                    cursor={{ fill: 'rgba(59, 130, 246, 0.05)' }}
                    formatter={(v: unknown) => [
                      Number(v).toLocaleString(),
                      '검사량',
                    ]}
                    labelFormatter={(label) => `날짜 ${label}`}
                  />
                  <Bar
                    dataKey="qty"
                    name="검사량"
                    fill="#7db4f8"
                    radius={[8, 8, 3, 3]}
                    maxBarSize={34}
                  >
                    {showValueLabels && (
                      <LabelList
                        dataKey="qty"
                        position="top"
                        offset={8}
                        fill="#334155"
                        fontSize={10}
                        fontWeight={700}
                        formatter={(v: unknown) => {
                          const n = Number(v)
                          if (!n) return ''
                          if (n >= 1_000_000)
                            return `${(n / 1_000_000).toFixed(1)}M`
                          if (n >= 10_000) return `${Math.round(n / 1000)}K`
                          return n.toLocaleString()
                        }}
                      />
                    )}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        <Panel
          title={`기간별 UPH (${grainLabel})`}
          description="시간당 검사 효율 추이"
        >
          <div className="detail-chart-frame">
            <div className="h-[248px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: showValueLabels ? 26 : 10,
                    right: 12,
                    left: 0,
                    bottom: 4,
                  }}
                >
                  <CartesianGrid
                    stroke="#e8eef5"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dy={4}
                    padding={{ left: 12, right: 12 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={Math.min(uphAxisWidth, 52)}
                    tickFormatter={(v) => {
                      const n = Number(v)
                      if (n >= 1_000_000)
                        return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
                      if (n >= 1_000) return `${Math.round(n / 1000)}K`
                      return String(n)
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #dbe3ee',
                      borderRadius: 14,
                      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.97)',
                      padding: '10px 12px',
                    }}
                    cursor={{ stroke: 'rgba(59, 130, 246, 0.25)', strokeWidth: 1 }}
                    formatter={(v: unknown) => [
                      Number(v).toLocaleString(),
                      'UPH',
                    ]}
                    labelFormatter={(label) => `날짜 ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="uph"
                    name="UPH"
                    stroke="#3b82f6"
                    strokeWidth={2.4}
                    dot={{
                      r: 3.4,
                      fill: '#fff',
                      stroke: '#3b82f6',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: '#fff',
                      stroke: '#3b82f6',
                      strokeWidth: 2.5,
                    }}
                  >
                    {showValueLabels && (
                      <LabelList
                        dataKey="uph"
                        position="top"
                        offset={10}
                        fill="#1d4ed8"
                        fontSize={10}
                        fontWeight={700}
                        formatter={(v: unknown) => {
                          const n = Number(v)
                          if (!n) return ''
                          if (n >= 10_000) return `${Math.round(n / 1000)}K`
                          return n.toLocaleString()
                        }}
                      />
                    )}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </Panel>

        <Panel
          title={`기간별 부적합률 (${grainLabel})`}
          description="부적합률(ppm) 일별 추이"
        >
          <div className="detail-chart-frame">
            <div className="h-[248px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{
                    top: showValueLabels ? 26 : 10,
                    right: 14,
                    left: 0,
                    bottom: 4,
                  }}
                >
                  <CartesianGrid
                    stroke="#e8eef5"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#64748b', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                    dy={4}
                    padding={{ left: 12, right: 12 }}
                  />
                  <YAxis
                    tick={{ fontSize: 10.5, fill: '#94a3b8' }}
                    axisLine={false}
                    tickLine={false}
                    width={Math.min(failRateAxisWidth, 48)}
                    tickFormatter={(v) => {
                      const n = Number(v)
                      if (n >= 1000) return `${Math.round(n / 1000)}k`
                      return Math.round(n).toLocaleString('ko-KR')
                    }}
                  />
                  <Tooltip
                    contentStyle={{
                      border: '1px solid #dbe3ee',
                      borderRadius: 14,
                      boxShadow: '0 10px 28px rgba(15, 23, 42, 0.08)',
                      fontSize: 12,
                      backgroundColor: 'rgba(255, 255, 255, 0.97)',
                      padding: '10px 12px',
                    }}
                    cursor={{ stroke: 'rgba(212, 85, 85, 0.28)', strokeWidth: 1 }}
                    formatter={(v: unknown) => [formatPpm(Number(v)), '부적합률']}
                    labelFormatter={(label) => `날짜 ${label}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="failRate"
                    name="부적합률"
                    stroke="#d45555"
                    strokeWidth={2.4}
                    dot={{
                      r: 3.4,
                      fill: '#fff',
                      stroke: '#d45555',
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: '#fff',
                      stroke: '#d45555',
                      strokeWidth: 2.5,
                    }}
                  >
                    {showValueLabels && (
                      <LabelList
                        dataKey="failRate"
                        position="top"
                        offset={10}
                        fill="#b33f3f"
                        fontSize={10}
                        fontWeight={700}
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
          </div>
        </Panel>
      </ResponsiveGrid>

      <Panel
        title="선택 품번별 지표"
        description="품번을 클릭하면 해당 기간·검사자 검사 실적 기준 품번 상세로 이동합니다."
      >
        <div className="overflow-x-auto">
          <table className="detail-table min-w-[560px] w-full text-left text-sm">
            <thead>
              <tr>
                <th>품번</th>
                <th>검수량</th>
                <th>부적합수량</th>
                <th>부적합률</th>
                <th>UPH</th>
              </tr>
            </thead>
            <tbody>
              {selectedStats.map((p) => (
                <tr key={p.product}>
                  <td className="font-medium">
                    <Link
                      to={productDetailHref(p.product)}
                      className="text-accent hover:underline"
                    >
                      {p.product}
                    </Link>
                  </td>
                  <td className="num">{p.qty.toLocaleString()}</td>
                  <td className="num">{p.fail.toLocaleString()}</td>
                  <td className="num">{formatPpm(p.failRate)}</td>
                  <td className="num font-semibold">{p.uph}</td>
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

      <ResponsiveGrid variant="split">
        <Panel title="담당 금형">
          {molds.length ? (
            <div className="detail-tags detail-tags-wrap">
              {molds.slice(0, 12).map((m) => (
                <span key={m} className="detail-tag detail-tag-id">
                  {m}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted">데이터 없음</p>
          )}
        </Panel>
        <Panel title="주요 불량 유형">
          {defects.length ? (
            <div className="detail-defect-chips">
              {defects.map(([defectName, count], index) => {
                const color =
                  DEFECT_TYPE_COLORS[index % DEFECT_TYPE_COLORS.length]
                return (
                  <span
                    key={defectName}
                    className="detail-defect-chip"
                    style={{ ['--defect-chip' as string]: color }}
                  >
                    <span className="detail-defect-chip-name">{defectName}</span>
                    <span className="detail-defect-chip-count">
                      {count.toLocaleString()}
                    </span>
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">데이터 없음</p>
          )}
        </Panel>
      </ResponsiveGrid>
    </div>
  )
}
