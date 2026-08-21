import { Fragment, useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import type { EquipmentRow } from '../types'
import { formatPpm } from '../lib/format'

const sortKeys = [
  { id: 'name', label: '설비' },
  { id: 'qty', label: '검수량' },
  { id: 'fail', label: '부적합수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'hours', label: '검사시간' },
  { id: 'uph', label: 'UPH' },
  { id: 'scrapCost', label: '폐기비용' },
  { id: 'changeRate', label: '증가율' },
]

export function EquipmentAnalysis() {
  const { analytics } = useData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('qty')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)
  const pageSize = 10

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.equipment.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.products.some((p) => p.product.toLowerCase().includes(q)),
    )
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof EquipmentRow]
      const bv = b[sortKey as keyof EquipmentRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.equipment, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-5">
      <PageHeader title="설비 분석" description="설비 → 품번 순으로 검사량과 품질을 확인합니다." />
      <Panel>
        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="설비 / 품번 검색"
          sortKey={sortKey}
          sortKeys={sortKeys}
          asc={asc}
          onSortKey={setSortKey}
          onToggleDir={() => setAsc((v) => !v)}
          onDownload={() =>
            downloadExcel(
              '설비분석.xlsx',
              rows.map((r) => ({
                설비: r.name,
                검수량: r.qty,
                부적합수량: r.fail,
                부적합률: r.failRate,
                UPH: r.uph,
              })),
            )
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">설비</th>
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
                    <td className="px-2 py-3 font-medium text-accent">{row.name}</td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                    <td className="num px-2 py-3">{row.uph}</td>
                  </tr>
                  {openId === row.id && (
                    <tr>
                      <td colSpan={5} className="bg-canvas/60 px-4 py-3">
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
                            </tr>
                          </thead>
                          <tbody>
                            {row.products.map((p) => (
                              <tr key={p.product}>
                                <td className="py-1">{p.product}</td>
                                <td className="num py-1">{p.qty.toLocaleString()}</td>
                                <td className="num py-1">{p.fail.toLocaleString()}</td>
                                <td className="num py-1">{formatPpm(p.failRate)}</td>
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
        <Pager page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
      </Panel>
    </div>
  )
}
