import { useMemo, useState } from 'react'
import type { InspectionRecord } from '../../types'

const MAX_DEFECTS = 10

type Cell = {
  equipment: string
  defect: string
  count: number
}

type DisplayRow =
  | { kind: 'equipment'; name: string }
  | {
      kind: 'subtotal'
      id: 'plant1' | 'plant2'
      label: string
      members: string[]
    }

function heatFill(count: number, max: number): string {
  if (count <= 0 || max <= 0)
    return 'color-mix(in srgb, var(--app-bg) 88%, var(--border))'
  const t = Math.min(1, count / max)
  // 연한 앰버 → 진한 적갈 (발생 정도)
  const r = Math.round(254 - t * 100)
  const g = Math.round(243 - t * 180)
  const b = Math.round(199 - t * 170)
  return `rgb(${r}, ${g}, ${b})`
}

function heatText(count: number, max: number): string {
  if (count <= 0) return 'var(--text-secondary)'
  return count / max > 0.55 ? '#fff7ed' : '#7c2d12'
}

/** 히트맵 설비 행 그룹: 미지정 → 1공장 → 성형S → 2공장 → 기타 */
function equipmentGroupRank(name: string): number {
  const n = name.trim()
  if (!n || n === '미지정') return 0
  if (n.includes('1공장')) return 1
  if (/성형\s*S/i.test(n)) return 2
  if (n.includes('2공장')) return 3
  return 4
}

function compareEquipmentName(a: string, b: string) {
  const ga = equipmentGroupRank(a)
  const gb = equipmentGroupRank(b)
  if (ga !== gb) return ga - gb
  return a.localeCompare(b, 'ko', { numeric: true, sensitivity: 'base' })
}

function buildDisplayRows(equipmentRows: string[]): DisplayRow[] {
  const byRank: string[][] = [[], [], [], [], []]
  for (const name of equipmentRows) {
    byRank[equipmentGroupRank(name)].push(name)
  }

  const rows: DisplayRow[] = []
  for (const name of byRank[0]) rows.push({ kind: 'equipment', name })
  for (const name of byRank[1]) rows.push({ kind: 'equipment', name })
  for (const name of byRank[2]) rows.push({ kind: 'equipment', name })

  const plant1Members = [...byRank[1], ...byRank[2]]
  if (plant1Members.length > 0) {
    rows.push({
      kind: 'subtotal',
      id: 'plant1',
      label: '1공장 소계',
      members: plant1Members,
    })
  }

  for (const name of byRank[3]) rows.push({ kind: 'equipment', name })
  if (byRank[3].length > 0) {
    rows.push({
      kind: 'subtotal',
      id: 'plant2',
      label: '2공장 소계',
      members: byRank[3],
    })
  }

  for (const name of byRank[4]) rows.push({ kind: 'equipment', name })
  return rows
}

export function buildEquipmentDefectMatrix(records: InspectionRecord[]) {
  const eqDefect = new Map<string, Map<string, number>>()
  const defectTotalsAll = new Map<string, number>()
  const equipmentSet = new Set<string>()

  for (const r of records) {
    const eq = r.equipment?.trim() || '미지정'
    equipmentSet.add(eq)
    const defects = r.defects ?? {}
    for (const [name, raw] of Object.entries(defects)) {
      const count = Number(raw) || 0
      if (count <= 0) continue
      const defect = name.trim() || '기타'
      if (!eqDefect.has(eq)) eqDefect.set(eq, new Map())
      const row = eqDefect.get(eq)!
      row.set(defect, (row.get(defect) ?? 0) + count)
      defectTotalsAll.set(defect, (defectTotalsAll.get(defect) ?? 0) + count)
    }
  }

  const defectCols = [...defectTotalsAll.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_DEFECTS)
    .map(([name]) => name)

  // 미지정 → 1공장 → 성형S → 2공장 순, 그룹 내 자연 정렬
  const equipmentRows = [...equipmentSet].sort(compareEquipmentName)
  const displayRows = buildDisplayRows(equipmentRows)

  let max = 0
  const cells: Cell[] = []
  const rowTotals = new Map<string, number>()
  const colTotals = new Map<string, number>()

  for (const equipment of equipmentRows) {
    const row = eqDefect.get(equipment)
    let rowSum = 0
    for (const defect of defectCols) {
      const count = row?.get(defect) ?? 0
      if (count > max) max = count
      cells.push({ equipment, defect, count })
      rowSum += count
      colTotals.set(defect, (colTotals.get(defect) ?? 0) + count)
    }
    rowTotals.set(equipment, rowSum)
  }

  const subtotalCells = new Map<string, number>()
  const subtotalRowTotals = new Map<string, number>()
  for (const row of displayRows) {
    if (row.kind !== 'subtotal') continue
    let rowSum = 0
    for (const defect of defectCols) {
      let sum = 0
      for (const eq of row.members) {
        sum += cellCount(cells, eq, defect)
      }
      subtotalCells.set(`${row.id}||${defect}`, sum)
      rowSum += sum
    }
    subtotalRowTotals.set(row.id, rowSum)
  }

  let grandTotal = 0
  for (const v of rowTotals.values()) grandTotal += v

  return {
    equipmentRows,
    displayRows,
    defectCols,
    cells,
    max,
    rowTotals,
    colTotals,
    subtotalCells,
    subtotalRowTotals,
    grandTotal,
  }
}

function cellCount(cells: Cell[], equipment: string, defect: string) {
  for (const c of cells) {
    if (c.equipment === equipment && c.defect === defect) return c.count
  }
  return 0
}

export function EquipmentDefectHeatmap({
  records,
}: {
  records: InspectionRecord[]
}) {
  const [hover, setHover] = useState<Cell | null>(null)

  const {
    equipmentRows,
    displayRows,
    defectCols,
    cells,
    max,
    rowTotals,
    colTotals,
    subtotalCells,
    subtotalRowTotals,
    grandTotal,
  } = useMemo(() => buildEquipmentDefectMatrix(records), [records])

  const cellMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cells) m.set(`${c.equipment}||${c.defect}`, c.count)
    return m
  }, [cells])

  if (!equipmentRows.length || !defectCols.length) {
    return (
      <div className="flex min-h-[240px] items-center justify-center text-sm text-muted">
        표시할 설비·불량 유형 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[min(70vh,560px)] overflow-auto">
        <table className="w-full min-w-[560px] border-separate border-spacing-1 text-left">
          <thead className="sticky top-0 z-[2]">
            <tr>
              <th className="sticky left-0 z-[3] bg-[var(--card)] px-2 py-1.5 text-[11px] font-medium text-muted">
                설비 \ 불량
              </th>
              {defectCols.map((d) => (
                <th
                  key={d}
                  className="max-w-[72px] bg-[var(--card)] px-1 py-1.5 text-center text-[10px] font-medium leading-tight text-muted"
                  title={d}
                >
                  <span className="line-clamp-2">{d}</span>
                </th>
              ))}
              <th className="eq-heat-col-sum-head px-2 py-1.5 text-center text-[10px]">
                합계
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              if (row.kind === 'subtotal') {
                const rowSum = subtotalRowTotals.get(row.id) ?? 0
                const accent =
                  row.id === 'plant1'
                    ? 'color-mix(in srgb, #22c55e 55%, #38bdf8)'
                    : '#a78bfa'
                const hint =
                  row.id === 'plant1' ? '1공장 + 성형S' : '2공장'
                return (
                  <tr
                    key={`sub-${row.id}`}
                    className="eq-heat-subtotal"
                    style={{ ['--eq-heat-accent' as string]: accent }}
                  >
                    <th title={`${row.label} (${hint})`}>
                      <span className="eq-heat-subtotal-label">
                        <span className="eq-heat-subtotal-bar" aria-hidden />
                        <span className="truncate">
                          {row.id === 'plant1' ? '1공장' : '2공장'}
                        </span>
                        <span className="eq-heat-subtotal-chip">소계</span>
                      </span>
                    </th>
                    {defectCols.map((defect) => {
                      const count =
                        subtotalCells.get(`${row.id}||${defect}`) ?? 0
                      return (
                        <td
                          key={`${row.id}-${defect}`}
                          title={`${row.label} · ${defect}: ${count.toLocaleString()}`}
                        >
                          <div className="eq-heat-subtotal-cell">
                            {count > 0 ? count.toLocaleString() : '·'}
                          </div>
                        </td>
                      )
                    })}
                    <td>
                      <div className="eq-heat-subtotal-cell eq-heat-subtotal-sum">
                        {rowSum > 0 ? rowSum.toLocaleString() : '·'}
                      </div>
                    </td>
                  </tr>
                )
              }

              const eq = row.name
              const rowSum = rowTotals.get(eq) ?? 0
              return (
                <tr key={eq}>
                  <th
                    className="sticky left-0 z-[1] max-w-[140px] truncate bg-[var(--card)] px-2 py-1 text-left text-xs font-semibold text-ink"
                    title={eq}
                  >
                    {eq}
                  </th>
                  {defectCols.map((defect) => {
                    const count = cellMap.get(`${eq}||${defect}`) ?? 0
                    return (
                      <td key={`${eq}-${defect}`} className="p-0">
                        <button
                          type="button"
                          className="flex h-9 w-full min-w-[48px] items-center justify-center rounded-md text-[11px] font-semibold tabular-nums transition-transform hover:scale-[1.04] hover:ring-1 hover:ring-accent/40"
                          style={{
                            background: heatFill(count, max),
                            color: heatText(count, max),
                          }}
                          onMouseEnter={() =>
                            setHover({ equipment: eq, defect, count })
                          }
                          onMouseLeave={() => setHover(null)}
                          title={`${eq} · ${defect}: ${count.toLocaleString()}`}
                        >
                          {count > 0 ? count.toLocaleString() : '·'}
                        </button>
                      </td>
                    )
                  })}
                  <td className="p-0">
                    <div className="eq-heat-row-sum">
                      {rowSum > 0 ? rowSum.toLocaleString() : '·'}
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr className="eq-heat-total">
              <th>
                <span className="eq-heat-total-label">
                  전체
                  <span className="eq-heat-total-chip">합계</span>
                </span>
              </th>
              {defectCols.map((defect) => {
                const sum = colTotals.get(defect) ?? 0
                return (
                  <td key={`total-${defect}`}>
                    <div className="eq-heat-total-cell">
                      {sum > 0 ? sum.toLocaleString() : '·'}
                    </div>
                  </td>
                )
              })}
              <td>
                <div className="eq-heat-total-cell eq-heat-total-sum">
                  {grandTotal > 0 ? grandTotal.toLocaleString() : '·'}
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
        <p>
          {hover
            ? `${hover.equipment} · ${hover.defect}: ${hover.count.toLocaleString()}건`
            : `설비 ${equipmentRows.length}개 · 불량 유형 상위 ${defectCols.length} · 합계 ${grandTotal.toLocaleString()}건`}
        </p>
        <div className="inline-flex items-center gap-1.5">
          <span>적음</span>
          <span
            className="h-2.5 w-16 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, rgb(254,243,199), rgb(154,63,29))',
            }}
          />
          <span>많음</span>
        </div>
      </div>
    </div>
  )
}
