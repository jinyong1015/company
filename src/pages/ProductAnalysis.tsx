import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { Pager } from '../components/common/Pager'
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { downloadExcel } from '../lib/download'
import { buildProductDetailHref } from '../lib/productDetailNav'
import type { ProductRow } from '../types'
import { formatPpm, formatWon } from '../lib/format'

const ALL_TYPES = ''

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
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const typeOptions = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of analytics.products) {
      const type = p.type || '미지정'
      map.set(type, (map.get(type) ?? 0) + 1)
    }
    return [...map.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, 'ko'))
  }, [analytics.products])

  const activeType = typeOptions.some((t) => t.type === typeFilter) ? typeFilter : ALL_TYPES

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = analytics.products.filter((r) => {
      const type = r.type || '미지정'
      if (activeType && type !== activeType) return false
      if (!q) return true
      return r.name.toLowerCase().includes(q) || type.toLowerCase().includes(q)
    })
    return [...list].sort((a, b) => {
      const av = a[sortKey as keyof ProductRow]
      const bv = b[sortKey as keyof ProductRow]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [analytics.products, query, sortKey, asc, activeType])

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize)
  const showTypeColumn = !activeType

  function selectType(type: string) {
    setTypeFilter(type)
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="품번 분석"
        description="제품유형 → 품번 → 불량/금형/설비/검사자 순으로 품질을 확인합니다."
      />
      <Panel>
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="mb-1.5 text-xs font-medium text-muted">제품유형</p>
              <p className="text-sm text-ink">
                {activeType ? (
                  <>
                    <span className="font-semibold text-accent">{activeType}</span>
                    <span className="text-muted"> · {rows.length.toLocaleString()}개 품번</span>
                  </>
                ) : (
                  <span className="text-muted">전체 유형 · {analytics.products.length.toLocaleString()}개 품번</span>
                )}
              </p>
            </div>
            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted">
              유형 선택
              <select
                value={activeType}
                onChange={(e) => selectType(e.target.value)}
                className="min-w-[180px] rounded-full border border-line bg-white px-3 py-2 text-sm font-normal text-ink"
                aria-label="제품유형 선택"
              >
                <option value={ALL_TYPES}>전체 ({analytics.products.length})</option>
                {typeOptions.map((t) => (
                  <option key={t.type} value={t.type}>
                    {t.type} ({t.count})
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="제품유형 탭"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeType === ALL_TYPES}
              onClick={() => selectType(ALL_TYPES)}
              className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                activeType === ALL_TYPES
                  ? 'border-accent bg-accent text-white shadow-sm'
                  : 'border-line bg-white text-ink hover:border-accent/40 hover:bg-accent-soft'
              }`}
            >
              전체
              <span className={`ml-1.5 num text-xs ${activeType === ALL_TYPES ? 'text-white/80' : 'text-muted'}`}>
                {analytics.products.length}
              </span>
            </button>
            {typeOptions.map((t) => {
              const active = t.type === activeType
              return (
                <button
                  key={t.type}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectType(t.type)}
                  className={`shrink-0 rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? 'border-accent bg-accent text-white shadow-sm'
                      : 'border-line bg-white text-ink hover:border-accent/40 hover:bg-accent-soft'
                  }`}
                >
                  {t.type}
                  <span className={`ml-1.5 num text-xs ${active ? 'text-white/80' : 'text-muted'}`}>
                    {t.count}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <SortSearchBar
          query={query}
          onQuery={(v) => {
            setQuery(v)
            setPage(1)
          }}
          placeholder={activeType ? '품번 검색' : '품번 / 제품유형 검색'}
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
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                {showTypeColumn && <th className="px-2 py-2 font-medium">제품유형</th>}
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
              {pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={showTypeColumn ? 8 : 7}
                    className="px-2 py-10 text-center text-sm text-muted"
                  >
                    {activeType
                      ? `「${activeType}」 유형에 해당하는 품번이 없습니다.`
                      : '표시할 품번이 없습니다.'}
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                    {showTypeColumn && <td className="px-2 py-3">{row.type}</td>}
                    <td className="px-2 py-3">
                      <Link
                        to={buildProductDetailHref(row.id, 'products')}
                        className="font-medium text-accent hover:underline"
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num px-2 py-3">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-3">{row.fail.toLocaleString()}</td>
                    <td className="num px-2 py-3">{formatPpm(row.failRate)}</td>
                    <td className="px-2 py-3">{row.mainDefect}</td>
                    <td className="num px-2 py-3">{formatWon(row.scrapCost)}</td>
                    <td className="px-2 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} totalPages={totalPages} total={rows.length} onPage={setPage} />
      </Panel>
    </div>
  )
}
