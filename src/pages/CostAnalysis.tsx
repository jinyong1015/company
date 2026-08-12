import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'

type Dim = 'product' | 'defect' | 'mold' | 'equipment' | 'inspector' | 'group'

export function CostAnalysis() {
  const { analytics } = useData()
  const [dim, setDim] = useState<Dim>('product')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('scrapCost')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 12

  const source = useMemo(() => {
    if (dim === 'product')
      return analytics.products.map((p) => ({
        name: p.name,
        qty: p.qty,
        fail: p.fail,
        failRate: p.failRate,
        scrapCost: p.scrapCost,
        changeRate: p.changeRate,
      }))
    if (dim === 'mold')
      return analytics.molds.map((m) => ({
        name: m.moldNo,
        qty: m.qty,
        fail: m.fail,
        failRate: m.failRate,
        scrapCost: m.scrapCost,
        changeRate: m.changeRate,
      }))
    if (dim === 'equipment')
      return analytics.equipment.map((e) => ({
        name: e.name,
        qty: e.qty,
        fail: e.fail,
        failRate: e.failRate,
        scrapCost: e.scrapCost,
        changeRate: e.changeRate,
      }))
    if (dim === 'inspector')
      return analytics.inspectors.map((i) => ({
        name: i.name,
        qty: i.qty,
        fail: i.fail,
        failRate: i.failRate,
        scrapCost: i.scrapCost,
        changeRate: 0,
      }))
    if (dim === 'group')
      return analytics.groupSummaries.map((g) => ({
        name: g.label,
        qty: g.qty,
        fail: g.fail,
        failRate: g.failRate,
        scrapCost: g.scrapCost,
        changeRate: 0,
      }))
    return analytics.defectTypes.map((d) => ({
      name: d.name,
      qty: d.count,
      fail: d.count,
      failRate: d.share,
      scrapCost: analytics.costByDefect.find((c) => c.name === d.name)?.value ?? 0,
      changeRate: 0,
    }))
  }, [analytics, dim])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = source.filter((r) => !q || r.name.toLowerCase().includes(q))
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof typeof a]
      const bv = b[sortKey as keyof typeof b]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc ? String(av).localeCompare(String(bv), 'ko') : String(bv).localeCompare(String(av), 'ko')
    })
  }, [source, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)

  return (
    <div className="space-y-5">
      <PageHeader title="비용 분석" description="폐기비용을 품번·불량·금형·설비·검사자 기준으로 비교합니다." />
      <Panel>
        <div className="mb-3 flex flex-wrap gap-1">
          {(
            [
              ['product', '품번'],
              ['defect', '불량 유형'],
              ['mold', '금형'],
              ['equipment', '설비'],
              ['inspector', '검사자'],
              ['group', '분석 그룹'],
            ] as [Dim, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setDim(id)
                setPage(1)
              }}
              className={`rounded-md px-2.5 py-1 text-xs ${dim === id ? 'bg-ink text-white' : 'bg-canvas text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder="대상명 검색"
          sortKey={sortKey}
          sortKeys={[
            { id: 'name', label: '대상명' },
            { id: 'scrapCost', label: '폐기비용' },
            { id: 'qty', label: '검수량' },
            { id: 'fail', label: '부적합수량' },
            { id: 'failRate', label: '부적합률' },
            { id: 'changeRate', label: '증가율' },
          ]}
          asc={asc}
          onSortKey={setSortKey}
          onToggleDir={() => setAsc((v) => !v)}
          onDownload={() => downloadExcel('비용분석.xlsx', rows)}
        />
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">대상</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.name} className="border-b border-line/70">
                  <td className="px-2 py-3 font-medium">{row.name}</td>
                  <td className="num px-2 py-3">₩{row.scrapCost.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{row.failRate.toFixed(2)}%</td>
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
