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
import { useFilters } from '../context/FilterContext'
import { filterRecords } from '../lib/analyze'
import { downloadExcel } from '../lib/download'
import { toEntityId } from '../lib/entityId'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import {
  PLANT_SITE_TABS,
  analysisGroupColor,
  plantSiteOf,
} from '../lib/groups'
import type { WorkerRow } from '../types'
import { failRatePpm, formatPpmAsPercent, formatWon } from '../lib/format'

const VIEW_STATE_KEY = 'worker-analysis'
const ALL_PLANTS = ''
const TOP10_ALL_TAB_BAR_COLOR = '#60a5fa'

type WorkerAnalysisViewState = {
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
  /** 본사 | 2공장 | ''(전체) */
  topPlant: string
}

const defaultViewState: WorkerAnalysisViewState = {
  query: '',
  sortKey: 'qty',
  asc: false,
  page: 1,
  pageSize: 10,
  topPlant: ALL_PLANTS,
}

const sortKeys = [
  { id: 'name', label: '성형 작업자' },
  { id: 'qty', label: '실적수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '불량률(%)' },
  { id: 'hours', label: '작업시간' },
  { id: 'scrapCost', label: '폐기비용' },
  { id: 'productCount', label: '담당 품번 수' },
]

function readViewState(): WorkerAnalysisViewState {
  const stored = loadPageViewState<Partial<WorkerAnalysisViewState>>(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  const sortKey =
    typeof stored.sortKey === 'string' && sortKeys.some((k) => k.id === stored.sortKey)
      ? stored.sortKey
      : defaultViewState.sortKey
  const rawPlant =
    typeof stored.topPlant === 'string'
      ? stored.topPlant
      : defaultViewState.topPlant
  const topPlant =
    rawPlant === '본사' || rawPlant === '2공장' || rawPlant === ALL_PLANTS
      ? rawPlant
      : ALL_PLANTS
  return {
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
    topPlant,
  }
}

function top10BarColor(plant: string): string {
  if (plant === '2공장') return analysisGroupColor('plant2')
  if (plant === '본사') return analysisGroupColor('seal')
  return TOP10_ALL_TAB_BAR_COLOR
}

type WorkerAgg = {
  id: string
  name: string
  team: string
  qty: number
  fail: number
  hours: number
  scrapCost: number
  failRate: number
  productCount: number
}

type WorkerTop10Row = SplitTop10RowBase & { worker: WorkerAgg }

function aggregateWorkers(
  records: ReturnType<typeof filterRecords>,
): WorkerAgg[] {
  const map = new Map<
    string,
    {
      name: string
      team: string
      qty: number
      fail: number
      hours: number
      scrapCost: number
      products: Set<string>
    }
  >()
  for (const r of records) {
    const key = r.worker?.trim()
    if (!key) continue
    const cur = map.get(key)
    if (cur) {
      cur.qty += r.qty
      cur.fail += r.fail
      cur.hours += r.hours
      cur.scrapCost += r.scrapCost
      if (r.product?.trim()) cur.products.add(r.product.trim())
    } else {
      map.set(key, {
        name: key,
        team: r.team || '미지정',
        qty: r.qty,
        fail: r.fail,
        hours: r.hours,
        scrapCost: r.scrapCost,
        products: new Set(r.product?.trim() ? [r.product.trim()] : []),
      })
    }
  }
  return [...map.values()].map((row) => ({
    id: toEntityId('wrk', row.name),
    name: row.name,
    team: row.team,
    qty: row.qty,
    fail: row.fail,
    hours: row.hours,
    scrapCost: row.scrapCost,
    failRate: failRatePpm(row.fail, row.qty),
    productCount: row.products.size,
  }))
}

export function WorkerAnalysis() {
  const { analytics, records } = useData()
  const { filters } = useFilters()
  const [view, setView] = useState<WorkerAnalysisViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize, topPlant } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<WorkerAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  /** TOP10: 선택 기간 · 분석그룹 무시 */
  const scopedRecords = useMemo(
    () =>
      filterRecords(records, filters, true, { ignoreAnalysisGroup: true }),
    [records, filters],
  )

  const activePlant =
    topPlant === '본사' || topPlant === '2공장' ? topPlant : ALL_PLANTS

  const filteredForTop = useMemo(() => {
    return scopedRecords.filter((r) => {
      if (activePlant && plantSiteOf(r.team) !== activePlant) return false
      return true
    })
  }, [scopedRecords, activePlant])

  const topRows = useMemo((): WorkerTop10Row[] => {
    const aggregated = aggregateWorkers(filteredForTop).filter((r) => r.fail > 0)
    const totalFail = aggregated.reduce((s, r) => s + r.fail, 0)
    return [...aggregated]
      .sort((a, b) => b.fail - a.fail)
      .slice(0, 10)
      .map((w, idx) => ({
        id: w.id,
        name: w.name,
        rank: idx + 1,
        value: w.fail,
        sharePercent: totalFail > 0 ? (w.fail / totalFail) * 100 : 0,
        href: `/workers/${w.id}`,
        worker: w,
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
      if (r.fail <= 0) continue
      const key = r.worker?.trim()
      if (!key) continue
      all.add(key)
      const site = plantSiteOf(r.team)
      if (!site) continue
      const set = byPlant.get(site) ?? new Set<string>()
      set.add(key)
      byPlant.set(site, set)
    }
    counts[ALL_PLANTS] = all.size
    counts['본사'] = byPlant.get('본사')?.size ?? 0
    counts['2공장'] = byPlant.get('2공장')?.size ?? 0
    return counts
  }, [scopedRecords])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.workers.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.products.some((p) => p.product.toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof WorkerRow]
      const bv = b[sortKey as keyof WorkerRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.workers, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)
  const plantLabel =
    PLANT_SITE_TABS.find((t) => t.id === activePlant)?.label ?? '전체'
  const barColor = top10BarColor(activePlant)

  return (
    <div className="space-y-5">
      <PageHeader title="성형 작업자 분석" />

      <SplitTop10Panel
        title="작업자 부적합수량 TOP 10"
        description={`선택 기간 · 전체 분석그룹 · ${plantLabel} · 부적합수량 상위 10명`}
        toolbar={
          <div
            className="qty-type-tabs mb-3.5"
            role="tablist"
            aria-label="작업자 TOP 소속"
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
        }
        rows={topRows}
        barColor={barColor}
        xAxisAngle={0}
        valueLabel="부적합수량"
        formatValue={(n) => Math.round(n).toLocaleString('ko-KR')}
        emptyMessage="선택한 소속에 해당하는 부적합수량 데이터가 없습니다."
        detailKicker="선택 작업자"
        detailMeta={(row) =>
          `${row.worker.team} · 담당 품번 ${row.worker.productCount}개`
        }
        rankMeta={(row) =>
          `${row.worker.team} · 담당 품번 ${row.worker.productCount}개`
        }
        metrics={[
          {
            label: '부적합수량',
            value: (row) => row.worker.fail.toLocaleString('ko-KR'),
          },
          {
            label: '불량률',
            value: (row) => formatPpmAsPercent(row.worker.failRate),
          },
          {
            label: '실적수량',
            value: (row) => row.worker.qty.toLocaleString('ko-KR'),
          },
          {
            label: '폐기비용',
            value: (row) => formatWon(row.worker.scrapCost),
          },
        ]}
      />

      <SortSearchBar
        query={query}
        onQuery={(v) => {
          patchView({ query: v, page: 1 })
        }}
        placeholder="성형 작업자 / 품번 검색"
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
            '성형작업자분석.xlsx',
            rows.map((r) => ({
              성형작업자: r.name,
              담당품번수: r.productCount,
              실적수량: r.qty,
              부적합수량: r.fail,
              '불량률(%)': Number(((r.failRate || 0) / 10_000).toFixed(2)),
              폐기비용: r.scrapCost,
            })),
          )
        }
        resultTitle="성형 작업자 내역"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">성형 작업자</th>
                <th className="px-2 py-2 font-medium">담당 품번</th>
                <th className="px-2 py-2 font-medium">실적수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">불량률(%)</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                  <td className="px-2 py-3 font-medium">
                    <Link
                      to={`/workers/${row.id}`}
                      className="text-accent hover:underline"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="num px-2 py-3">{row.productCount}</td>
                  <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{formatPpmAsPercent(row.failRate)}</td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-sm text-muted">
                    표시할 성형 작업자가 없습니다.
                  </td>
                </tr>
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
