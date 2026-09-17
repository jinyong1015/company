import { useEffect, useMemo, useState } from 'react'
import { Coins } from 'lucide-react'
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
import { formatPpm, formatWon, roundWon } from '../lib/format'

type Dim = 'product' | 'defect' | 'mold' | 'equipment' | 'inspector' | 'group'

const ALL_TYPES = ''
const VIEW_STATE_KEY = 'cost-analysis'

type CostAnalysisViewState = {
  dim: Dim
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
  topView: QtyTopView
  topType: string
}

const defaultViewState: CostAnalysisViewState = {
  dim: 'product',
  query: '',
  sortKey: 'scrapCost',
  asc: false,
  page: 1,
  pageSize: 10,
  topView: 'rank',
  topType: ALL_TYPES,
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
    topView: stored.topView === 'bar' ? 'bar' : 'rank',
    topType: typeof stored.topType === 'string' ? stored.topType : defaultViewState.topType,
  }
}

function toneForType(type: string): 'all' | 'seal' | 'grommet' {
  const t = type.toLowerCase()
  if (t.includes('seal') || t.includes('실링') || t.includes('씰')) return 'seal'
  if (t.includes('grommet') || t.includes('그로멧') || t.includes('유압')) return 'grommet'
  return 'all'
}

function formatCostValue(n: number) {
  return roundWon(n).toLocaleString('ko-KR')
}

export function CostAnalysis() {
  const { analytics } = useData()
  const [view, setView] = useState<CostAnalysisViewState>(readViewState)
  const { dim, query, sortKey, asc, page, pageSize, topView, topType } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<CostAnalysisViewState>) {
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

  const activeTopType = typeOptions.some((t) => t.type === topType)
    ? topType
    : ALL_TYPES

  const topItems = useMemo((): QtyTopItem[] => {
    const list = activeTopType
      ? analytics.products.filter((p) => (p.type || '미지정') === activeTopType)
      : analytics.products
    return list.map((p) => ({
      id: p.id,
      name: p.name,
      meta: p.type || '미지정',
      qty: p.scrapCost,
      href: buildProductDetailHref(p.id, 'cost'),
    }))
  }, [analytics.products, activeTopType])

  const topTabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_TYPES]: analytics.products.filter((p) => p.scrapCost > 0).length,
    }
    for (const t of typeOptions) {
      counts[t.type] = analytics.products.filter(
        (p) => (p.type || '미지정') === t.type && p.scrapCost > 0,
      ).length
    }
    return counts
  }, [analytics.products, typeOptions])

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="비용 분석"
        description="폐기비용을 품번·불량·금형·설비·검사자 기준으로 비교합니다."
      />

      <QtyTop10Chart
        items={topItems}
        title="폐기비용 품번 TOP 10"
        subtitle="품번별 폐기비용 기준 상위 10개"
        badgeLabel={activeTopType || '전체'}
        tone={toneForType(activeTopType)}
        view={topView}
        onViewChange={(v) => patchView({ topView: v })}
        emptyMessage="선택한 제품유형에 해당하는 폐기비용 데이터가 없습니다."
        valueLabel="폐기비용"
        valueUnit="원"
        formatValue={formatCostValue}
        ValueIcon={Coins}
        typeTabs={
          <div className="qty-type-tabs" role="tablist" aria-label="폐기비용 TOP 제품유형">
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
        onDownload={() => downloadExcel('비용분석.xlsx', rows)}
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
                  <td className="px-2 py-3 font-medium">{row.name}</td>
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
