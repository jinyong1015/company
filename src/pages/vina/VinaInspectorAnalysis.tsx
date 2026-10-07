import { Fragment, useEffect, useMemo, useState } from 'react'
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
import { failRatePpm, formatPpm, formatWon, formatWonSuffix } from '../../lib/format'
import {
  PLANT_SITE_TABS,
  analysisGroupColor,
  plantSiteOf,
} from '../../lib/groups'
import {
  buildInspectorDetailHref,
  buildProductDetailHref,
  periodOptionsFromFilters,
} from '../../lib/productDetailNav'
import { loadPageViewState, savePageViewState } from '../../lib/pageViewState'
import type { InspectorRow } from '../../types'

const VIEW_STATE_KEY = 'vina-inspector-analysis'
const ALL_PLANTS = ''
const ALL_TYPES = ''
const TOP10_ALL_TAB_BAR_COLOR = '#60a5fa'

type VinaInspectorViewState = {
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
  topPlant: string
  topType: string
}

const defaultViewState: VinaInspectorViewState = {
  query: '',
  sortKey: 'qty',
  asc: false,
  page: 1,
  pageSize: 10,
  topPlant: ALL_PLANTS,
  topType: ALL_TYPES,
}

function readViewState(): VinaInspectorViewState {
  const stored = loadPageViewState<Partial<VinaInspectorViewState>>(VIEW_STATE_KEY)
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
    sortKey:
      typeof stored.sortKey === 'string' ? stored.sortKey : defaultViewState.sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topPlant,
    topType,
  }
}

const sortKeys = [
  { id: 'name', label: '검사자' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'scrapCost', label: '폐기비용' },
]

function productTypeOf(value: string) {
  return value.trim() || '미지정'
}

function top10BarColor(plant: string, type: string): string {
  if (plant === '2공장') return analysisGroupColor('plant2')
  if (plant === '본사') return analysisGroupColor('seal')
  const t = type.toLowerCase()
  if (t.includes('seal') || type.includes('실링') || type.includes('씰')) {
    return analysisGroupColor('seal')
  }
  if (
    t.includes('grommet') ||
    type.includes('그로멧') ||
    type.includes('유압')
  ) {
    return analysisGroupColor('hydraulic')
  }
  return TOP10_ALL_TAB_BAR_COLOR
}

type InspectorQtyAgg = {
  id: string
  name: string
  team: string
  qty: number
  fail: number
  hours: number
  scrapCost: number
  failRate: number
  uph: number
}

type InspectorTop10Row = SplitTop10RowBase & { inspector: InspectorQtyAgg }

function aggregateInspectorQty(
  records: ReturnType<typeof filterRecords>,
): InspectorQtyAgg[] {
  const map = new Map<string, InspectorQtyAgg>()
  for (const r of records) {
    const key = r.inspector
    const cur = map.get(key)
    if (cur) {
      cur.qty += r.qty
      cur.fail += r.fail
      cur.hours += r.hours
      cur.scrapCost += r.scrapCost
    } else {
      map.set(key, {
        id: toEntityId('ins', key),
        name: key,
        team: r.team || '미지정',
        qty: r.qty,
        fail: r.fail,
        hours: r.hours,
        scrapCost: r.scrapCost,
        failRate: 0,
        uph: 0,
      })
    }
  }
  return [...map.values()].map((row) => ({
    ...row,
    failRate: failRatePpm(row.fail, row.qty),
    uph: row.hours > 0 ? Math.round(row.qty / row.hours) : 0,
  }))
}

export function VinaInspectorAnalysis() {
  const { analytics, records, hasUploadedData } = useVinaData()
  const { filters } = useFilters()
  const periodOpts = useMemo(
    () => periodOptionsFromFilters(filters),
    [filters.startDate, filters.endDate],
  )
  const [view, setView] = useState<VinaInspectorViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize, topPlant, topType } = view
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<VinaInspectorViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const scopedRecords = useMemo(
    () =>
      filterRecords(records, filters, true, { ignoreAnalysisGroup: true }),
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

  const topRows = useMemo((): InspectorTop10Row[] => {
    const aggregated = aggregateInspectorQty(filteredForTop).filter(
      (r) => r.qty > 0,
    )
    const totalQty = aggregated.reduce((s, r) => s + r.qty, 0)
    return [...aggregated]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((r, idx) => ({
        id: r.id,
        name: r.name,
        rank: idx + 1,
        value: r.qty,
        sharePercent: totalQty > 0 ? (r.qty / totalQty) * 100 : 0,
        href: `/vina/inspectors/${r.id}?from=vina-inspectors`,
        inspector: r,
      }))
  }, [filteredForTop])

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
  const scopeParts = [activePlant || null, activeTopType || null].filter(Boolean)
  const scopeLabel = scopeParts.length ? scopeParts.join(' · ') : '전체'
  const barColor = top10BarColor(activePlant, activeTopType)

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 검사자 분석" />
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
            title="검사자 검수량 TOP 10"
            description={`VINA · 선택 기간 · 전체 분석그룹 · ${scopeLabel} · 검수량 상위 10명`}
            toolbar={
              <div className="qty-filter-stack mb-3.5">
                <div className="qty-filter-row">
                  <span className="qty-filter-label">소속</span>
                  <div
                    className="qty-type-tabs"
                    role="tablist"
                    aria-label="VINA 검수량 TOP 소속"
                  >
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
                    aria-label="VINA 검수량 TOP 제품유형"
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
            rows={topRows}
            barColor={barColor}
            xAxisAngle={0}
            valueLabel="검수량"
            formatValue={(n) => Math.round(n).toLocaleString('ko-KR')}
            emptyMessage="선택한 소속·제품유형에 해당하는 VINA 검수량 데이터가 없습니다."
            detailKicker="VINA 검사자"
            detailMeta={(row) =>
              activeTopType
                ? `${row.inspector.team} · ${activeTopType}`
                : row.inspector.team
            }
            rankMeta={(row) =>
              activeTopType
                ? `${row.inspector.team} · ${activeTopType}`
                : row.inspector.team
            }
            metrics={[
              {
                label: '검수량',
                value: (row) => row.inspector.qty.toLocaleString('ko-KR'),
              },
              {
                label: '부적합률',
                value: (row) => formatPpm(row.inspector.failRate),
              },
              {
                label: 'UPH',
                value: (row) => row.inspector.uph.toLocaleString('ko-KR'),
              },
              {
                label: '폐기비용',
                value: (row) => formatWon(row.inspector.scrapCost),
              },
            ]}
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
                'VINA_검사자분석.xlsx',
                rows.map((r) => ({
                  검사자: r.name,
                  검수량: r.qty,
                  부적합수량: r.fail,
                  부적합률: r.failRate,
                  폐기비용: r.scrapCost,
                })),
              )
            }
            resultTitle="VINA 검사자 내역"
          >
            <div className="overflow-x-auto">
              <table className="min-w-[860px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-2 py-2 font-medium">검사자</th>
                    <th className="px-2 py-2 font-medium">검수량</th>
                    <th className="px-2 py-2 font-medium">부적합수량</th>
                    <th className="px-2 py-2 font-medium">부적합률</th>
                    <th className="px-2 py-2 font-medium">폐기비용</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <Fragment key={row.id}>
                      <tr
                        onClick={() =>
                          setOpenId(openId === row.id ? null : row.id)
                        }
                        className="cursor-pointer border-b border-line/70 hover:bg-canvas"
                      >
                        <td className="px-2 py-3 font-medium">
                          <Link
                            to={buildInspectorDetailHref(row.id, {
                              vina: true,
                              carryFrom: new URLSearchParams({
                                from: 'vina-inspectors',
                                ...(periodOpts.startDate
                                  ? {
                                      startDate: periodOpts.startDate,
                                      endDate: periodOpts.endDate!,
                                    }
                                  : {}),
                              }),
                            })}
                            className="text-accent hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.name}
                          </Link>
                        </td>
                        <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                        <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                        <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                        <td className="num px-2 py-3">
                          {formatWonSuffix(row.scrapCost)}
                        </td>
                      </tr>
                      {openId === row.id ? (
                        <tr>
                          <td colSpan={5} className="bg-canvas/60 px-4 py-3">
                            <p className="mb-2 text-xs text-muted">
                              {row.name} 품번별 · VINA only
                            </p>
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-xs text-muted">
                                  <th className="py-1 text-left">품번</th>
                                  <th className="py-1 text-left">검수량</th>
                                  <th className="py-1 text-left">부적합</th>
                                  <th className="py-1 text-left">부적합률</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.products.map((p) => (
                                  <tr key={p.product}>
                                    <td className="py-1 font-medium">
                                      <Link
                                        to={buildProductDetailHref(
                                          toEntityId('prd', p.product),
                                          'vina-inspectors',
                                          {
                                            ...periodOpts,
                                            vina: true,
                                            inspector: row.name,
                                            inspectorId: row.id,
                                          },
                                        )}
                                        className="text-accent hover:underline"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {p.product}
                                      </Link>
                                    </td>
                                    <td className="num py-1">
                                      {p.qty.toLocaleString()}
                                    </td>
                                    <td className="num py-1">
                                      {p.fail.toLocaleString()}
                                    </td>
                                    <td className="num py-1">
                                      {formatPpm(p.failRate)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
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
