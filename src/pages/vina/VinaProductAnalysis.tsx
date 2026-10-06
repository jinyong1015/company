import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { SortSearchBar } from '../../components/common/SortSearchBar'
import { Pager } from '../../components/common/Pager'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { downloadExcel } from '../../lib/download'
import type { ProductRow } from '../../types'
import { formatPpm, formatWonSuffix } from '../../lib/format'

const sortKeys = [
  { id: 'name', label: '품번' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'scrapCost', label: '폐기비용' },
]

export function VinaProductAnalysis() {
  const { analytics, hasUploadedData } = useVinaData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('qty')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.products.filter(
      (r) => !q || r.name.toLowerCase().includes(q),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof ProductRow]
      const bv = b[sortKey as keyof ProductRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.products, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 품번 분석" />
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
        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="VINA 품번 검색"
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
              'VINA_품번분석.xlsx',
              rows.map((r) => ({
                품번: r.name,
                검수량: r.qty,
                부적합수량: r.fail,
                부적합률: r.failRate,
                폐기비용: r.scrapCost,
                주요불량: r.mainDefect,
              })),
            )
          }
          resultTitle="VINA 품번 내역"
        >
          <div className="overflow-x-auto">
            <table className="min-w-[860px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
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
                    <td colSpan={6} className="px-2 py-10 text-center text-sm text-muted">
                      표시할 VINA 품번이 없습니다.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                      <td className="px-2 py-3">
                        <Link
                          to={`/vina/products/${row.id}?from=vina-products`}
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
            onPage={setPage}
          />
        </SortSearchBar>
      )}
    </div>
  )
}
