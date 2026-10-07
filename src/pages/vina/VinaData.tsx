import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import { Pager } from '../../components/common/Pager'
import { SortSearchBar } from '../../components/common/SortSearchBar'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { filterInspectionDataRecords } from '../../lib/analyze'
import { downloadStyledExcel } from '../../lib/download'
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

function warnIssues(r: InspectionRecord): string[] {
  return (r.issues ?? []).filter(Boolean)
}

export function VinaData() {
  const { records, hasUploadedData, meta } = useVinaData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [selected, setSelected] = useState<InspectionRecord | null>(null)
  const [detail, setDetail] = useState<InspectionRecord | null>(null)

  const scoped = useMemo(
    () =>
      filterInspectionDataRecords(records).filter(
        (r) => r.rowClass === 'ok' || r.rowClass === 'warn',
      ),
    [records],
  )
  const errorCount = useMemo(
    () => records.filter((r) => r.rowClass === 'error').length,
    [records],
  )
  const warnCount = useMemo(
    () => scoped.filter((r) => r.rowClass === 'warn').length,
    [scoped],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = scoped.filter((r) => {
      if (!q) return true
      return [
        r.product,
        r.inspector,
        r.worker,
        r.equipment,
        r.mainDefect,
        r.productType,
        r.date,
        r.rowClass,
        ...warnIssues(r),
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
  }, [scoped, query, sortKey, asc])

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
        title="VINA 검사 DATA"
        description={
          hasUploadedData
            ? `${meta.fileName ?? '업로드 파일'} · 정상·경고 ${scoped.length.toLocaleString()}건 표시 · 오류 ${errorCount.toLocaleString()}건은 오류 DATA`
            : '정상·경고 행만 표시합니다. 오류 행은 오류 DATA 메뉴에서 확인하세요.'
        }
        actions={
          errorCount > 0 ? (
            <Link
              to="/vina/error-data"
              className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 px-3 py-1.5 text-sm text-danger hover:bg-danger-soft"
            >
              오류 DATA {errorCount.toLocaleString()}건
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
          placeholder="품번, 검사자, 설비, 경고 사유 검색"
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
              'VINA_검사DATA.xlsx',
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
                  상태: classLabel[r.rowClass === 'ok' || r.rowClass === 'warn' ? r.rowClass : 'ok'],
                  이슈: warnIssues(r).join(', '),
                }
              }),
              { sheetName: 'VINA 검사DATA' },
            )
          }}
          extra={
            <p className="num text-sm text-muted">
              정상·경고 {scoped.length.toLocaleString()}건
              {warnCount > 0 ? ` · 경고 ${warnCount.toLocaleString()}건` : null}
              {filtered.length !== scoped.length
                ? ` · 검색 ${filtered.length.toLocaleString()}건`
                : null}
              {errorCount > 0 ? ` · 오류 ${errorCount.toLocaleString()}건은 오류 DATA` : null}
            </p>
          }
          resultTitle="VINA 검사 내역"
        >
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.id} className={NUM_COLS.has(col.id) && col.id !== 'date' ? 'num' : undefined}>
                      <button type="button" onClick={() => toggleSort(col.id)}>
                        {col.label}
                        {sortKey === col.id ? (asc ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                  <th>사유</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ textAlign: 'center', padding: '40px 14px' }}>
                      표시할 정상·경고 데이터가 없습니다.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((r) => {
                    const issues = warnIssues(r)
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setSelected(r)}
                        className={`pd-row-selectable ${
                          selected?.id === r.id ? 'pd-row-selected' : ''
                        }`}
                      >
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
                        <td>
                          {r.rowClass === 'warn' && issues.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {issues.map((issue) => (
                                <span
                                  key={issue}
                                  className="pd-status-badge pd-status-badge-warn"
                                  title={issue}
                                >
                                  {issue}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
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
                <p className="text-xs text-muted">VINA 검사 상세</p>
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

            {detail.rowClass === 'warn' && warnIssues(detail).length > 0 ? (
              <div className="mb-4 rounded-lg border border-warn/30 bg-warn-soft/40 px-3 py-2">
                <p className="text-xs font-medium text-warn">경고 사유</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {warnIssues(detail).map((issue) => (
                    <span key={issue} className="pd-status-badge pd-status-badge-warn">
                      {issue}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

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
