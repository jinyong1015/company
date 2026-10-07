import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  SplitTop10Panel,
  type SplitTop10RowBase,
} from '../../components/charts/SplitTop10Panel'
import { PageHeader } from '../../components/common/PageHeader'
import { SortSearchBar } from '../../components/common/SortSearchBar'
import { Pager } from '../../components/common/Pager'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useFilters } from '../../context/FilterContext'
import { useVinaData } from '../../context/VinaDataContext'
import { filterRecords } from '../../lib/analyze'
import { downloadExcel } from '../../lib/download'
import { toEntityId } from '../../lib/entityId'
import { failRatePpm, formatPpm, formatWon, roundWon } from '../../lib/format'
import { analysisGroupColor, normalizeProductType } from '../../lib/groups'
import { itemMatchKey, preferDisplayItem } from '../../lib/itemMatchKey'
import {
  buildProductDetailHref,
  periodOptionsFromFilters,
} from '../../lib/productDetailNav'
import { loadPageViewState, savePageViewState } from '../../lib/pageViewState'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
import type { InspectionRecord } from '../../types'

const VIEW_STATE_KEY = 'vina-cost-analysis'
const TOP10_ALL_TAB_BAR_COLOR = '#60a5fa'

type ProductTypeTab = 'all' | 'grommet' | 'seal'
type CostSortKey = 'name' | 'inspectCost' | 'scrapCost' | 'qty' | 'fail' | 'failRate'

type VinaCostViewState = {
  query: string
  sortKey: CostSortKey
  asc: boolean
  page: number
  pageSize: number
  topType: ProductTypeTab
  topMetric: 'scrapCost' | 'inspectCost'
}

const defaultViewState: VinaCostViewState = {
  query: '',
  sortKey: 'scrapCost',
  asc: false,
  page: 1,
  pageSize: 10,
  topType: 'all',
  topMetric: 'scrapCost',
}

const productTypeTabs: { id: ProductTypeTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'grommet', label: 'GROMMET' },
  { id: 'seal', label: 'SEAL' },
]

const SORT_KEYS: { id: CostSortKey; label: string }[] = [
  { id: 'name', label: '품번' },
  { id: 'inspectCost', label: '검사금액' },
  { id: 'scrapCost', label: '폐기금액' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
]

type ProductCostRow = {
  id: string
  name: string
  type: string
  qty: number
  fail: number
  failRate: number
  inspectCost: number
  scrapCost: number
  mainDefect: string
}

type CostTop10Row = SplitTop10RowBase & { product: ProductCostRow }

function readViewState(): VinaCostViewState {
  const stored = loadPageViewState<Partial<VinaCostViewState>>(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  const topType =
    stored.topType === 'grommet' || stored.topType === 'seal' || stored.topType === 'all'
      ? stored.topType
      : defaultViewState.topType
  const topMetric =
    stored.topMetric === 'inspectCost' || stored.topMetric === 'scrapCost'
      ? stored.topMetric
      : defaultViewState.topMetric
  const sortKey =
    typeof stored.sortKey === 'string' &&
    SORT_KEYS.some((k) => k.id === stored.sortKey)
      ? (stored.sortKey as CostSortKey)
      : defaultViewState.sortKey
  return {
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topType,
    topMetric,
  }
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

function readInspectCost(r: InspectionRecord): number {
  const raw = r.extras?.['검사금액']
  if (raw == null || raw === '') return 0
  const n = Number(String(raw).replace(/[,\s원₩]/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

function formatCostValue(n: number) {
  return roundWon(n).toLocaleString('ko-KR')
}

function aggregateProductCosts(
  records: ReturnType<typeof filterRecords>,
): ProductCostRow[] {
  type Acc = {
    name: string
    type: string
    qty: number
    fail: number
    inspectCost: number
    scrapCost: number
    defectCounts: Map<string, number>
  }
  const map = new Map<string, Acc>()
  for (const r of records) {
    const key = itemMatchKey(r.product) || r.product
    const cur = map.get(key)
    const type = normalizeProductType(r.productType) || r.productType || '미지정'
    if (cur) {
      cur.qty += r.qty
      cur.fail += r.fail
      cur.inspectCost += readInspectCost(r)
      cur.scrapCost += r.scrapCost
      cur.name = preferDisplayItem([cur.name, r.product])
      if (r.mainDefect && r.mainDefect !== '-' && r.mainDefect !== '기타') {
        cur.defectCounts.set(
          r.mainDefect,
          (cur.defectCounts.get(r.mainDefect) ?? 0) + r.fail,
        )
      }
    } else {
      const defectCounts = new Map<string, number>()
      if (r.mainDefect && r.mainDefect !== '-' && r.mainDefect !== '기타') {
        defectCounts.set(r.mainDefect, r.fail)
      }
      map.set(key, {
        name: r.product,
        type,
        qty: r.qty,
        fail: r.fail,
        inspectCost: readInspectCost(r),
        scrapCost: r.scrapCost,
        defectCounts,
      })
    }
  }
  return [...map.values()].map((row) => {
    let mainDefect = '기타'
    let best = 0
    for (const [name, count] of row.defectCounts) {
      if (count > best) {
        best = count
        mainDefect = name
      }
    }
    return {
      id: toEntityId('prd', row.name),
      name: row.name,
      type: row.type,
      qty: row.qty,
      fail: row.fail,
      failRate: failRatePpm(row.fail, row.qty),
      inspectCost: Math.round(row.inspectCost),
      scrapCost: Math.round(row.scrapCost),
      mainDefect,
    }
  })
}

export function VinaCostAnalysis() {
  const { records, hasUploadedData } = useVinaData()
  const { filters } = useFilters()
  const periodOpts = useMemo(
    () => periodOptionsFromFilters(filters),
    [filters.period, filters.startDate, filters.endDate],
  )
  const [view, setView] = useState<VinaCostViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize, topType, topMetric } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<VinaCostViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const scopedRecords = useMemo(
    () =>
      filterRecords(records, filters, true, { ignoreAnalysisGroup: true }),
    [records, filters],
  )

  const products = useMemo(
    () => aggregateProductCosts(scopedRecords),
    [scopedRecords],
  )

  const typeTabCounts = useMemo(() => {
    const counts: Record<ProductTypeTab, number> = {
      all: 0,
      grommet: 0,
      seal: 0,
    }
    for (const p of products) {
      if (p[topMetric] <= 0) continue
      counts.all += 1
      if (matchesProductTypeTab(p.type, 'grommet')) counts.grommet += 1
      if (matchesProductTypeTab(p.type, 'seal')) counts.seal += 1
    }
    return counts
  }, [products, topMetric])

  const topRows = useMemo((): CostTop10Row[] => {
    const filtered = products.filter(
      (p) => p[topMetric] > 0 && matchesProductTypeTab(p.type, topType),
    )
    const total = filtered.reduce((s, p) => s + p[topMetric], 0)
    return [...filtered]
      .sort((a, b) => b[topMetric] - a[topMetric])
      .slice(0, 10)
      .map((p, idx) => ({
        id: p.id,
        name: p.name,
        rank: idx + 1,
        value: p[topMetric],
        sharePercent: total > 0 ? (p[topMetric] / total) * 100 : 0,
        href: buildProductDetailHref(p.id, 'vina-cost', {
          ...periodOpts,
          vina: true,
        }),
        product: p,
      }))
  }, [products, topType, topMetric, periodOpts])

  const productKeys = useMemo(
    () => [...new Set(topRows.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [topRows],
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = products.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [products, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const tabLabel = productTypeTabs.find((t) => t.id === topType)?.label ?? '전체'
  const metricLabel = topMetric === 'inspectCost' ? '검사금액' : '폐기금액'
  const barColor = top10TabBarColor(topType)

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 비용 분석" />
      <VinaNotice />

      {!hasUploadedData ? (
        <p className="text-sm text-muted">
          VINA 데이터가 없습니다.{' '}
          <Link to="/vina/manage" className="text-accent hover:underline">
            업로드
          </Link>
          후 이용해 주세요.
        </p>
      ) : (
        <>
          <SplitTop10Panel
            title={`품번 ${metricLabel} TOP 10`}
            description={`VINA · 선택 기간 · ${tabLabel} · ${metricLabel} 상위 10개 품번`}
            actions={
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    ['scrapCost', '폐기금액'],
                    ['inspectCost', '검사금액'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => patchView({ topMetric: id })}
                    className="filter-pill"
                    data-active={topMetric === id ? 'true' : undefined}
                  >
                    {label}
                  </button>
                ))}
              </div>
            }
            toolbar={
              <div
                className="qty-type-tabs mb-3.5"
                role="tablist"
                aria-label="VINA 비용 TOP 제품유형"
              >
                {productTypeTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={topType === tab.id}
                    className="qty-type-tab"
                    data-active={topType === tab.id}
                    onClick={() => patchView({ topType: tab.id })}
                  >
                    {tab.label}
                    <span className="qty-type-tab-count">
                      {typeTabCounts[tab.id]}
                    </span>
                  </button>
                ))}
              </div>
            }
            rows={topRows}
            barColor={barColor}
            photoUrls={photoUrls}
            xAxisAngle={0}
            valueLabel={metricLabel}
            formatValue={(n) => formatCostValue(n)}
            emptyMessage={`선택한 제품유형에 해당하는 ${metricLabel} 데이터가 없습니다.`}
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
                label: '검사금액',
                value: (row) => formatWon(row.product.inspectCost),
              },
              {
                label: '폐기금액',
                value: (row) => formatWon(row.product.scrapCost),
              },
              {
                label: '검수량',
                value: (row) => row.product.qty.toLocaleString('ko-KR'),
              },
              {
                label: '부적합률',
                value: (row) => formatPpm(row.product.failRate),
              },
            ]}
          />

          <SortSearchBar
            query={query}
            onQuery={(v) => {
              patchView({ query: v, page: 1 })
            }}
            placeholder="품번 / 종류 검색"
            sortKey={sortKey}
            sortKeys={SORT_KEYS}
            asc={asc}
            onSortKey={(key) => patchView({ sortKey: key as CostSortKey })}
            onToggleDir={() => patchView({ asc: !asc })}
            pageSize={pageSize}
            onPageSize={(size) => {
              patchView({ pageSize: size, page: 1 })
            }}
            onDownload={() =>
              downloadExcel(
                'VINA_비용분석.xlsx',
                rows.map((r) => ({
                  품번: r.name,
                  종류: r.type,
                  검수량: r.qty,
                  부적합수량: r.fail,
                  부적합률: r.failRate,
                  검사금액: r.inspectCost,
                  폐기금액: r.scrapCost,
                })),
              )
            }
            resultTitle="VINA 품번별 비용 내역"
          >
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-2 py-2 font-medium">품번</th>
                    <th className="px-2 py-2 font-medium">종류</th>
                    <th className="px-2 py-2 font-medium">검사금액</th>
                    <th className="px-2 py-2 font-medium">폐기금액</th>
                    <th className="px-2 py-2 font-medium">검수량</th>
                    <th className="px-2 py-2 font-medium">부적합수량</th>
                    <th className="px-2 py-2 font-medium">부적합률</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-line/70">
                      <td className="px-2 py-3 font-medium">
                        <Link
                          to={buildProductDetailHref(row.id, 'vina-cost', {
                            ...periodOpts,
                            vina: true,
                          })}
                          className="text-accent hover:underline"
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="px-2 py-3 text-muted">{row.type || '—'}</td>
                      <td className="num px-2 py-3">
                        {formatWon(row.inspectCost)}
                      </td>
                      <td className="num px-2 py-3">
                        {formatWon(row.scrapCost)}
                      </td>
                      <td className="num px-2 py-3">
                        {row.qty.toLocaleString()}
                      </td>
                      <td className="num px-2 py-3">
                        {row.fail.toLocaleString()}
                      </td>
                      <td className="num px-2 py-3">
                        {formatPpm(row.failRate)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager
              page={safePage}
              totalPages={totalPages}
              total={rows.length}
              onPage={(p) => patchView({ page: p })}
            />
          </SortSearchBar>
        </>
      )}
    </div>
  )
}
