import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Pager } from '../../components/common/Pager'
import { SortSearchBar } from '../../components/common/SortSearchBar'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { filterErrorDataRecords } from '../../lib/analyze'
import { downloadStyledExcel } from '../../lib/download'
import { filterVinaErrorIssues } from '../../lib/vinaExcel'
import { formatPpm, formatWon } from '../../lib/format'
import type { InspectionRecord } from '../../types'

type SortKey =
  | 'date'
  | 'inspector'
  | 'worker'
  | 'equipment'
  | 'product'
  | 'productType'
  | 'qty'
  | 'pass'
  | 'fail'
  | 'failRate'
  | 'scrapCost'
  | 'mainDefect'
  | 'rowClass'

const COLUMNS: { id: SortKey; label: string }[] = [
  { id: 'date', label: 'Work Day' },
  { id: 'inspector', label: '사원명' },
  { id: 'worker', label: '설비작업자' },
  { id: 'equipment', label: '설비' },
  { id: 'product', label: 'ITEM' },
  { id: 'productType', label: '종류' },
  { id: 'qty', label: '검사수량' },
  { id: 'pass', label: '합격수량' },
  { id: 'fail', label: 'NG수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'mainDefect', label: '주요 불량' },
  { id: 'scrapCost', label: 'NG금액' },
  { id: 'rowClass', label: '상태' },
]

const sortKeys = COLUMNS.map((c) => ({ id: c.id, label: c.label }))

const classLabel = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '분석 제외',
} as const

const statusBadgeClass = {
  ok: 'pd-status-badge pd-status-badge-ok',
  warn: 'pd-status-badge pd-status-badge-warn',
  error: 'pd-status-badge pd-status-badge-error',
  excluded: 'pd-status-badge pd-status-badge-excluded',
} as const

const NUM_COLS = new Set<SortKey>(['date', 'qty', 'pass', 'fail', 'failRate', 'scrapCost'])

function cellValue(r: InspectionRecord, key: SortKey): string {
  const v = r[key]
  if (key === 'failRate' && typeof v === 'number') return formatPpm(v)
  if (key === 'scrapCost' && typeof v === 'number') return formatWon(v)
  if (key === 'qty' || key === 'pass' || key === 'fail') {
    return typeof v === 'number' ? v.toLocaleString() : String(v ?? '')
  }
  if (key === 'rowClass') return classLabel[r.rowClass]
  return String(v ?? '')
}

export function VinaErrorData() {
  const { records, hasUploadedData, meta } = useVinaData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<InspectionRecord | null>(null)
  const [detail, setDetail] = useState<InspectionRecord | null>(null)

  const errorRecords = useMemo(() => filterErrorDataRecords(records), [records])
  const inspectionCount = useMemo(
    () => records.filter((r) => r.rowClass === 'ok' || r.rowClass === 'warn').length,
    [records],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = errorRecords.filter((r) => {
      if (!q) return true
      const errorIssues = filterVinaErrorIssues(r.issues)
      return [
        r.product,
        r.inspector,
        r.worker,
        r.equipment,
        r.mainDefect,
        r.productType,
        r.date,
        r.rowClass,
        ...errorIssues,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    return [...list].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') return asc ? av - bv : bv - av
      return asc
        ? String(av).localeCompare(String(bv), 'ko')
        : String(bv).localeCompare(String(av), 'ko')
    })
  }, [errorRecords, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const colCount = COLUMNS.length + 1

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(true)
    }
  }

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader
        title="VINA 오류 DATA"
        description={
          hasUploadedData
            ? `${meta.fileName ?? '업로드 파일'} · 오류 ${errorRecords.length.toLocaleString()}건 · 정상·경고 ${inspectionCount.toLocaleString()}건은 검사 DATA`
            : '오류로 분류된 행만 표시합니다. 정상·경고는 검사 DATA에서 확인하세요.'
        }
        actions={
          inspectionCount > 0 ? (
            <Link
              to="/vina/data"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"
            >
              검사 DATA {inspectionCount.toLocaleString()}건
            </Link>
          ) : null
        }
      />
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
          placeholder="품번, 검사자, 설비, 이슈 검색"
          sortKey={sortKey}
          sortKeys={sortKeys}
          asc={asc}
          onSortKey={(id) => {
            setSortKey(id as SortKey)
            setPage(1)
          }}
          onToggleDir={() => setAsc((v) => !v)}
          pageSize={pageSize}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          pageSizeOptions={[50, 100, 200, 500]}
          onDownload={() => {
            const sorted = [...filtered].sort((a, b) => {
              const byDate = a.date.localeCompare(b.date)
              if (byDate !== 0) return byDate
              return a.product.localeCompare(b.product, 'ko')
            })
            void downloadStyledExcel(
              'VINA_오류DATA.xlsx',
              sorted.map((r) => {
                const unitPriceRaw = r.extras?.['단가']
                const unitPriceNum =
                  unitPriceRaw != null && unitPriceRaw !== '' ? Number(unitPriceRaw) : NaN
                const inspectCostRaw = r.extras?.['검사금액']
                const inspectCostNum =
                  inspectCostRaw != null && inspectCostRaw !== ''
                    ? Number(inspectCostRaw)
                    : NaN
                return {
                  이슈: filterVinaErrorIssues(r.issues).join(', '),
                  검사일자: r.date,
                  검사자: r.inspector,
                  설비작업자: r.worker,
                  설비: r.equipment,
                  품번: r.product,
                  종류: r.productType,
                  검수량: r.qty,
                  합격수량: r.pass,
                  NG수량: r.fail,
                  부적합률: r.failRate,
                  주요불량: r.mainDefect,
                  검사금액: Number.isFinite(inspectCostNum) ? inspectCostNum : '',
                  폐기금액: r.scrapCost,
                  단가: Number.isFinite(unitPriceNum) ? unitPriceNum : unitPriceRaw ?? '',
                  상태: classLabel[r.rowClass],
                }
              }),
              { sheetName: 'VINA 오류DATA' },
            )
          }}
          extra={
            <p className="num text-sm text-muted">
              오류 {errorRecords.length.toLocaleString()}건
              {filtered.length !== errorRecords.length
                ? ` · 검색 ${filtered.length.toLocaleString()}건`
                : null}
            </p>
          }
          resultTitle="VINA 오류 내역"
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>이슈</th>
                  {COLUMNS.map((col) => (
                    <th key={col.id} className={NUM_COLS.has(col.id) && col.id !== 'date' ? 'num' : undefined}>
                      <button type="button" onClick={() => toggleSort(col.id)}>
                        {col.label}
                        {sortKey === col.id ? (asc ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ textAlign: 'center', padding: '40px 14px' }}>
                      {errorRecords.length === 0
                        ? '현재 오류로 분류된 행이 없습니다.'
                        : '검색 조건에 맞는 오류 행이 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const issues = filterVinaErrorIssues(r.issues)
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`pd-row-selectable ${
                          selected?.id === r.id ? 'pd-row-selected' : ''
                        }`}
                      >
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {issues.length ? (
                              issues.map((issue) => (
                                <span
                                  key={issue}
                                  className="pd-status-badge pd-status-badge-error"
                                  title={issue}
                                >
                                  {issue}
                                </span>
                              ))
                            ) : (
                              <span>-</span>
                            )}
                          </div>
                        </td>
                        {COLUMNS.map((col) => (
                          <td key={col.id} className={NUM_COLS.has(col.id) ? 'num' : undefined}>
                            {col.id === 'rowClass' ? (
                              <span className={statusBadgeClass[r.rowClass]}>
                                {classLabel[r.rowClass]}
                              </span>
                            ) : col.id === 'product' ? (
                              <button
                                type="button"
                                className="linkish"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelected(r)
                                  setDetail(r)
                                }}
                              >
                                {cellValue(r, col.id) || '-'}
                              </button>
                            ) : (
                              cellValue(r, col.id) || '-'
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          <Pager
            page={safePage}
            totalPages={totalPages}
            total={filtered.length}
            onPage={setPage}
          />
        </SortSearchBar>
      )}

      {detail ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={() => setDetail(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted">VINA 오류 상세</p>
                <h3 className="mt-1 text-lg font-semibold">{detail.product || '(품번 없음)'}</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg p-1.5 hover:bg-canvas"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2">
              <p className="text-xs font-medium text-danger">이슈</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {filterVinaErrorIssues(detail.issues).length ? (
                  filterVinaErrorIssues(detail.issues).map((issue) => (
                    <span key={issue} className="pd-status-badge pd-status-badge-error">
                      {issue}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-ink">-</span>
                )}
              </div>
            </div>

            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ['Work Day', detail.date],
                  ['사원명', detail.inspector],
                  ['설비작업자', detail.worker || '-'],
                  ['설비', detail.equipment || '-'],
                  ['종류', detail.productType || '-'],
                  ['검사수량', detail.qty.toLocaleString()],
                  ['합격수량', detail.pass.toLocaleString()],
                  ['NG수량', detail.fail.toLocaleString()],
                  ['부적합률', formatPpm(detail.failRate)],
                  ['주요 불량', detail.mainDefect || '-'],
                  ['NG금액', formatWon(detail.scrapCost)],
                  ['상태', classLabel[detail.rowClass]],
                  ['단가', detail.extras?.['단가'] || '-'],
                  ['검사금액', detail.extras?.['검사금액'] || '-'],
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
      ) : null}
    </div>
  )
}
