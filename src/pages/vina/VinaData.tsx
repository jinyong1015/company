import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../../components/common/PageHeader'
import { Pager } from '../../components/common/Pager'
import { SortSearchBar } from '../../components/common/SortSearchBar'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { filterInspectionDataRecords } from '../../lib/analyze'
import { downloadStyledExcel } from '../../lib/download'
import type { InspectionRecord } from '../../types'
import { formatPpm, formatWon } from '../../lib/format'

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

const classLabel = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '분석 제외',
} as const

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

export function VinaData() {
  const { records, hasUploadedData } = useVinaData()
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [asc, setAsc] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  const scoped = useMemo(() => filterInspectionDataRecords(records), [records])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = scoped.filter((r) => {
      if (!q) return true
      return (
        r.product.toLowerCase().includes(q) ||
        r.inspector.toLowerCase().includes(q) ||
        r.equipment.toLowerCase().includes(q) ||
        r.mainDefect.toLowerCase().includes(q) ||
        r.date.includes(q)
      )
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

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 검사 DATA" />
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
          placeholder="품번 / 검사자 / 설비 검색"
          sortKey={sortKey}
          sortKeys={COLUMNS.map((c) => ({ id: c.id, label: c.label }))}
          asc={asc}
          onSortKey={(v) => setSortKey(v as SortKey)}
          onToggleDir={() => setAsc((v) => !v)}
          pageSize={pageSize}
          onPageSize={(size) => {
            setPageSize(size)
            setPage(1)
          }}
          onDownload={() => {
            const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))
            void downloadStyledExcel(
              'VINA_검사DATA.xlsx',
              sorted.map((r) => {
                const unitPriceRaw = r.extras?.['단가']
                const unitPriceNum = unitPriceRaw != null && unitPriceRaw !== ''
                  ? Number(unitPriceRaw)
                  : NaN
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
                  상태: classLabel[r.rowClass],
                  이슈: (r.issues ?? []).join(', '),
                }
              }),
              { sheetName: 'VINA 검사DATA' },
            )
          }}
          resultTitle={`VINA 검사 DATA · ${rows.length.toLocaleString()}건`}
        >
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  {COLUMNS.map((c) => (
                    <th key={c.id} className="px-2 py-2 font-medium">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r) => (
                  <tr key={r.id} className="border-b border-line/70 hover:bg-canvas">
                    {COLUMNS.map((c) => (
                      <td
                        key={c.id}
                        className={`px-2 py-2 ${
                          c.id === 'qty' ||
                          c.id === 'fail' ||
                          c.id === 'failRate' ||
                          c.id === 'scrapCost'
                            ? 'num'
                            : ''
                        }`}
                      >
                        {cellValue(r, c.id)}
                      </td>
                    ))}
                  </tr>
                ))}
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
