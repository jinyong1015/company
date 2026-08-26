import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { summarizeProductPeriod } from '../lib/analyze'
import { ANALYSIS_GROUPS, type AnalysisGroupId } from '../lib/groups'
import { formatPpm, formatPpmDelta, formatWon } from '../lib/format'

/** 2026-08-10 → 2026.08.10~2026.08.20 */
function formatDotRange(start: string, end: string) {
  const toDot = (d: string) => d.replaceAll('-', '.')
  if (!start && !end) return '기간 미지정'
  if (start && end) return `${toDot(start)}~${toDot(end)}`
  if (start) return `${toDot(start)}~`
  return `~${toDot(end)}`
}

function todayYmd() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const ALL_PRODUCTS = '__all__'

function deltaQty(a: number, b: number) {
  const d = a - b
  const sign = d > 0 ? '+' : ''
  return `${sign}${d.toLocaleString()}`
}

function formatWonDelta(a: number, b: number) {
  const d = Math.round(a - b)
  if (d === 0) return '₩0'
  const sign = d > 0 ? '+' : '-'
  return `${sign}₩${Math.abs(d).toLocaleString('ko-KR')}`
}

function PairCell({ left, right }: { left: string; right: string }) {
  return (
    <td className="num px-2 py-2.5 text-center whitespace-nowrap">
      <span>{left}</span>
      <span className="mx-1.5 text-muted">|</span>
      <span>{right}</span>
    </td>
  )
}

export function SmartCompare() {
  const { analytics, records } = useData()
  const { filters } = useFilters()

  const products = useMemo(() => {
    const list =
      analytics.filterOptions.products.length > 0
        ? analytics.filterOptions.products
        : analytics.products.map((p) => p.name)
    return [...new Set(list.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'ko'),
    )
  }, [analytics.filterOptions.products, analytics.products])

  const [product, setProduct] = useState(ALL_PRODUCTS)
  const [today] = useState(todayYmd)
  const [periodAStart, setPeriodAStart] = useState(today)
  const [periodAEnd, setPeriodAEnd] = useState(today)
  const [periodBStart, setPeriodBStart] = useState(today)
  const [periodBEnd, setPeriodBEnd] = useState(today)

  const selectedProduct =
    product === ALL_PRODUCTS || products.includes(product)
      ? product
      : ALL_PRODUCTS

  const summaryA = useMemo(
    () =>
      summarizeProductPeriod(
        records,
        selectedProduct,
        periodAStart,
        periodAEnd,
        filters.analysisGroup,
      ),
    [records, selectedProduct, periodAStart, periodAEnd, filters.analysisGroup],
  )
  const summaryB = useMemo(
    () =>
      summarizeProductPeriod(
        records,
        selectedProduct,
        periodBStart,
        periodBEnd,
        filters.analysisGroup,
      ),
    [records, selectedProduct, periodBStart, periodBEnd, filters.analysisGroup],
  )

  const productLabel =
    selectedProduct === ALL_PRODUCTS ? '전체' : selectedProduct

  const rangeA = formatDotRange(periodAStart, periodAEnd)
  const rangeB = formatDotRange(periodBStart, periodBEnd)

  const [left, setLeft] = useState<AnalysisGroupId>('seal')
  const [right, setRight] = useState<AnalysisGroupId>('hydraulic')
  const [inspA, setInspA] = useState(analytics.inspectors[0]?.name ?? '')
  const [inspB, setInspB] = useState(analytics.inspectors[1]?.name ?? '')
  const [eqA, setEqA] = useState(analytics.equipment[0]?.name ?? '')
  const [eqB, setEqB] = useState(analytics.equipment[1]?.name ?? '')
  const types = [...new Set(analytics.products.map((p) => p.type))]
  const [typeA, setTypeA] = useState(types[0] ?? '')
  const [typeB, setTypeB] = useState(types[1] ?? types[0] ?? '')

  const gA = analytics.groupSummaries.find((g) => g.id === left)
  const gB = analytics.groupSummaries.find((g) => g.id === right)
  const iA = analytics.inspectors.find((i) => i.name === inspA)
  const iB = analytics.inspectors.find((i) => i.name === inspB)
  const eA = analytics.equipment.find((e) => e.name === eqA)
  const eB = analytics.equipment.find((e) => e.name === eqB)

  return (
    <div className="space-y-5">
      <PageHeader
        title="스마트 비교"
        description="품번 기간 비교, 분석 그룹·검사자·설비 간 품질과 효율을 비교합니다."
      />

      <Panel
        title="품번 기간 비교"
        description="품번과 두 기간을 지정하면 바로 검수량·부적합률·부적합수량·폐기비용을 비교합니다. (전역 분석 그룹 적용 · 헤더 기간 무관)"
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            품번
            <select
              value={selectedProduct}
              onChange={(e) => setProduct(e.target.value)}
              className="min-w-[200px] rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink"
            >
              <option value={ALL_PRODUCTS}>전체</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line px-3 py-2">
            <span className="mb-1 text-xs font-medium text-ink">기간 A</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              시작
              <input
                type="date"
                value={periodAStart}
                onChange={(e) => setPeriodAStart(e.target.value)}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <span className="self-end pb-2 text-sm text-muted">~</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              종료
              <input
                type="date"
                value={periodAEnd}
                onChange={(e) => setPeriodAEnd(e.target.value)}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>

          <span className="self-center text-sm font-medium text-muted">VS</span>

          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line px-3 py-2">
            <span className="mb-1 text-xs font-medium text-ink">기간 B</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              시작
              <input
                type="date"
                value={periodBStart}
                onChange={(e) => setPeriodBStart(e.target.value)}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <span className="self-end pb-2 text-sm text-muted">~</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              종료
              <input
                type="date"
                value={periodBEnd}
                onChange={(e) => setPeriodBEnd(e.target.value)}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>
        </div>

        {!summaryA || !summaryB ? (
          <p className="text-sm text-muted">비교할 DATA가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-sm">
              <colgroup>
                <col className="w-[160px]" />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 text-left font-medium" rowSpan={2}>
                    품번
                  </th>
                  <th
                    className="px-2 py-1.5 text-center font-normal"
                    colSpan={4}
                  >
                    <span className="font-medium text-ink">{rangeA}</span>
                    <span className="mx-2 text-muted">|</span>
                    <span className="font-medium text-ink">{rangeB}</span>
                  </th>
                </tr>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 text-center font-medium">검수량</th>
                  <th className="px-2 py-2 text-center font-medium">부적합률</th>
                  <th className="px-2 py-2 text-center font-medium">부적합수량</th>
                  <th className="px-2 py-2 text-center font-medium">폐기비용</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/70">
                  <td className="px-2 py-2.5 text-left font-medium">
                    {productLabel}
                  </td>
                  <PairCell
                    left={`${summaryA.qty.toLocaleString()} EA`}
                    right={`${summaryB.qty.toLocaleString()} EA`}
                  />
                  <PairCell
                    left={formatPpm(summaryA.failRate)}
                    right={formatPpm(summaryB.failRate)}
                  />
                  <PairCell
                    left={summaryA.fail.toLocaleString()}
                    right={summaryB.fail.toLocaleString()}
                  />
                  <PairCell
                    left={formatWon(summaryA.scrapCost)}
                    right={formatWon(summaryB.scrapCost)}
                  />
                </tr>
                <tr className="border-b border-line/70 bg-canvas/60">
                  <td className="px-2 py-2.5 text-left font-medium text-muted">
                    차이 (A − B)
                  </td>
                  <td className="num px-2 py-2.5 text-center">
                    {deltaQty(summaryA.qty, summaryB.qty)} EA
                  </td>
                  <td className="num px-2 py-2.5 text-center">
                    {formatPpmDelta(summaryA.failRate - summaryB.failRate)}
                  </td>
                  <td className="num px-2 py-2.5 text-center">
                    {deltaQty(summaryA.fail, summaryB.fail)}
                  </td>
                  <td className="num px-2 py-2.5 text-center">
                    {formatWonDelta(summaryA.scrapCost, summaryB.scrapCost)}
                  </td>
                </tr>
              </tbody>
            </table>
            {summaryA.recordCount === 0 && summaryB.recordCount === 0 ? (
              <p className="mt-3 text-sm text-muted">
                선택한 품번·기간에 DATA가 없습니다. 날짜 또는 분석 그룹을 확인해 주세요.
              </p>
            ) : null}
          </div>
        )}
      </Panel>

      <Panel title="그룹 비교">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={left} onChange={(e) => setLeft(e.target.value as AnalysisGroupId)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {ANALYSIS_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <span className="self-center text-sm text-muted">VS</span>
          <select value={right} onChange={(e) => setRight(e.target.value as AnalysisGroupId)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {ANALYSIS_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-2 py-2">지표</th>
              <th className="px-2 py-2">{gA?.label}</th>
              <th className="px-2 py-2">{gB?.label}</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['검수량', gA?.qty.toLocaleString(), gB?.qty.toLocaleString()],
              ['부적합률', `${formatPpm(gA?.failRate)}`, `${formatPpm(gB?.failRate)}`],
              ['부적합수량', gA?.fail.toLocaleString(), gB?.fail.toLocaleString()],
              ['폐기비용', formatWon(gA?.scrapCost), formatWon(gB?.scrapCost)],
            ].map(([k, a, b]) => (
              <tr key={String(k)} className="border-b border-line/70">
                <td className="px-2 py-2.5">{k}</td>
                <td className="num px-2 py-2.5">{a}</td>
                <td className="num px-2 py-2.5">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="검사자 비교 → 품번별 검사량">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={inspA} onChange={(e) => setInspA(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {analytics.inspectors.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
          <span className="self-center text-sm text-muted">VS</span>
          <select value={inspB} onChange={(e) => setInspB(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {analytics.inspectors.map((i) => <option key={i.id} value={i.name}>{i.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[iA, iB].map((insp) => (
            <div key={insp?.id ?? 'x'} className="rounded-lg border border-line p-3">
              <p className="mb-2 font-medium">{insp?.name}</p>
              <ul className="space-y-1 text-sm">
                {insp?.products.slice(0, 6).map((p) => (
                  <li key={p.product} className="flex justify-between">
                    <span>{p.product}</span>
                    <span className="num">{p.qty.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="설비 비교 → 품번별 검사량/부적합률">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={eqA} onChange={(e) => setEqA(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {analytics.equipment.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
          <span className="self-center text-sm text-muted">VS</span>
          <select value={eqB} onChange={(e) => setEqB(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {analytics.equipment.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[eA, eB].map((eq) => (
            <div key={eq?.id ?? 'y'} className="rounded-lg border border-line p-3">
              <p className="mb-2 font-medium">{eq?.name} · 부적합률 {formatPpm(eq?.failRate)}</p>
              <ul className="space-y-1 text-sm">
                {eq?.products.slice(0, 6).map((p) => (
                  <li key={p.product} className="flex justify-between">
                    <span>{p.product}</span>
                    <span className="num">{p.qty.toLocaleString()} / {formatPpm(p.failRate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="제품유형 비교 → 품번별 품질">
        <div className="mb-3 flex flex-wrap gap-2">
          <select value={typeA} onChange={(e) => setTypeA(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="self-center text-sm text-muted">VS</span>
          <select value={typeB} onChange={(e) => setTypeB(e.target.value)} className="rounded-lg border border-line px-3 py-2 text-sm">
            {types.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[typeA, typeB].map((type) => {
            const items = analytics.products.filter((p) => p.type === type).slice(0, 6)
            return (
              <div key={type || 'type'} className="rounded-lg border border-line p-3">
                <p className="mb-2 font-medium">{type || '미지정'}</p>
                <ul className="space-y-1 text-sm">
                  {items.map((p) => (
                    <li key={p.id} className="flex justify-between">
                      <span>{p.name}</span>
                      <span className="num">{p.qty.toLocaleString()} / {formatPpm(p.failRate)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
