import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import type { MoldRow } from '../types'
import { formatPpm, formatWon } from '../lib/format'

const sortKeys = [
  { id: 'moldNo', label: '금형번호' },
  { id: 'product', label: '품번' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'hours', label: '검사시간' },
  { id: 'scrapCost', label: '폐기비용' },
  { id: 'changeRate', label: '증가율' },
]

export function MoldAnalysis() {
  const { analytics } = useData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('failRate')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.molds.filter(
      (r) => !q || r.moldNo.toLowerCase().includes(q) || r.product.toLowerCase().includes(q),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof MoldRow]
      const bv = b[sortKey as keyof MoldRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.molds, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-5">
      <PageHeader title="금형 분석" description="금형별 품질 상태를 부적합률 기준으로 확인합니다." />
      <Panel>
        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="금형 / 품번 검색"
          sortKey={sortKey}
          sortKeys={sortKeys}
          asc={asc}
          onSortKey={setSortKey}
          onToggleDir={() => setAsc((v) => !v)}
          pageSize={pageSize}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onDownload={() =>
            downloadExcel(
              '금형분석.xlsx',
              rows.map((r) => ({
                금형번호: r.moldNo,
                품번: r.product,
                검수량: r.qty,
                부적합수량: r.fail,
                부적합률: r.failRate,
                폐기비용: r.scrapCost,
              })),
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">금형번호</th>
                <th className="px-2 py-2 font-medium">품번</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">주요 불량</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
                <th className="px-2 py-2 font-medium">최근 변화</th>
                <th className="px-2 py-2 font-medium">상태</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="num px-2 py-3 font-medium">{row.moldNo}</td>
                  <td className="px-2 py-3">{row.product}</td>
                  <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                  <td className="px-2 py-3">{row.mainDefect}</td>
                  <td className="num px-2 py-3">{formatWon(row.scrapCost)}</td>
                  <td className={`num px-2 py-3 ${row.changeRate > 0 ? 'text-danger' : 'text-ok'}`}>
                    {row.recentChange}
                  </td>
                  <td className="px-2 py-3">
                    <StatusBadge status={row.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
      </Panel>
    </div>
  )
}
