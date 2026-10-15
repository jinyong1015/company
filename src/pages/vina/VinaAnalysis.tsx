import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SplitTop10Panel,
  type SplitTop10RowBase,
} from '../../components/charts/SplitTop10Panel'
import { PageHeader } from '../../components/common/PageHeader'
import { MonthlyTrendSection } from '../../components/weekly-report/MonthlyTrendSection'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { useFilters } from '../../context/FilterContext'
import { filterRecords } from '../../lib/analyze'
import {
  ANALYSIS_GROUP_TOTAL_LINE_COLOR,
  analysisGroupColor,
  normalizeProductType,
} from '../../lib/groups'
import { failRatePpm, formatPpm, formatWon } from '../../lib/format'
import { buildProductDetailHref } from '../../lib/productDetailNav'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
import {
  VINA_MONTHLY_ORGS,
  buildVinaMonthlyReportView,
  monthKeyToDateRange,
} from '../../lib/weeklyReport'
import type {
  GroupSummary,
  ProductRow,
  WeeklyReportMetric,
} from '../../types'

const LINE_COLOR = ANALYSIS_GROUP_TOTAL_LINE_COLOR

const productSortOptions = [
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'qty', label: '검수량' },
  { id: 'scrapCost', label: '폐기비용' },
] as const

type ProductSortId = (typeof productSortOptions)[number]['id']
type ProductTypeTab = 'all' | 'grommet' | 'seal'

const productTypeTabs: { id: ProductTypeTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'grommet', label: 'GROMMET' },
  { id: 'seal', label: 'SEAL' },
]

const TOP10_ALL_TAB_BAR_COLOR = '#60a5fa'

function qtySharePct(qty: number, totalQty: number) {
  if (totalQty <= 0 || qty <= 0) return 0
  return Math.round((qty / totalQty) * 1000) / 10
}

function matchesProductTypeTab(type: string, tab: ProductTypeTab): boolean {
  if (tab === 'all') return true
  const t = (type || '').toLowerCase()
  if (tab === 'seal') {
    return t.includes('seal') || t.includes('실링') || t.includes('씰')
  }
  return t.includes('grommet') || t.includes('그로멧') || t.includes('유압')
}

function top10TabBarColor(tab: ProductTypeTab): string {
  if (tab === 'seal') return analysisGroupColor('seal')
  if (tab === 'grommet') return analysisGroupColor('hydraulic')
  return TOP10_ALL_TAB_BAR_COLOR
}

function formatProductSortValue(sort: ProductSortId, value: number) {
  if (sort === 'failRate') return formatPpm(value)
  if (sort === 'scrapCost') return formatWon(value)
  return value.toLocaleString('ko-KR')
}

function vinaTypeColor(typeId: string) {
  if (typeId === 'all') return LINE_COLOR
  const t = typeId.toLowerCase()
  if (t.includes('seal') || t.includes('실링') || t.includes('씰')) {
    return analysisGroupColor('seal')
  }
  if (t.includes('grommet') || t.includes('그로멧') || t.includes('유압')) {
    return analysisGroupColor('hydraulic')
  }
  return '#94a3b8'
}

function VinaGroupComparison({ summaries }: { summaries: GroupSummary[] }) {
  const total = summaries.find((g) => g.id === 'all')
  const subgroups = summaries.filter((g) => g.id !== 'all')
  const totalQty = total?.qty ?? 0
  const maxFailRate = Math.max(0, ...subgroups.map((g) => g.failRate))
  const worstFailIds = new Set(
    subgroups
      .filter((g) => g.failRate > 0 && g.failRate === maxFailRate)
      .map((g) => g.id),
  )

  const sealSummary = subgroups.find((g) =>
    matchesProductTypeTab(g.label, 'seal'),
  )
  const grommetSummary = subgroups.find((g) =>
    matchesProductTypeTab(g.label, 'grommet'),
  )
  const sealQty = sealSummary?.qty ?? 0
  const grommetQty = grommetSummary?.qty ?? 0
  const sealShare = qtySharePct(sealQty, totalQty)
  const grommetShare = qtySharePct(grommetQty, totalQty)

  return (
    <div className="group-compare">
      <div className="group-compare-share">
        <div className="group-compare-share-head">
          <p className="group-compare-share-title">검수량 비중</p>
          <p className="group-compare-share-total num">
            합계 {totalQty.toLocaleString('ko-KR')}
          </p>
        </div>
        <div
          className="group-compare-share-track"
          role="img"
          aria-label="VINA 제품유형별 검수량 비중"
        >
          {sealShare > 0 && sealSummary ? (
            <div
              className="group-compare-share-seg"
              style={{
                width: `${sealShare}%`,
                backgroundColor: vinaTypeColor(sealSummary.id),
              }}
              title={`${sealSummary.label} ${sealShare}%`}
            >
              {sealShare >= 12 ? (
                <span className="group-compare-share-seg-label">
                  SEAL {sealShare}%
                </span>
              ) : null}
            </div>
          ) : null}
          {grommetShare > 0 && grommetSummary ? (
            <div
              className="group-compare-share-seg"
              style={{
                width: `${grommetShare}%`,
                backgroundColor: vinaTypeColor(grommetSummary.id),
              }}
              title={`${grommetSummary.label} ${grommetShare}%`}
            >
              {grommetShare >= 12 ? (
                <span className="group-compare-share-seg-label">
                  GROMMET {grommetShare}%
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="group-compare-grid" aria-label="VINA 분석 그룹">
        {summaries.map((g) => {
          const isTotal = g.id === 'all'
          const color = vinaTypeColor(g.id)
          const share = isTotal ? 100 : qtySharePct(g.qty, totalQty)
          const failBarPct =
            maxFailRate > 0
              ? Math.min(100, (g.failRate / maxFailRate) * 100)
              : 0
          const isWorst = worstFailIds.has(g.id)

          return (
            <div
              key={g.id}
              className="group-compare-card group-compare-card--static"
              data-total={isTotal ? 'true' : undefined}
              data-worst={isWorst ? 'true' : undefined}
              style={{ ['--group-color' as string]: color }}
            >
              <div className="group-compare-card-head">
                <span className="group-compare-swatch" aria-hidden />
                <div className="group-compare-card-title">
                  <strong>{g.label}</strong>
                  <span className="group-compare-card-sub">
                    {isTotal ? 'VINA 전체' : `검수 비중 ${share}%`}
                  </span>
                </div>
                <div className="group-compare-badges">
                  {isWorst ? (
                    <span className="group-compare-badge group-compare-badge--worst">
                      부적합률↑
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="group-compare-metrics">
                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">검수량</span>
                  <strong className="group-compare-metric-value num">
                    {g.qty.toLocaleString('ko-KR')}
                  </strong>
                  <div
                    className={`group-compare-bar${isTotal ? ' group-compare-bar--ghost' : ''}`}
                    aria-hidden
                  >
                    <span
                      style={{
                        width: isTotal ? '100%' : `${share}%`,
                        background: color,
                      }}
                    />
                  </div>
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">부적합률</span>
                  <strong className="group-compare-metric-value num">
                    {formatPpm(g.failRate)}
                  </strong>
                  <div className="group-compare-bar" aria-hidden>
                    <span
                      style={{ width: `${failBarPct}%`, background: color }}
                    />
                  </div>
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">부적합수량</span>
                  <strong className="group-compare-metric-value num">
                    {g.fail.toLocaleString('ko-KR')}
                  </strong>
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">폐기비용</span>
                  <strong className="group-compare-metric-value num">
                    {formatWon(g.scrapCost)}
                  </strong>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type ProductTop10Row = SplitTop10RowBase & { product: ProductRow }

function VinaProductTop10({
  products,
  sort,
  onSortChange,
  groupLabel,
}: {
  products: ProductRow[]
  sort: ProductSortId
  onSortChange: (sort: ProductSortId) => void
  groupLabel: string
}) {
  const [typeTab, setTypeTab] = useState<ProductTypeTab>('all')

  const filteredProducts = useMemo(
    () => products.filter((p) => matchesProductTypeTab(p.type, typeTab)),
    [products, typeTab],
  )

  const typeTabCounts = useMemo(() => {
    const counts: Record<ProductTypeTab, number> = {
      all: products.length,
      grommet: 0,
      seal: 0,
    }
    for (const p of products) {
      if (matchesProductTypeTab(p.type, 'grommet')) counts.grommet += 1
      if (matchesProductTypeTab(p.type, 'seal')) counts.seal += 1
    }
    return counts
  }, [products])

  const { rows, sortLabel, tabLabel } = useMemo(() => {
    const ranked = [...filteredProducts]
      .sort((a, b) => b[sort] - a[sort])
      .slice(0, 10)
    const total = filteredProducts.reduce((s, p) => s + p[sort], 0)
    const mapped: ProductTop10Row[] = ranked.map((p, idx) => ({
      product: p,
      id: p.id,
      name: p.name,
      rank: idx + 1,
      value: p[sort],
      sharePercent: total > 0 ? (p[sort] / total) * 100 : 0,
      href: buildProductDetailHref(p.id, 'vina-products', {
        vina: true,
      }),
    }))
    return {
      sortLabel: productSortOptions.find((o) => o.id === sort)?.label ?? '',
      tabLabel: productTypeTabs.find((t) => t.id === typeTab)?.label ?? '전체',
      rows: mapped,
    }
  }, [filteredProducts, sort, typeTab])

  // 대시보드와 동일: 품번명(product_key) 기준 기존 사진 공유
  const productKeys = useMemo(
    () => [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [rows],
  )
  const productKeysSignature = productKeys.join('\u0001')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isCloudSyncEnabled() || !productKeys.length) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    void getProductPhotoUrlMap(productKeys).then((map) => {
      if (!cancelled) setPhotoUrls(map)
    })
    return () => {
      cancelled = true
    }
    // productKeysSignature tracks productKeys content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature])

  return (
    <SplitTop10Panel
      title="품번 기준 TOP10"
      description={`VINA · 선택 기간 · ${groupLabel} · ${tabLabel} · ${sortLabel} 상위 10개 품번`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {productSortOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSortChange(opt.id)}
              className="filter-pill"
              data-active={sort === opt.id ? 'true' : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
      toolbar={
        <div
          className="qty-type-tabs mb-3.5"
          role="tablist"
          aria-label="VINA 품번 TOP10 제품유형"
        >
          {productTypeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={typeTab === tab.id}
              className="qty-type-tab"
              data-active={typeTab === tab.id}
              onClick={() => setTypeTab(tab.id)}
            >
              {tab.label}
              <span className="qty-type-tab-count">{typeTabCounts[tab.id]}</span>
            </button>
          ))}
        </div>
      }
      rows={rows}
      barColor={top10TabBarColor(typeTab)}
      photoUrls={photoUrls}
      xAxisAngle={0}
      valueLabel={sortLabel}
      formatValue={(n) => formatProductSortValue(sort, n)}
      emptyMessage="선택한 제품유형에 해당하는 VINA 품번이 없습니다."
      detailKicker="VINA 품번"
      detailMeta={(row) =>
        `${row.product.type || '유형 미지정'}${
          row.product.mainDefect ? ` · 주불량 ${row.product.mainDefect}` : ''
        }`
      }
      rankMeta={(row) =>
        `${row.product.type || '유형 미지정'}${
          row.product.mainDefect ? ` · ${row.product.mainDefect}` : ''
        }`
      }
      metrics={[
        {
          label: '부적합수량',
          value: (row) => row.product.fail.toLocaleString('ko-KR'),
        },
        {
          label: '부적합률',
          value: (row) => formatPpm(row.product.failRate),
        },
        {
          label: '검수량',
          value: (row) => row.product.qty.toLocaleString('ko-KR'),
        },
        {
          label: '폐기비용',
          value: (row) => formatWon(row.product.scrapCost),
        },
      ]}
    />
  )
}

function buildVinaGroupSummaries(
  records: ReturnType<typeof filterRecords>,
): GroupSummary[] {
  const byType = new Map<string, typeof records>()
  for (const r of records) {
    const type =
      normalizeProductType(r.productType) || r.productType || '미지정'
    const list = byType.get(type) ?? []
    list.push(r)
    byType.set(type, list)
  }

  const typeOrder = (a: string, b: string) => {
    const rank = (t: string) => {
      if (matchesProductTypeTab(t, 'seal')) return 0
      if (matchesProductTypeTab(t, 'grommet')) return 1
      return 2
    }
    const d = rank(a) - rank(b)
    return d !== 0 ? d : a.localeCompare(b, 'ko')
  }

  const types = [...byType.keys()].sort(typeOrder)
  const allQty = records.reduce((s, r) => s + r.qty, 0)
  const allFail = records.reduce((s, r) => s + r.fail, 0)
  const allCost = records.reduce((s, r) => s + r.scrapCost, 0)

  const summaries: GroupSummary[] = [
    {
      id: 'all',
      label: '전체',
      qty: allQty,
      fail: allFail,
      failRate: failRatePpm(allFail, allQty),
      scrapCost: Math.round(allCost),
    },
  ]

  for (const type of types) {
    const list = byType.get(type) ?? []
    const qty = list.reduce((s, r) => s + r.qty, 0)
    const fail = list.reduce((s, r) => s + r.fail, 0)
    const scrapCost = Math.round(list.reduce((s, r) => s + r.scrapCost, 0))
    summaries.push({
      id: type,
      label: type,
      qty,
      fail,
      failRate: failRatePpm(fail, qty),
      scrapCost,
    })
  }

  return summaries
}

export function VinaAnalysis() {
  const { analytics, records, hasUploadedData, loading } = useVinaData()
  const { filters, setCustomDateRange } = useFilters()
  const { dashboardTop10Products } = analytics
  const [productSort, setProductSort] = useState<ProductSortId>('fail')
  const [monthlyMetric, setMonthlyMetric] =
    useState<WeeklyReportMetric>('failRate')

  const scoped = useMemo(
    () =>
      filterRecords(records, filters, true, { ignoreAnalysisGroup: true }),
    [records, filters],
  )

  /** 주간업무 보고와 동일: 전체 VINA 데이터 기준 최근 12개월 */
  const monthlyView = useMemo(
    () => buildVinaMonthlyReportView(records, monthlyMetric),
    [records, monthlyMetric],
  )

  const selectedMonthKey = useMemo(() => {
    if (filters.period !== 'custom') return undefined
    const start = filters.startDate?.trim()
    const end = filters.endDate?.trim()
    if (!start || !end) return undefined
    const sm = start.slice(0, 7)
    const em = end.slice(0, 7)
    return sm === em ? sm : undefined
  }, [filters.period, filters.startDate, filters.endDate])

  const handleMonthSelect = useCallback(
    (monthKey: string) => {
      const range = monthKeyToDateRange(monthKey)
      if (!range) return
      setCustomDateRange(range.startDate, range.endDate)
    },
    [setCustomDateRange],
  )

  const groupSummaries = useMemo(
    () => buildVinaGroupSummaries(scoped),
    [scoped],
  )

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 분석" />
      <VinaNotice />

      {loading ? (
        <p className="text-sm text-muted">VINA 데이터 불러오는 중…</p>
      ) : !hasUploadedData ? (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="text-sm font-semibold text-ink">VINA 데이터가 없습니다</p>
          <p className="mt-1 text-sm text-muted">
            「VINA 데이터 업로드」에서 엑셀을 올려 주세요. 기존 「데이터 업로드」와는
            별도입니다.
          </p>
          <Link
            to="/vina/manage"
            className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            VINA 데이터 업로드
          </Link>
        </div>
      ) : (
        <>
          <section className="card dash-linked min-w-0">
            <div className="dash-linked-section">
              <header className="dash-linked-head">
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-ink">
                    VINA 분석 그룹 비교
                  </h2>
                  <p className="mt-0.5 text-sm text-muted">
                    제품유형(종류) 기준 · 기존 검사 데이터와 분리
                  </p>
                </div>
              </header>
              <VinaGroupComparison summaries={groupSummaries} />
            </div>
          </section>

          <MonthlyTrendSection
            view={monthlyView}
            metric={monthlyMetric}
            onMetricChange={setMonthlyMetric}
            selectedMonthKey={selectedMonthKey}
            onMonthSelect={handleMonthSelect}
            title="월별 현황"
            descriptionPrefix="VINA 데이터 · 제품유형 기준 · "
            orgs={VINA_MONTHLY_ORGS}
          />

          <VinaProductTop10
            products={dashboardTop10Products}
            sort={productSort}
            onSortChange={setProductSort}
            groupLabel="전체"
          />
        </>
      )}
    </div>
  )
}
