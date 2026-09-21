import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { useFilters } from '../context/FilterContext'
import { filterRecords } from '../lib/analyze'
import { downloadExcel } from '../lib/download'
import { toEntityId } from '../lib/entityId'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import { PLANT_SITE_TABS, plantSiteOf } from '../lib/groups'
import type { InspectorRow } from '../types'
import { formatPpm } from '../lib/format'

const VIEW_STATE_KEY = 'inspector-analysis'
const ALL_PLANTS = ''
const ALL_TYPES = ''

type InspectorAnalysisViewState = {
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
  topView: QtyTopView
  /** 본사 | 2공장 | ''(전체) — 예전 제품유형 값이면 전체로 폴백 */
  topPlant: string
  /** 제품유형 | ''(전체) */
  topType: string
}

const defaultViewState: InspectorAnalysisViewState = {
  query: '',
  sortKey: 'qty',
  asc: false,
  page: 1,
  pageSize: 10,
  topView: 'rank',
  topPlant: ALL_PLANTS,
  topType: ALL_TYPES,
}

function readViewState(): InspectorAnalysisViewState {
  const stored = loadPageViewState<
    Partial<InspectorAnalysisViewState> & { topType?: string }
  >(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  const rawPlant =
    typeof stored.topPlant === 'string'
      ? stored.topPlant
      : defaultViewState.topPlant
  const topPlant =
    rawPlant === '본사' || rawPlant === '2공장' || rawPlant === ALL_PLANTS
      ? rawPlant
      : ALL_PLANTS
  const topType =
    typeof stored.topType === 'string' ? stored.topType : defaultViewState.topType
  return {
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey: typeof stored.sortKey === 'string' ? stored.sortKey : defaultViewState.sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topView: stored.topView === 'bar' ? 'bar' : 'rank',
    topPlant,
    topType,
  }
}

const sortKeys = [
  { id: 'team', label: '소속' },
  { id: 'name', label: '검사자' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'hours', label: '검사시간' },
  { id: 'uph', label: 'UPH' },
  { id: 'scrapCost', label: '폐기비용' },
]

function toneForFilters(
  plant: string,
  type: string,
): 'all' | 'seal' | 'grommet' {
  if (plant === '본사') return 'seal'
  if (plant === '2공장') return 'grommet'
  const t = type.toLowerCase()
  if (t.includes('seal') || type.includes('실링') || type.includes('씰')) return 'seal'
  if (t.includes('grommet') || type.includes('그로멧')) return 'grommet'
  return 'all'
}

function productTypeOf(value: string) {
  return value.trim() || '미지정'
}

type InspectorQtyAgg = {
  id: string
  name: string
  team: string
  qty: number
}

function aggregateInspectorQty(
  records: ReturnType<typeof filterRecords>,
): InspectorQtyAgg[] {
  const map = new Map<string, InspectorQtyAgg>()
  for (const r of records) {
    const key = r.inspector
    const cur = map.get(key)
    if (cur) {
      cur.qty += r.qty
    } else {
      map.set(key, {
        id: toEntityId('ins', key),
        name: key,
        team: r.team || '미지정',
        qty: r.qty,
      })
    }
  }
  return [...map.values()]
}

export function InspectorAnalysis() {
  const { analytics, records } = useData()
  const { filters } = useFilters()
  const [view, setView] = useState<InspectorAnalysisViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize, topView, topPlant, topType } = view
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<InspectorAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const scopedRecords = useMemo(
    () => filterRecords(records, filters, true),
    [records, filters],
  )

  const activePlant =
    topPlant === '본사' || topPlant === '2공장' ? topPlant : ALL_PLANTS

  const typeOptions = useMemo(() => {
    const map = new Map<string, Set<string>>()
    for (const r of scopedRecords) {
      if (r.qty <= 0) continue
      if (activePlant && plantSiteOf(r.team) !== activePlant) continue
      const type = productTypeOf(r.productType)
      const set = map.get(type) ?? new Set<string>()
      set.add(r.inspector)
      map.set(type, set)
    }
    return [...map.entries()]
      .map(([type, inspectors]) => ({ type, count: inspectors.size }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, 'ko'))
  }, [scopedRecords, activePlant])

  const activeTopType = typeOptions.some((t) => t.type === topType)
    ? topType
    : ALL_TYPES

  const filteredForTop = useMemo(() => {
    return scopedRecords.filter((r) => {
      if (activePlant && plantSiteOf(r.team) !== activePlant) return false
      if (activeTopType && productTypeOf(r.productType) !== activeTopType)
        return false
      return true
    })
  }, [scopedRecords, activePlant, activeTopType])

  const topItems = useMemo((): QtyTopItem[] => {
    return aggregateInspectorQty(filteredForTop).map((r) => ({
      id: r.id,
      name: r.name,
      meta: activeTopType ? `${r.team} · ${activeTopType}` : r.team,
      qty: r.qty,
      href: `/inspectors/${r.id}`,
    }))
  }, [filteredForTop, activeTopType])

  const plantTabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_PLANTS]: 0,
      본사: 0,
      '2공장': 0,
    }
    const byPlant = new Map<string, Set<string>>()
    const all = new Set<string>()
    for (const r of scopedRecords) {
      if (r.qty <= 0) continue
      if (activeTopType && productTypeOf(r.productType) !== activeTopType)
        continue
      all.add(r.inspector)
      const site = plantSiteOf(r.team)
      if (!site) continue
      const set = byPlant.get(site) ?? new Set<string>()
      set.add(r.inspector)
      byPlant.set(site, set)
    }
    counts[ALL_PLANTS] = all.size
    counts['본사'] = byPlant.get('본사')?.size ?? 0
    counts['2공장'] = byPlant.get('2공장')?.size ?? 0
    return counts
  }, [scopedRecords, activeTopType])

  const topTabCounts = useMemo(() => {
    const counts: Record<string, number> = {
      [ALL_TYPES]: aggregateInspectorQty(
        scopedRecords.filter((r) => {
          if (r.qty <= 0) return false
          if (activePlant && plantSiteOf(r.team) !== activePlant) return false
          return true
        }),
      ).filter((r) => r.qty > 0).length,
    }
    for (const t of typeOptions) {
      counts[t.type] = t.count
    }
    return counts
  }, [scopedRecords, activePlant, typeOptions])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.inspectors.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.team.toLowerCase().includes(q) ||
        r.products.some((p) => p.product.toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof InspectorRow]
      const bv = b[sortKey as keyof InspectorRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.inspectors, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const badgeLabel = [activePlant || null, activeTopType || null]
    .filter(Boolean)
    .join(' · ') || '전체'

  return (
    <div className="space-y-5">
      <PageHeader
        title="검사자 분석"
        description="소속 → 검사자 → 품번 순으로 검사량과 효율을 확인합니다."
      />

      <QtyTop10Chart
        items={topItems}
        title="검사 수량 작업자 TOP 10"
        subtitle="검사자별 검수량 기준 상위 10명 · 소속 / 제품유형"
        badgeLabel={badgeLabel}
        tone={toneForFilters(activePlant, activeTopType)}
        view={topView}
        onViewChange={(v) => patchView({ topView: v })}
        emptyMessage="선택한 소속·제품유형에 해당하는 검수량 데이터가 없습니다."
        typeTabs={
          <div className="qty-filter-stack">
            <div className="qty-filter-row">
              <span className="qty-filter-label">소속</span>
              <div className="qty-type-tabs" role="tablist" aria-label="검수량 TOP 소속">
                {PLANT_SITE_TABS.map((tab) => (
                  <button
                    key={tab.id || 'all-plant'}
                    type="button"
                    role="tab"
                    aria-selected={activePlant === tab.id}
                    className="qty-type-tab"
                    data-active={activePlant === tab.id}
                    onClick={() => patchView({ topPlant: tab.id })}
                  >
                    {tab.label}
                    <span className="qty-type-tab-count">
                      {plantTabCounts[tab.id] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="qty-filter-row">
              <span className="qty-filter-label">유형</span>
              <div
                className="qty-type-tabs"
                role="tablist"
                aria-label="검수량 TOP 제품유형"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={!activeTopType}
                  className="qty-type-tab"
                  data-active={!activeTopType}
                  onClick={() => patchView({ topType: ALL_TYPES })}
                >
                  전체
                  <span className="qty-type-tab-count">
                    {topTabCounts[ALL_TYPES] ?? 0}
                  </span>
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
                    <span className="qty-type-tab-count">
                      {topTabCounts[t.type] ?? 0}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
      />
      <SortSearchBar
        query={query}
        onQuery={(v) => {
          patchView({ query: v, page: 1 })
        }}
        placeholder="검사자 / 품번 검색"
        sortKey={sortKey}
        sortKeys={sortKeys}
        asc={asc}
        onSortKey={(key) => patchView({ sortKey: key })}
        onToggleDir={() => patchView({ asc: !asc })}
        pageSize={pageSize}
        onPageSize={(size) => {
          patchView({ pageSize: size, page: 1 })
        }}
        onDownload={() =>
          downloadExcel(
            '검사자분석.xlsx',
            rows.map((r) => ({
              소속: r.team,
              검사자: r.name,
              검수량: r.qty,
              부적합수량: r.fail,
              부적합률: r.failRate,
              UPH: r.uph,
              폐기비용: r.scrapCost,
            })),
          )
        }
        resultTitle="검사자 내역"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">소속</th>
                <th className="px-2 py-2 font-medium">검사자</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">UPH</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="cursor-pointer border-b border-line/70 hover:bg-canvas"
                  >
                    <td className="px-2 py-3">{row.team}</td>
                    <td className="px-2 py-3 font-medium">
                      <Link
                        to={`/inspectors/${row.id}`}
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                    <td className="num px-2 py-3">{row.uph}</td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={6} className="bg-canvas/60 px-4 py-3">
                        <p className="mb-2 text-xs text-muted">
                          {row.name} 품번별 검사량 · 전체 {row.qty.toLocaleString()} EA
                        </p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted">
                              <th className="py-1 text-left">품번</th>
                              <th className="py-1 text-left">검수량</th>
                              <th className="py-1 text-left">부적합수량</th>
                              <th className="py-1 text-left">부적합률</th>
                              <th className="py-1 text-left">UPH</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.products.map((p) => (
                              <tr key={p.product}>
                                <td className="py-1">{p.product}</td>
                                <td className="num py-1">{p.qty.toLocaleString()}</td>
                                <td className="num py-1">{p.fail.toLocaleString()}</td>
                                <td className="num py-1">{formatPpm(p.failRate)}</td>
                                <td className="num py-1 font-semibold">{p.uph}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={safePage} totalPages={totalPages} total={rows.length} onPage={(p) => patchView({ page: p })} />
      </SortSearchBar>
    </div>
  )
}
