import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import {
  QtyTop10Chart,
  type QtyTopItem,
  type QtyTopView,
} from '../components/charts/QtyTop10Chart'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import { buildProductDetailHref } from '../lib/productDetailNav'
import type { ProductRow } from '../types'
import { formatPpm, formatWonSuffix } from '../lib/format'

const ALL_TYPES = ''
const VIEW_STATE_KEY = 'product-analysis'

type ProductAnalysisViewState = {
  query: string
  sortKey: string
  asc: boolean
  typeFilter: string
  page: number
  pageSize: number
  topView: QtyTopView
  topType: string
}

const defaultViewState: ProductAnalysisViewState = {
  query: '',
  sortKey: 'qty',
  asc: false,
  typeFilter: ALL_TYPES,
  page: 1,
  pageSize: 10,
  topView: 'rank',
  topType: ALL_TYPES,
}

function readViewState(): ProductAnalysisViewState {
  const stored = loadPageViewState<Partial<ProductAnalysisViewState>>(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  return {
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey: typeof stored.sortKey === 'string' ? stored.sortKey : defaultViewState.sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    typeFilter:
      typeof stored.typeFilter === 'string' ? stored.typeFilter : defaultViewState.typeFilter,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topView: stored.topView === 'bar' ? 'bar' : 'rank',
    topType: typeof stored.topType === 'string' ? stored.topType : defaultViewState.topType,
  }
}

const sortKeys = [
  { id: 'type', label: '제품유형' },
  { id: 'name', label: '품번' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'minutes', label: '검사시간' },
  { id: 'uph', label: 'UPH' },
  { id: 'scrapCost', label: '폐기비용' },
  { id: 'changeRate', label: '증가율' },
]

function toneForType(type: string): 'all' | 'seal' | 'grommet' {
  const t = type.toLowerCase()
  if (t.includes('seal') || t.includes('실링') || t.includes('씰')) return 'seal'
  if (t.includes('grommet') || t.includes('그로멧') || t.includes('유압')) return 'grommet'
  return 'all'
}

export function ProductAnalysis() {
  const { analytics } = useData()
  const [view, setView] = useState<ProductAnalysisViewState>(readViewState)
  const { query, sortKey, asc, typeFilter, page, pageSize, topView, topType } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<ProductAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const typeOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of analytics.products) {
      const type = p.type || '미지정'
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, 'ko'))
  }, [analytics.products])

  const activeType = typeOptions.some((t) => t.type === typeFilter) ? typeFilter : ALL_TYPES
  const activeTopType = typeOptions.some((t) => t.type === topType) ? topType : ALL_TYPES

  const topItems = useMemo((): QtyTopItem[] => {
    const list = activeTopType
      ? analytics.products.filter((p) => (p.type || '미지정') === activeTopType)
      : analytics.products
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      meta: p.type || '미지정',
      qty: p.qty,
      href: buildProductDetailHref(p.id, 'products'),
    }))
  }, [analytics.products, activeTopType])

  const topTabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_TYPES]: analytics.products.filter((p) => p.qty > 0).length,
    }
    for (const t of typeOptions) {
      counts[t.type] = analytics.products.filter(
        (p) => (p.type || '미지정') === t.type && p.qty > 0,
      ).length
    }
    return counts
  }, [analytics.products, typeOptions])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.products.filter((r) => {
      const type = r.type || '미지정'
      if (activeType && type !== activeType) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q)
    })
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof ProductRow]
      const bv = b[sortKey as keyof ProductRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.products, query, sortKey, asc, activeType])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const showTypeColumn = !activeType

  function selectType(type: string) {
    patchView({ typeFilter: type, page: 1 })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="품번 분석"
        description="제품유형 → 품번 → 불량/금형/설비/검사자 순으로 품질을 확인합니다."
      />

      <QtyTop10Chart
        items={topItems}
        title="검사 수량 품번 TOP 10"
        subtitle="품번별 검수량 기준 상위 10개"
        badgeLabel={activeTopType || '전체'}
        tone={toneForType(activeTopType)}
        view={topView}
        onViewChange={(v) => patchView({ topView: v })}
        emptyMessage="선택한 제품유형에 해당하는 검수량 데이터가 없습니다."
        typeTabs={
          <div className="qty-type-tabs" role="tablist" aria-label="검수량 TOP 제품유형">
            <button
              type="button"
              role="tab"
              aria-selected={!activeTopType}
              className="qty-type-tab"
              data-active={!activeTopType}
              onClick={() => patchView({ topType: ALL_TYPES })}
            >
              전체
              <span className="qty-type-tab-count">{topTabCounts[ALL_TYPES] ?? 0}</span>
            </button>
            {typeOptions.map((t) => (
              <button
                key={t.type}
                type="button"
                role="tab"
                aria-selected={activeTopType === t.type}
                className="qty-type-tab"
                data-active={activeTopType === t.type}
                onClick={() => patchView({ topType: t.type })}
              >
                {t.type}
                <span className="qty-type-tab-count">{topTabCounts[t.type] ?? 0}</span>
              </button>
            ))}
          </div>
        }
      />

      <SortSearchBar
        query={query}
        onQuery={(v) => patchView({ query: v, page: 1 })}
        placeholder="품번 검색"
        sortKey={sortKey}
        sortKeys={sortKeys}
        asc={asc}
        onSortKey={(v) => patchView({ sortKey: v })}
        onToggleDir={() => patchView({ asc: !asc })}
        pageSize={pageSize}
        onPageSize={(size) => patchView({ pageSize: size, page: 1 })}
        onDownload={() =>
          downloadExcel(
            '품번분석.xlsx',
            rows.map((r) => ({
              제품유형: r.type,
              품번: r.name,
              검수량: r.qty,
              부적합수량: r.fail,
              부적합률: r.failRate,
              폐기비용: r.scrapCost,
              UPH: r.uph,
            })),
          )
        }
        resultTitle="품번 내역"
      >
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">제품유형</p>
              <p className="text-sm text-ink">
                {activeType ? (
                  <>
                    <span className="font-semibold text-accent">{activeType}</span>
                    <span className="text-muted"> · {rows.length.toLocaleString()}개 품번</span>
                  </>
                ) : (
                  <span className="text-muted">
                    전체 유형 · {analytics.products.length.toLocaleString()}개 품번
                  </span>
                )}
              </p>
            </div>
          </div>

          <div
            className="product-type-tabs"
            role="tablist"
            aria-label="제품유형 탭"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeType === ALL_TYPES}
              data-active={activeType === ALL_TYPES}
              onClick={() => selectType(ALL_TYPES)}
              className="product-type-tab"
            >
              <span className="product-type-tab-label">전체</span>
              <span className="product-type-tab-count">{analytics.products.length}</span>
            </button>
            {typeOptions.map((t) => {
              const active = t.type === activeType
              return (
                <button
                  key={t.type}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-active={active}
                  onClick={() => selectType(t.type)}
                  className="product-type-tab"
                >
                  <span className="product-type-tab-label">{t.type}</span>
                  <span className="product-type-tab-count">{t.count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                {showTypeColumn && <th className="px-2 py-2 font-medium">제품유형</th>}
                <th className="px-2 py-2 font-medium">품번</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">주요 불량</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showTypeColumn ? 7 : 6}
                    className="px-2 py-10 text-center text-sm text-muted"
                  >
                    {activeType
                      ? `「${activeType}」 유형에 해당하는 품번이 없습니다.`
                      : '표시할 품번이 없습니다.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                    {showTypeColumn && <td className="px-2 py-3">{row.type}</td>}
                    <td className="px-2 py-3">
                      <Link
                        to={buildProductDetailHref(row.id, 'products')}
                        className="font-medium text-accent hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                    <td className="px-2 py-3">{row.mainDefect}</td>
                    <td className="num px-2 py-3">{formatWonSuffix(row.scrapCost)}</td>
                  </tr>
                ))
              )}
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
