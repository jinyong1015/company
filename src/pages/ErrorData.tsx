import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Pager } from '../components/common/Pager'
import { SortSearchBar } from '../components/common/SortSearchBar'
import { EditInspectionRecordModal } from '../components/admin/EditInspectionRecordModal'
import {
  DataEditButton,
  DataEditToolbar,
  DataRowSelectEdit,
} from '../components/ui/DataEditButton'
import { useAdmin } from '../context/AdminContext'
import { useData } from '../context/DataContext'
import { useToast } from '../context/ToastContext'
import { filterErrorDataRecords } from '../lib/analyze'
import { downloadExcel } from '../lib/download'
import type { InspectionRecord } from '../types'
import { X } from 'lucide-react'
import { formatPpm, formatWon } from '../lib/format'

type SortKey = keyof InspectionRecord

const BASE_COLUMNS: { id: SortKey; label: string }[] = [
  { id: 'date', label: '검사일자' },
  { id: 'inspector', label: '검사작업자' },
  { id: 'team', label: '소속' },
  { id: 'workType', label: '작업구분' },
  { id: 'lot', label: 'LOT NO' },
  { id: 'worker', label: '성형작업자' },
  { id: 'equipment', label: '설비' },
  { id: 'productType', label: '제품유형' },
  { id: 'product', label: '품번' },
  { id: 'moldNo', label: '금형번호' },
  { id: 'start', label: '시작시간' },
  { id: 'end', label: '종료시간' },
  { id: 'duration', label: '소요시간' },
  { id: 'qty', label: '검수량' },
  { id: 'pass', label: '합격수' },
  { id: 'fail', label: '부적합수' },
  { id: 'failRate', label: '부적합률' },
  { id: 'scrapCost', label: '폐기금액' },
  { id: 'mainDefect', label: '주요 불량' },
  { id: 'rowClass', label: '상태' },
]

const sortKeys = BASE_COLUMNS.map((c) => ({ id: c.id, label: c.label }))

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

function cellValue(r: InspectionRecord, key: SortKey): string {
  const v = r[key]
  if (key === 'failRate' && typeof v === 'number') return formatPpm(v)
  if (key === 'scrapCost' && typeof v === 'number') return formatWon(v)
  if (key === 'qty' || key === 'pass' || key === 'fail') {
    return typeof v === 'number' ? v.toLocaleString() : String(v ?? '')
  }
  if (key === 'rowClass') return classLabel[r.rowClass]
  if (typeof v === 'number') return v.toLocaleString()
  if (Array.isArray(v)) return v.join(', ')
  if (v && typeof v === 'object') return JSON.stringify(v)
  return String(v ?? '')
}

export function ErrorData() {
  const { records, hasUploadedData, meta } = useData()
  const { isAdmin, openLogin } = useAdmin()
  const { pushToast } = useToast()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<InspectionRecord | null>(null)
  const [detail, setDetail] = useState<InspectionRecord | null>(null)
  const [editing, setEditing] = useState<InspectionRecord | null>(null)
  const [pageSize, setPageSize] = useState(50)

  const errorRecords = useMemo(() => filterErrorDataRecords(records), [records])
  const inspectionCount = useMemo(
    () => records.filter((r) => r.rowClass === 'ok' || r.rowClass === 'warn').length,
    [records],
  )

  const extraKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const r of errorRecords) {
      Object.keys(r.extras ?? {}).forEach((k) => keys.add(k))
    }
    return [...keys]
  }, [errorRecords])

  const defectKeys = useMemo(() => {
    const keys = new Set<string>()
    for (const r of errorRecords) {
      Object.keys(r.defects ?? {}).forEach((k) => keys.add(k))
    }
    return [...keys].sort((a, b) => a.localeCompare(b, 'ko'))
  }, [errorRecords])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = errorRecords.filter((r) => {
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
        r.worker,
        r.workType,
        r.rowClass,
        ...r.issues,
        ...Object.values(r.extras ?? {}),
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
  }, [errorRecords, query, sortKey, asc])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)
  const colCount = BASE_COLUMNS.length + extraKeys.length + defectKeys.length + 2

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setAsc((v) => !v)
    else {
      setSortKey(key)
      setAsc(true)
    }
  }

  const requestEdit = (record: InspectionRecord) => {
    if (!isAdmin) {
      pushToast('오류 DATA 수정은 관리자 모드에서만 가능합니다.', 'info')
      openLogin()
      return
    }
    setDetail(null)
    setEditing(record)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="오류 DATA"
        description={
          hasUploadedData
            ? `${meta.fileName ?? '업로드 파일'} · 오류 ${errorRecords.length.toLocaleString()}건 · 정상·경고 ${inspectionCount.toLocaleString()}건은 검사 DATA`
            : '오류(#N/A 등)로 분류된 행만 표시합니다. 정상·경고는 검사 DATA에서 확인하세요.'
        }
        actions={
          inspectionCount > 0 ? (
            <Link
              to="/data"
              className="inline-flex items-center gap-1.5 rounded-lg border border-accent/30 px-3 py-1.5 text-sm text-accent hover:bg-accent-soft"
            >
              검사 DATA {inspectionCount.toLocaleString()}건
            </Link>
          ) : null
        }
      />

      <div className="card border-danger/30 px-4 py-3 text-sm text-muted">
        {isAdmin
          ? '관리자 모드: 행을 더블클릭하거나 수정 버튼으로 오류 DATA를 편집할 수 있습니다. 수정 후 정상·경고로 바뀌면 검사 DATA로 이동합니다.'
          : '일반 모드: 조회만 가능합니다. 수정을 원하면 설정 → 관리자 모드에서 로그인해 주세요.'}
      </div>

      <SortSearchBar
        query={query}
        onQuery={(v) => {
          setQuery(v)
          setPage(1)
        }}
        placeholder="품번, 검사원, 이슈, 금형, 설비 검색"
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
        onDownload={() =>
          downloadExcel(
            '오류DATA.xlsx',
            filtered.map((r) => {
              const row: Record<string, string | number> = {
                이슈: r.issues.join(', '),
                검사일자: r.date,
                검사작업자: r.inspector,
                소속: r.team,
                작업구분: r.workType,
                'LOT NO': r.lot,
                성형작업자: r.worker,
                설비: r.equipment,
                제품유형: r.productType,
                품번: r.product,
                금형번호: r.moldNo,
                시작시간: r.start,
                종료시간: r.end,
                소요시간: r.duration,
                검수량: r.qty,
                합격수: r.pass,
                부적합수: r.fail,
                부적합률: r.failRate,
                폐기금액: r.scrapCost,
                주요불량: r.mainDefect,
                상태: classLabel[r.rowClass],
              }
              for (const k of extraKeys) row[k] = r.extras?.[k] ?? ''
              for (const k of defectKeys) row[k] = r.defects?.[k] ?? 0
              return row
            }),
          )
        }
        extra={
          <p className="num text-sm text-muted">
            오류 {errorRecords.length.toLocaleString()}건
            {filtered.length !== errorRecords.length
              ? ` · 검색 ${filtered.length.toLocaleString()}건`
              : null}
          </p>
        }
        resultTitle="오류 내역"
      >
        <DataEditToolbar
          selectionLabel={
            selected
              ? [
                  selected.date,
                  selected.product || '(품번 없음)',
                  selected.issues.slice(0, 2).join(', '),
                ]
                  .filter(Boolean)
                  .join(' · ')
              : null
          }
          emptyLabel="수정할 행을 클릭해 선택하세요. 더블클릭으로도 수정할 수 있습니다."
        >
          {selected ? (
            <span className={statusBadgeClass[selected.rowClass]}>{classLabel[selected.rowClass]}</span>
          ) : null}
          <DataEditButton
            isAdmin={isAdmin}
            canEdit={Boolean(selected)}
            onEdit={() => selected && requestEdit(selected)}
            onRequestLogin={() => {
              pushToast('오류 DATA 수정은 관리자 모드에서만 가능합니다.', 'info')
              openLogin()
            }}
            lockedTitle="오류 DATA 수정은 관리자 모드에서만 가능합니다."
            label="선택 행 수정"
            size="sm"
            tone="error"
          />
        </DataEditToolbar>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sticky-col">작업</th>
                <th>이슈</th>
                {BASE_COLUMNS.map((col) => (
                  <th
                    key={col.id}
                    className={['qty', 'pass', 'fail', 'failRate', 'scrapCost'].includes(col.id) ? 'num' : undefined}
                  >
                    <button type="button" onClick={() => toggleSort(col.id)}>
                      {col.label}
                      {sortKey === col.id ? (asc ? ' ↑' : ' ↓') : ''}
                    </button>
                  </th>
                ))}
                {extraKeys.map((k) => (
                  <th key={`extra-${k}`}>{k}</th>
                ))}
                {defectKeys.map((k) => (
                  <th key={`defect-${k}`} className="num">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={colCount} style={{ textAlign: 'center', padding: '40px 14px' }}>
                    {errorRecords.length === 0
                      ? '현재 오류로 분류된 행이 없습니다.'
                      : '검색 조건에 맞는 오류 행이 없습니다.'}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r)}
                    onDoubleClick={() => requestEdit(r)}
                    className={`pd-row-selectable ${isAdmin ? 'pd-row-editable' : ''} ${
                      selected?.id === r.id ? 'pd-row-selected' : ''
                    }`}
                  >
                    <td className="sticky-col" onClick={(e) => e.stopPropagation()}>
                      <DataRowSelectEdit
                        selected={selected?.id === r.id}
                        isAdmin={isAdmin}
                        tone="error"
                        onSelect={() => setSelected(r)}
                        onEdit={() => requestEdit(r)}
                        onRequestLogin={() => {
                          pushToast('오류 DATA 수정은 관리자 모드에서만 가능합니다.', 'info')
                          openLogin()
                        }}
                        lockedTitle="오류 DATA 수정은 관리자 모드에서만 가능합니다."
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.issues.length ? (
                          r.issues.map((issue) => (
                            <span key={issue} className="pd-status-badge pd-status-badge-error">
                              {issue}
                            </span>
                          ))
                        ) : (
                          <span>-</span>
                        )}
                      </div>
                    </td>
                    {BASE_COLUMNS.map((col) => (
                      <td
                        key={col.id}
                        className={
                          ['date', 'qty', 'pass', 'fail', 'failRate', 'scrapCost', 'moldNo', 'start', 'end'].includes(
                            col.id,
                          )
                            ? 'num'
                            : undefined
                        }
                      >
                        {col.id === 'rowClass' ? (
                          <span className={statusBadgeClass[r.rowClass]}>{classLabel[r.rowClass]}</span>
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
                    {extraKeys.map((k) => (
                      <td key={`extra-${k}`}>{r.extras?.[k] ?? '-'}</td>
                    ))}
                    {defectKeys.map((k) => (
                      <td key={`defect-${k}`} className="num">
                        {(r.defects?.[k] ?? 0).toLocaleString()}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <Pager page={safePage} totalPages={totalPages} total={filtered.length} onPage={setPage} />
      </SortSearchBar>

      {detail && (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink/20" onClick={() => setDetail(null)}>
          <aside
            className="h-full w-full max-w-md overflow-y-auto border-l border-line bg-surface p-5 shadow-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs text-muted">오류 상세</p>
                <h3 className="mt-1 text-lg font-semibold">{detail.product || '(품번 없음)'}</h3>
              </div>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg p-1.5 hover:bg-canvas">
                <X size={16} />
              </button>
            </div>
            <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2">
              <p className="text-xs font-medium text-danger">이슈</p>
              <p className="mt-1 text-sm text-ink">
                {detail.issues.length ? detail.issues.join(' · ') : '-'}
              </p>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {(
                [
                  ['검사일자', detail.date],
                  ['작업구분', detail.workType],
                  ['검사작업자', detail.inspector],
                  ['소속', detail.team],
                  ['제품유형', detail.productType || '-'],
                  ['LOT NO', detail.lot || '-'],
                  ['성형작업자', detail.worker || '-'],
                  ['설비', detail.equipment || '-'],
                  ['금형번호', detail.moldNo || '-'],
                  ['시작시간', detail.start || '-'],
                  ['종료시간', detail.end || '-'],
                  ['소요시간', detail.duration || '-'],
                  ['검수량', detail.qty.toLocaleString()],
                  ['합격수', detail.pass.toLocaleString()],
                  ['부적합수', detail.fail.toLocaleString()],
                  ['부적합률', formatPpm(detail.failRate)],
                  ['주요 불량', detail.mainDefect || '-'],
                  ['폐기금액', formatWon(detail.scrapCost)],
                  ['상태', classLabel[detail.rowClass]],
                  ...Object.entries(detail.extras ?? {}).map(([k, v]) => [k, v] as [string, string]),
                ] as [string, string][]
              ).map(([k, v]) => (
                <div key={k} className="rounded-lg border border-line px-3 py-2">
                  <dt className="text-xs text-muted">{k}</dt>
                  <dd className="mt-1 font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              onClick={() => requestEdit(detail)}
            >
              {isAdmin ? '이 행 수정' : '관리자 로그인 후 수정'}
            </button>
          </aside>
        </div>
      )}

      {editing ? (
        <EditInspectionRecordModal record={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}
