import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import type { ProductRow } from '../types'
import { formatPpm } from '../lib/format'

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

export function ProductAnalysis() {
  const { analytics } = useData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('qty')
  const [asc, setAsc] = useState(false)
  const [grouped, setGrouped] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 12

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.products.filter(
      (r) => !q || r.name.toLowerCase().includes(q) || r.type.toLowerCase().includes(q),
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
  const pageRows = grouped ? rows : rows.slice((page - 1) * pageSize, page * pageSize)
  const groups = grouped
    ? [...new Set(pageRows.map((r) => r.type))].map((type) => ({
        type,
        items: pageRows.filter((r) => r.type === type),
      }))
    : [{ type: '', items: pageRows }]

  return (
    <div className="space-y-5">
      <PageHeader
        title="품번 분석"
        description="제품유형 → 품번 → 불량/금형/설비/검사자 순으로 품질을 확인합니다."
      />
      <Panel>
        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="품번 / 제품유형 검색"
          sortKey={sortKey}
          sortKeys={sortKeys}
          asc={asc}
          onSortKey={setSortKey}
          onToggleDir={() => setAsc((v) => !v)}
          extra={
            <label className="inline-flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
              제품유형별 그룹화
            </label>
          }
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
        />
        <div className="overflow-x-auto">
          {groups.map((g) => (
            <div key={g.type || 'all'} className="mb-4">
              {grouped && <p className="mb-2 text-sm font-semibold">{g.type}</p>}
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    {!grouped && <th className="px-2 py-2 font-medium">제품유형</th>}
                    <th className="px-2 py-2 font-medium">품번</th>
                    <th className="px-2 py-2 font-medium">검수량</th>
                    <th className="px-2 py-2 font-medium">부적합수량</th>
                    <th className="px-2 py-2 font-medium">부적합률</th>
                    <th className="px-2 py-2 font-medium">주요 불량</th>
                    <th className="px-2 py-2 font-medium">폐기비용</th>
                    <th className="px-2 py-2 font-medium">상태</th>
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((row) => (
                    <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                      {!grouped && <td className="px-2 py-3">{row.type}</td>}
                      <td className="px-2 py-3">
                        <Link to={`/products/${row.id}`} className="font-medium text-accent hover:underline">
                          {row.name}
                        </Link>
                      </td>
                      <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                      <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                      <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                      <td className="px-2 py-3">{row.mainDefect}</td>
                      <td className="num px-2 py-3">₩{row.scrapCost.toLocaleString()}</td>
                      <td className="px-2 py-3">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        {!grouped && <Pager page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />}
      </Panel>
    </div>
  )
}
