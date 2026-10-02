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
import type { WorkerRow } from '../types'
import { formatPpmAsPercent, formatWon } from '../lib/format'

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

type WorkerTop10Row = SplitTop10RowBase & { worker: WorkerRow }

export function WorkerAnalysis() {
  const { analytics } = useData()
  const [view, setView] = useState<WorkerAnalysisViewState>(readViewState)
  const { query, sortKey, asc, page, pageSize } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<WorkerAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const topRows = useMemo((): WorkerTop10Row[] => {
    const ranked = [...analytics.workers]
      .sort((a, b) => b.fail - a.fail)
      .slice(0, 10)
    const totalFail = analytics.workers.reduce((s, w) => s + w.fail, 0)
    return ranked.map((w, idx) => ({
      id: w.id,
      name: w.name,
      rank: idx + 1,
      value: w.fail,
      sharePercent: totalFail > 0 ? (w.fail / totalFail) * 100 : 0,
      href: `/workers/${w.id}`,
      worker: w,
    }))
  }, [analytics.workers])

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
      <PageHeader title="성형 작업자 분석" />

      <SplitTop10Panel
        title="부적합수량 작업자 TOP 10"
        description="성형 작업자별 부적합수량 기준 상위 10명"
        rows={topRows}
        xAxisAngle={0}
        valueLabel="부적합수량"
        formatValue={(n) => Math.round(n).toLocaleString('ko-KR')}
        emptyMessage="표시할 부적합수량 데이터가 없습니다."
        detailKicker="선택 작업자"
        detailMeta={(row) => `담당 품번 ${row.worker.productCount}개`}
        rankMeta={(row) => `담당 품번 ${row.worker.productCount}개`}
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
