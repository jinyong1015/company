import { Link, useParams, useSearchParams } from 'react-router-dom'
import { AlertTriangle, Coins, HardHat, Package, PackageX } from 'lucide-react'
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
import { failRatePpm, formatPpmAsPercent, formatWon } from '../lib/format'
import type { ProductBreakdown } from '../types'

function toDateInput(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function WorkerDetailBackNav({
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
      to={toProduct ? productHref! : '/workers'}
      label={toProduct ? productName! : '성형 작업자 분석'}
      ariaLabel="성형 작업자 상세 돌아가기"
      Icon={toProduct ? Package : HardHat}
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

export function WorkerDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { analytics } = useData()
  const { filters, setCustomDateRange, replaceFilters } = useFilters()
  const name = fromEntityId(id, 'wrk')
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

  const worker =
    analytics.workers.find((w) => w.id === id || w.id === toEntityId('wrk', name) || w.name === name) ??
    null

  const scoped = useMemo(
    () => filterRecords(sourceRecords, effectiveFilters, true).filter((r) => r.worker === name),
    [sourceRecords, effectiveFilters, name],
  )

  const productOptions = useMemo(() => {
    if (scoped.length) return buildProductStats(scoped)
    return (worker?.products ?? []).map((p) => ({
      product: p.product,
      qty: p.qty,
      fail: p.fail,
      failRate: p.failRate,
      scrapCost: p.scrapCost,
      hours: p.hours,
      minutes: p.minutes,
      uph: p.uph,
      mainDefect: p.mainDefect,
    }))
  }, [scoped, worker])

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
              worker: name,
              workerId: id ?? toEntityId('wrk', name),
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
        <WorkerDetailBackNav {...backNavProps} />
        <PageHeader title="성형 작업자 상세" description="대상을 찾을 수 없습니다." />
      </div>
    )
  }

  if (usingSnapshot && snapshotStatus === 'loading') {
    return (
      <div className="space-y-5">
        <WorkerDetailBackNav {...backNavProps} />
        {snapshotBanner}
      </div>
    )
  }

  if (!worker && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <WorkerDetailBackNav {...backNavProps} />
        {snapshotBanner}
        <DetailHero
          eyebrow="성형 작업자 상세"
          title={name}
          description="선택한 기간/분석 그룹에 이 성형 작업자의 DATA가 없습니다."
        />
        <Panel>
          <p className="text-sm text-muted">
            {usingSnapshot
              ? '스냅샷에 저장된 원본 행 기준으로 해당 작업자 DATA가 없습니다.'
              : '기간이나 분석 그룹을 바꿔 다시 확인해 주세요.'}
          </p>
        </Panel>
      </div>
    )
  }

  const row = worker ?? {
    id: toEntityId('wrk', name),
    name,
    count: scoped.length,
    qty: scoped.reduce((s, r) => s + r.qty, 0),
    pass: scoped.reduce((s, r) => s + r.pass, 0),
    fail: scoped.reduce((s, r) => s + r.fail, 0),
    failRate: 0,
    hours: scoped.reduce((s, r) => s + r.hours, 0),
    minutes: 0,
    uph: 0,
    scrapCost: scoped.reduce((s, r) => s + r.scrapCost, 0),
    productCount: productOptions.length,
    products: [],
  }

  const qty = filtered.reduce((s, r) => s + r.qty, 0)
  const fail = filtered.reduce((s, r) => s + r.fail, 0)
  const scrapCost = filtered.reduce((s, r) => s + r.scrapCost, 0)
  const failRate = failRatePpm(fail, qty)
  const grainLabel = trendGrain === 'month' ? '월별' : '일별'
  // 일별: qty가 0인 날짜는 그래프에서 제외
  const chartData = trendGrain === 'day' ? byDate.filter((d) => d.qty > 0) : byDate
  // 일별(이번달·지난달·2개월 미만): 전체/품번 선택 모두, 실제 포인트 15개 초과 시 합계 라벨 숨김
  const showValueLabels = trendGrain === 'month' || chartData.length <= 15

  const qtyAxisWidth = Math.max(
    48,
    Math.min(88, String(Math.max(0, ...chartData.map((d) => d.qty), 0).toLocaleString('ko-KR')).length * 8 + 14),
  )
  const failRateAxisWidth = Math.max(
    52,
    Math.min(
      96,
      (() => {
        const max = Math.max(0, ...chartData.map((d) => d.failRate), 0)
        const pct = max / 10_000
        const sample = pct >= 10 ? pct.toFixed(0) : pct.toFixed(2)
        return `${sample}%`.length * 8 + 18
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

  const scopeLabel = hasSelection ? `품번 ${activeProduct} 기준` : '전체 품번 기준'
  const totalQty = productOptions.reduce((s, p) => s + p.qty, 0)
  const period = resolvePeriodRange(effectiveFilters)
  const periodStart = toDateInput(period.start)
  const periodEnd = toDateInput(period.end)
  const workerId = row.id

  function productDetailHref(productName: string) {
    if (urlDateRange || searchParams.get('from') === 'weekly-report') {
      return buildProductDetailReturnHref(
        toEntityId('prd', productName),
        searchParams,
        {
          worker: name,
          workerId,
        },
      )
    }
    return buildProductDetailHref(toEntityId('prd', productName), 'workers', {
      startDate: periodStart,
      endDate: periodEnd,
      worker: name,
      workerId,
    })
  }

  return (
    <div className="space-y-5">
      <WorkerDetailBackNav {...backNavProps} />
      {snapshotBanner}
      <DetailHero
        eyebrow="성형 작업자 상세"
        title={row.name}
        description={`성형 작업자 · 선택한 기간/분석 그룹 기준 · ${scopeLabel}`}
        chips={['성형 작업자', scopeLabel]}
      />

      <DetailProductPicker
        productQuery={productQuery}
        onQueryChange={setProductQuery}
        selectId="worker-product-select"
        activeProduct={activeProduct}
        onSelectProduct={setSelectedProduct}
        productOptions={productOptions}
        visibleProducts={visibleProducts}
        totalQty={totalQty}
        qtyLabel="실적"
        renderMeta={(p) => (
          <span className="detail-pick-meta">
            <span>
              실적 <strong className="num">{p.qty.toLocaleString()}</strong>
            </span>
            <span>
              불량률{' '}
              <strong className="num">{formatPpmAsPercent(p.failRate ?? 0)}</strong>
            </span>
          </span>
        )}
      />

      <DetailKpiStrip
        items={[
          { label: '실적수량', value: qty.toLocaleString(), tone: 'accent', icon: Package },
          {
            label: '부적합수량',
            value: fail.toLocaleString(),
            tone: fail > 0 ? 'danger' : 'default',
            icon: PackageX,
          },
          {
            label: '불량률(%)',
            value: formatPpmAsPercent(failRate),
            tone: failRate > 0 ? 'danger' : 'default',
            icon: AlertTriangle,
          },
          { label: '폐기비용', value: formatWon(scrapCost), tone: 'warn', icon: Coins },
        ]}
      />

      <ResponsiveGrid variant="cards">
        <Panel title={`기간별 실적수량 (${grainLabel})`}>
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
        <Panel title={`기간별 불량률 (${grainLabel})`}>
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
                  tickFormatter={(v) => formatPpmAsPercent(Number(v))}
                />
                <Tooltip
                  contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
                  formatter={(v: unknown) => [formatPpmAsPercent(Number(v)), '불량률(%)']}
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
                        return formatPpmAsPercent(n)
                      }}
                    />
                  )}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </ResponsiveGrid>

      <Panel
        title="선택 품번별 지표"
        description="품번을 클릭하면 해당 기간·성형 작업자 실적 기준 품번 상세로 이동합니다."
      >
        <div className="overflow-x-auto">
          <table className="detail-table min-w-[480px] w-full text-left text-sm">
            <thead>
              <tr>
                <th>품번</th>
                <th>실적수량</th>
                <th>부적합수량</th>
                <th>불량률(%)</th>
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
                  <td className="num font-semibold">
                    {formatPpmAsPercent(p.failRate)}
                  </td>
                </tr>
              ))}
              {!selectedStats.length && (
                <tr>
                  <td colSpan={4} className="px-2 py-6 text-center text-muted">
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
