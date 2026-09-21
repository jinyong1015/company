import { Fragment, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
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
]

export function MoldAnalysis() {
  const { analytics } = useData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('failRate')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [openId, setOpenId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.molds.filter(
      (r) =>
        !q ||
        r.moldNo.toLowerCase().includes(q) ||
        r.product.toLowerCase().includes(q) ||
        r.equipment.some((e) => e.equipment.toLowerCase().includes(q)),
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
      <PageHeader
        title="금형 분석"
        description="금형 → 설비 순으로 작업 이력과 품질을 확인합니다."
      />
      <SortSearchBar
        query={query}
        onQuery={(v) => {
          setQuery(v)
          setPage(1)
        }}
        placeholder="금형 / 설비 / 품번 검색"
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
              설비수: r.equipment.length,
            })),
          )
        }
        resultTitle="금형 내역"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">금형번호</th>
                <th className="px-2 py-2 font-medium">품번</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">주요 불량</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    onClick={() => setOpenId(openId === row.id ? null : row.id)}
                    className="cursor-pointer border-b border-line/70 hover:bg-canvas"
                  >
                    <td className="num px-2 py-3 font-medium text-accent">{row.moldNo}</td>
                    <td className="px-2 py-3">{row.product}</td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                    <td className="px-2 py-3">{row.mainDefect}</td>
                    <td className="num px-2 py-3">{formatWon(row.scrapCost)}</td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={7} className="bg-canvas/60 px-4 py-3">
                        <p className="mb-2 text-xs text-muted">
                          {row.moldNo} 설비별 검사량 · 전체 {row.qty.toLocaleString()} EA
                        </p>
                        {row.equipment.length ? (
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-xs text-muted">
                                <th className="py-1 text-left">설비</th>
                                <th className="py-1 text-left">검수량</th>
                                <th className="py-1 text-left">부적합수량</th>
                                <th className="py-1 text-left">부적합률</th>
                              </tr>
                            </thead>
                            <tbody>
                              {row.equipment.map((e) => (
                                <tr key={e.equipment}>
                                  <td className="py-1">{e.equipment}</td>
                                  <td className="num py-1">{e.qty.toLocaleString()}</td>
                                  <td className="num py-1">{e.fail.toLocaleString()}</td>
                                  <td className="num py-1">{formatPpm(e.failRate)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <p className="text-sm text-muted">이 금형에 연결된 설비 DATA가 없습니다.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
      </SortSearchBar>
    </div>
  )
}
