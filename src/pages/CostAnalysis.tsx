import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import {
  SplitTop10Panel,
  type SplitTop10RowBase,
} from '../components/charts/SplitTop10Panel'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import { toEntityId } from '../lib/entityId'
import { buildProductDetailHref } from '../lib/productDetailNav'
import { formatPpm, formatWon, roundWon } from '../lib/format'
import { getProductPhotoUrlMap } from '../lib/productPhotos'
import { isCloudSyncEnabled } from '../lib/supabase'
import { analysisGroupColor } from '../lib/groups'
import type { ProductRow } from '../types'

type Dim = 'product' | 'defect' | 'mold' | 'equipment' | 'inspector' | 'group'

type ProductTypeTab = 'all' | 'grommet' | 'seal'

const VIEW_STATE_KEY = 'cost-analysis'
const TOP10_ALL_TAB_BAR_COLOR = '#60a5fa'

const productTypeTabs: { id: ProductTypeTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'grommet', label: 'GROMMET' },
  { id: 'seal', label: 'SEAL' },
]

type CostAnalysisViewState = {
  dim: Dim
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
  topType: ProductTypeTab
}

const defaultViewState: CostAnalysisViewState = {
  dim: 'product',
  query: '',
  sortKey: 'scrapCost',
  asc: false,
  page: 1,
  pageSize: 10,
  topType: 'all',
}

const DIMS: Dim[] = [
  'product',
  'defect',
  'mold',
  'equipment',
  'inspector',
  'group',
]

function readViewState(): CostAnalysisViewState {
  const stored = loadPageViewState<Partial<CostAnalysisViewState>>(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  const topType =
    stored.topType === 'grommet' || stored.topType === 'seal' || stored.topType === 'all'
      ? stored.topType
      : defaultViewState.topType
  return {
    dim:
      typeof stored.dim === 'string' && DIMS.includes(stored.dim)
        ? stored.dim
        : defaultViewState.dim,
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey:
      typeof stored.sortKey === 'string' ? stored.sortKey : defaultViewState.sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topType,
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

function formatCostValue(n: number) {
  return roundWon(n).toLocaleString('ko-KR')
}

type CostTop10Row = SplitTop10RowBase & { product: ProductRow }

export function CostAnalysis() {
  const { analytics } = useData()
  const [view, setView] = useState<CostAnalysisViewState>(readViewState)
  const { dim, query, sortKey, asc, page, pageSize, topType } = view
  /** TOP10은 분석그룹 무관 · 선택 기간 전체 집계 */
  const topProducts = analytics.dashboardTop10Products

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<CostAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const typeTabCounts = useMemo(() => {
    const counts: Record<ProductTypeTab, number> = {
      all: 0,
      grommet: 0,
      seal: 0,
    }
    for (const p of topProducts) {
      if (p.scrapCost <= 0) continue
      counts.all += 1
      if (matchesProductTypeTab(p.type, 'grommet')) counts.grommet += 1
      if (matchesProductTypeTab(p.type, 'seal')) counts.seal += 1
    }
    return counts
  }, [topProducts])

  const topRows = useMemo((): CostTop10Row[] => {
    const filtered = topProducts.filter(
      (p) => p.scrapCost > 0 && matchesProductTypeTab(p.type, topType),
    )
    const total = filtered.reduce((s, p) => s + p.scrapCost, 0)
    return [...filtered]
      .sort((a, b) => b.scrapCost - a.scrapCost)
      .slice(0, 10)
      .map((p, idx) => ({
        id: p.id,
        name: p.name,
        rank: idx + 1,
        value: p.scrapCost,
        sharePercent: total > 0 ? (p.scrapCost / total) * 100 : 0,
        href: buildProductDetailHref(p.id, 'cost'),
        product: p,
      }))
  }, [topProducts, topType])

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

  const source = useMemo(() => {
    if (dim === 'product')
      return analytics.products.map((p) => ({
        name: p.name,
        qty: p.qty,
        fail: p.fail,
        failRate: p.failRate,
        scrapCost: p.scrapCost,
        changeRate: p.changeRate,
      }))
    if (dim === 'mold')
      return analytics.molds.map((m) => ({
        name: m.moldNo,
        qty: m.qty,
        fail: m.fail,
        failRate: m.failRate,
        scrapCost: m.scrapCost,
        changeRate: m.changeRate,
      }))
    if (dim === 'equipment')
      return analytics.equipment.map((e) => ({
        name: e.name,
        qty: e.qty,
        fail: e.fail,
        failRate: e.failRate,
        scrapCost: e.scrapCost,
        changeRate: e.changeRate,
      }))
    if (dim === 'inspector')
      return analytics.inspectors.map((i) => ({
        name: i.name,
        qty: i.qty,
        fail: i.fail,
        failRate: i.failRate,
        scrapCost: i.scrapCost,
        changeRate: 0,
      }))
    if (dim === 'group')
      return analytics.groupSummaries.map((g) => ({
        name: g.label,
        qty: g.qty,
        fail: g.fail,
        failRate: g.failRate,
        scrapCost: g.scrapCost,
        changeRate: 0,
      }))
    return analytics.defectTypes.map((d) => ({
      name: d.name,
      qty: d.count,
      fail: d.count,
      failRate: d.share,
      scrapCost: analytics.costByDefect.find((c) => c.name === d.name)?.value ?? 0,
      changeRate: 0,
    }))
  }, [analytics, dim])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = source.filter((r) => !q || r.name.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof typeof a]
      const bv = b[sortKey as keyof typeof b]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [source, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const tabLabel = productTypeTabs.find((t) => t.id === topType)?.label ?? '전체'
  const barColor = top10TabBarColor(topType)

  return (
    <div className="space-y-5">
      <PageHeader title="비용 분석" />

      <SplitTop10Panel
        title="품번 폐기비용 TOP 10"
        description={`선택 기간 · 전체 분석그룹 · ${tabLabel} · 폐기비용 상위 10개 품번`}
        toolbar={
          <div
            className="qty-type-tabs mb-3.5"
            role="tablist"
            aria-label="폐기비용 TOP 제품유형"
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
                <span className="qty-type-tab-count">{typeTabCounts[tab.id]}</span>
              </button>
            ))}
          </div>
        }
        rows={topRows}
        barColor={barColor}
        photoUrls={photoUrls}
        xAxisAngle={0}
        valueLabel="폐기비용"
        formatValue={(n) => formatCostValue(n)}
        emptyMessage="선택한 제품유형에 해당하는 폐기비용 데이터가 없습니다."
        detailKicker="선택 품번"
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
            label: '폐기비용',
            value: (row) => formatWon(row.product.scrapCost),
          },
          {
            label: '비중',
            value: (row) => `${Math.round(row.sharePercent * 10) / 10}%`,
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
        placeholder="대상명 검색"
        sortKey={sortKey}
        sortKeys={[
          { id: 'name', label: '대상명' },
          { id: 'scrapCost', label: '폐기비용' },
          { id: 'qty', label: '검수량' },
          { id: 'fail', label: '부적합수량' },
          { id: 'failRate', label: '부적합률' },
          { id: 'changeRate', label: '증가율' },
        ]}
        asc={asc}
        onSortKey={(key) => patchView({ sortKey: key })}
        onToggleDir={() => patchView({ asc: !asc })}
        pageSize={pageSize}
        onPageSize={(size) => {
          patchView({ pageSize: size, page: 1 })
        }}
        onDownload={() =>
          downloadExcel(
            '비용분석.xlsx',
            rows.map((r) => ({
              대상: r.name,
              검수량: r.qty,
              부적합수량: r.fail,
              부적합률: r.failRate,
              폐기비용: r.scrapCost,
              증가율: r.changeRate,
            })),
          )
        }
        resultTitle="비용 내역"
      >
        <div className="query-result-dim-tabs">
          {(
            [
              ['product', '품번'],
              ['defect', '불량 유형'],
              ['mold', '금형'],
              ['equipment', '설비'],
              ['inspector', '검사자'],
              ['group', '분석 그룹'],
            ] as [Dim, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                patchView({ dim: id, page: 1 })
              }}
              className="query-result-dim-tab"
              data-active={dim === id}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">대상</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">
                  {dim === 'defect' ? '점유율' : '부적합률'}
                </th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.name} className="border-b border-line/70">
                  <td className="px-2 py-3 font-medium">
                    {dim === 'product' ? (
                      <Link
                        to={buildProductDetailHref(
                          toEntityId('prd', row.name),
                          'cost',
                        )}
                        className="text-accent hover:underline"
                      >
                        {row.name}
                      </Link>
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="num px-2 py-3">{formatWon(row.scrapCost)}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">
                    {dim === 'defect' ? `${row.failRate}%` : formatPpm(row.failRate)}
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
    </div>
  )
}
