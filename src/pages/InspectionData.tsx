import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { Pager } from '../components/common/Pager'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { filterRecords } from '../lib/analyze'
import { downloadExcel } from '../lib/download'
import type { InspectionRecord } from '../types'
import { Search, X } from 'lucide-react'

type SortKey = keyof InspectionRecord

const classLabel = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '분석 제외',
} as const

const classStyle = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  error: 'bg-danger-soft text-danger',
  excluded: 'bg-canvas text-muted',
} as const

export function InspectionData() {
  const { records, hasUploadedData, meta } = useData()
  const { filters } = useFilters()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<InspectionRecord | null>(null)
  const pageSize = 12

  const scoped = useMemo(() => filterRecords(records, filters, false), [records, filters])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = scoped.filter((r) => {
      if (!q) return true
      return [
        r.product,
        r.inspector,
        r.moldNo,
        r.equipment,
        r.lot,
        r.mainDefect,
        r.team,
        r.productType,
        r.rowClass,
        ...r.issues,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })

    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return asc ? av - bv : bv - av
      }
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [scoped, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(true)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="검사 DATA"
        description={
          hasUploadedData
            ? `${meta.fileName} 원본 데이터 · 현재 필터 ${filtered.length.toLocaleString()}건`
            : '원본 검사 데이터를 검색·정렬하고 상세를 확인합니다.'
        }
        actions={
          <button
            type="button"
            onClick={() =>
              downloadExcel(
                '검사DATA.xlsx',
                filtered.map((r) => ({
                  날짜: r.date,
                  작업구분: r.workType,
                  검사원: r.inspector,
                  소속: r.team,
                  품번: r.product,
                  제품유형: r.productType,
                  금형번호: r.moldNo,
                  설비: r.equipment,
                  LOT: r.lot,
                  검수량: r.qty,
                  합격: r.pass,
                  부적합: r.fail,
                  부적합률: r.failRate,
                  주요불량: r.mainDefect,
                  폐기비용: r.scrapCost,
                  상태: classLabel[r.rowClass],
                  이슈: r.issues.join(', '),
                })),
              )
            }
            className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"
          >
            Excel 다운로드
          </button>
        }
      />

      <Panel>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="품번, 검사원, 금형, 설비, LOT, 상태 검색"
              className="w-full rounded-lg border border-line bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-accent"
            />
          </div>
          <p className="num text-sm text-muted">총 {filtered.length.toLocaleString()}건</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1280px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                {(
                  [
                    ['date', '날짜'],
                    ['workType', '작업구분'],
                    ['inspector', '검사원'],
                    ['team', '소속'],
                    ['product', '품번'],
                    ['moldNo', '금형번호'],
                    ['equipment', '설비'],
                    ['qty', '검수량'],
                    ['fail', '부적합'],
                    ['failRate', '부적합률'],
                    ['mainDefect', '주요 불량'],
                    ['scrapCost', '폐기비용'],
                    ['rowClass', '상태'],
                  ] as [SortKey, string][]
                ).map(([key, label]) => (
                  <th key={key} className="px-2 py-2 font-medium">
                    <button type="button" onClick={() => toggleSort(key)} className="hover:text-ink">
                      {label}
                      {sortKey === key ? (asc ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="cursor-pointer border-b border-line/70 hover:bg-canvas"
                >
                  <td className="num px-2 py-3">{r.date}</td>
                  <td className="px-2 py-3">{r.workType}</td>
                  <td className="px-2 py-3">{r.inspector}</td>
                  <td className="px-2 py-3">{r.team}</td>
                  <td className="px-2 py-3 font-medium">{r.product}</td>
                  <td className="num px-2 py-3">{r.moldNo}</td>
                  <td className="px-2 py-3">{r.equipment}</td>
                  <td className="num px-2 py-3">{r.qty.toLocaleString()}</td>
                  <td className="num px-2 py-3">{r.fail.toLocaleString()}</td>
                  <td className="num px-2 py-3">{r.failRate.toFixed(2)}%</td>
                  <td className="px-2 py-3">{r.mainDefect}</td>
                  <td className="num px-2 py-3">₩{r.scrapCost.toLocaleString()}</td>
                  <td className="px-2 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs ${classStyle[r.rowClass]}`}>
                      {classLabel[r.rowClass]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager page={page} totalPages={totalPages} total={filtered.length} onPage={setPage} />
      </Panel>

      {selected && (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={() => setSelected(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted">검사 상세</p>
                <h3 className="mt-1 text-lg font-semibold">{selected.product}</h3>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-lg p-1.5 hover:bg-canvas">
                <X size={16} />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ['날짜', selected.date],
                  ['작업구분', selected.workType],
                  ['검사원', selected.inspector],
                  ['소속', selected.team],
                  ['제품 유형', selected.productType],
                  ['성형 LOT', selected.lot],
                  ['작업자', selected.worker],
                  ['설비', selected.equipment],
                  ['금형번호', selected.moldNo],
                  ['시작', selected.start],
                  ['종료', selected.end],
                  ['소요시간', selected.duration],
                  ['검수량', selected.qty.toLocaleString()],
                  ['합격 수량', selected.pass.toLocaleString()],
                  ['부적합 수량', selected.fail.toLocaleString()],
                  ['부적합률', `${selected.failRate.toFixed(2)}%`],
                  ['주요 불량', selected.mainDefect],
                  ['폐기비용', `₩${selected.scrapCost.toLocaleString()}`],
                  ['상태', classLabel[selected.rowClass]],
                  ['이슈', selected.issues.join(', ') || '-'],
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-1 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>
      )}
    </div>
  )
}
