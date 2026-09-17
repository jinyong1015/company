import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import { loadPageViewState, savePageViewState } from '../lib/pageViewState'
import type { WorkerRow } from '../types'
import { formatPpmAsPercent } from '../lib/format'

const VIEW_STATE_KEY = 'worker-analysis'

type WorkerAnalysisViewState = {
  query: string
  sortKey: string
  asc: boolean
  page: number
  pageSize: number
}

const defaultViewState: WorkerAnalysisViewState = {
  query: '',
  sortKey: 'qty',
  asc: false,
  page: 1,
  pageSize: 10,
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
  return {
    query: typeof stored.query === 'string' ? stored.query : defaultViewState.query,
    sortKey,
    asc: typeof stored.asc === 'boolean' ? stored.asc : defaultViewState.asc,
    page: typeof stored.page === 'number' && stored.page >= 1 ? stored.page : defaultViewState.page,
    pageSize:
      typeof stored.pageSize === 'number' && stored.pageSize > 0
        ? stored.pageSize
        : defaultViewState.pageSize,
  }
}

export function WorkerAnalysis() {
  const { analytics } = useData()
  const [view, setView] = useState<WorkerAnalysisViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize } = view
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<WorkerAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

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

  return (
    <div className="space-y-5">
      <PageHeader
        title="성형 작업자 분석"
        description="성형 작업자 → 품번 순으로 실적과 불량 현황을 확인합니다."
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
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="cursor-pointer border-b border-line/70 hover:bg-canvas"
                  >
                    <td className="px-2 py-3 font-medium">
                      <Link
                        to={`/workers/${row.id}`}
                        className="text-accent hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num px-2 py-3">{row.productCount}</td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpmAsPercent(row.failRate)}</td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={5} className="bg-canvas/60 px-4 py-3">
                        <p className="mb-2 text-xs text-muted">
                          {row.name} 품번별 실적 · 전체 {row.qty.toLocaleString()} EA
                        </p>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-muted">
                              <th className="py-1 text-left">품번</th>
                              <th className="py-1 text-left">실적수량</th>
                              <th className="py-1 text-left">부적합수량</th>
                              <th className="py-1 text-left">불량률(%)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.products.map((p) => (
                              <tr key={p.product}>
                                <td className="py-1">{p.product}</td>
                                <td className="num py-1">{p.qty.toLocaleString()}</td>
                                <td className="num py-1">{p.fail.toLocaleString()}</td>
                                <td className="num py-1 font-semibold">
                                  {formatPpmAsPercent(p.failRate)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
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
        <Pager page={safePage} totalPages={totalPages} total={rows.length} onPage={(p) => patchView({ page: p })} />
      </SortSearchBar>
    </div>
  )
}
