import { useMemo, useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { summarizeProductPeriod, productsInPeriod, summarizeInspectorProductUph } from '../lib/analyze'
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

  const [uphStart, setUphStart] = useState(today)
  const [uphEnd, setUphEnd] = useState(today)
  const [uphProduct, setUphProduct] = useState('')
  const [inspA, setInspA] = useState('')
  const [inspB, setInspB] = useState('')

  const uphProducts = useMemo(
    () => productsInPeriod(records, uphStart, uphEnd, filters.analysisGroup),
    [records, uphStart, uphEnd, filters.analysisGroup],
  )
  const selectedUphProduct =
    uphProduct && uphProducts.includes(uphProduct) ? uphProduct : (uphProducts[0] ?? '')

  const productInspectorRows = useMemo(
    () =>
      summarizeInspectorProductUph(
        records,
        selectedUphProduct,
        uphStart,
        uphEnd,
        filters.analysisGroup,
      ),
    [records, selectedUphProduct, uphStart, uphEnd, filters.analysisGroup],
  )

  const inspectorNamesForProduct = useMemo(
    () => productInspectorRows.map((r) => r.inspector),
    [productInspectorRows],
  )

  const activeInspA =
    inspectorNamesForProduct.includes(inspA)
      ? inspA
      : (inspectorNamesForProduct[0] ?? '')
  const activeInspB =
    inspectorNamesForProduct.includes(inspB)
      ? inspB
      : (inspectorNamesForProduct[1] ?? inspectorNamesForProduct[0] ?? '')

  const iA = productInspectorRows.find((r) => r.inspector === activeInspA)
  const iB = productInspectorRows.find((r) => r.inspector === activeInspB)
  const uphRangeLabel = formatDotRange(uphStart, uphEnd)

  return (
    <div className="space-y-5">
      <PageHeader
        title="스마트 비교"
        description="품번 기간 비교와 기간·품번별 검사자 UPH를 비교합니다."
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

      <Panel
        title="기간·품번 → 검사자 UPH 비교"
        description="기간과 품번을 고른 뒤 검사자 A·B UPH를 비교합니다. (전역 분석 그룹 적용 · 헤더 기간 무관)"
      >
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line px-3 py-2">
            <span className="mb-1 text-xs font-medium text-ink">1. 기간</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              시작
              <input
                type="date"
                value={uphStart}
                onChange={(e) => {
                  setUphStart(e.target.value)
                  setInspA('')
                  setInspB('')
                }}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <span className="self-end pb-2 text-sm text-muted">~</span>
            <label className="flex flex-col gap-1 text-xs text-muted">
              종료
              <input
                type="date"
                value={uphEnd}
                onChange={(e) => {
                  setUphEnd(e.target.value)
                  setInspA('')
                  setInspB('')
                }}
                className="rounded-lg border border-line px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>

          <span className="self-center text-sm text-muted">→</span>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            2. 품번
            <select
              value={selectedUphProduct}
              onChange={(e) => {
                setUphProduct(e.target.value)
                setInspA('')
                setInspB('')
              }}
              className="min-w-[200px] rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink"
              disabled={!uphProducts.length}
            >
              {!uphProducts.length ? (
                <option value="">선택 가능한 품번 없음</option>
              ) : (
                uphProducts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))
              )}
            </select>
          </label>

          <span className="self-center text-sm text-muted">→</span>

          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            3. 검사자 A
            <select
              value={activeInspA}
              onChange={(e) => setInspA(e.target.value)}
              className="min-w-[160px] rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink"
              disabled={!inspectorNamesForProduct.length}
            >
              {inspectorNamesForProduct.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <span className="self-center text-sm font-medium text-muted">VS</span>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            검사자 B
            <select
              value={activeInspB}
              onChange={(e) => setInspB(e.target.value)}
              className="min-w-[160px] rounded-lg border border-line bg-white px-3 py-2 text-sm font-normal text-ink"
              disabled={!inspectorNamesForProduct.length}
            >
              {inspectorNamesForProduct.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {!selectedUphProduct || !productInspectorRows.length ? (
          <p className="text-sm text-muted">
            선택한 기간·품번·분석 그룹에서 비교할 검사자 DATA가 없습니다.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              집계 기간 <span className="font-medium text-ink">{uphRangeLabel}</span>
              <span className="mx-1.5">·</span>
              품번 <span className="font-medium text-ink">{selectedUphProduct}</span>
            </p>
            <div className="mb-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-2 py-2 font-medium">지표</th>
                    <th className="px-2 py-2 font-medium">
                      {iA?.inspector ?? activeInspA}
                      {iA ? <span className="ml-1 font-normal text-muted">({iA.team})</span> : null}
                    </th>
                    <th className="px-2 py-2 font-medium">
                      {iB?.inspector ?? activeInspB}
                      {iB ? <span className="ml-1 font-normal text-muted">({iB.team})</span> : null}
                    </th>
                    <th className="px-2 py-2 font-medium">차이 (A − B)</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      key: 'UPH',
                      a: iA?.uph ?? 0,
                      b: iB?.uph ?? 0,
                      format: (n: number) => n.toLocaleString(),
                      delta: (a: number, b: number) => deltaQty(a, b),
                    },
                    {
                      key: '검수량',
                      a: iA?.qty ?? 0,
                      b: iB?.qty ?? 0,
                      format: (n: number) => n.toLocaleString(),
                      delta: (a: number, b: number) => `${deltaQty(a, b)} EA`,
                    },
                    {
                      key: '부적합수량',
                      a: iA?.fail ?? 0,
                      b: iB?.fail ?? 0,
                      format: (n: number) => n.toLocaleString(),
                      delta: (a: number, b: number) => deltaQty(a, b),
                    },
                    {
                      key: '부적합률',
                      a: iA?.failRate ?? 0,
                      b: iB?.failRate ?? 0,
                      format: (n: number) => formatPpm(n),
                      delta: (a: number, b: number) => formatPpmDelta(a - b),
                    },
                    {
                      key: '소요시간(분)',
                      a: iA?.minutes ?? 0,
                      b: iB?.minutes ?? 0,
                      format: (n: number) => n.toLocaleString(),
                      delta: (a: number, b: number) => deltaQty(a, b),
                    },
                  ].map((row) => (
                    <tr
                      key={row.key}
                      className={`border-b border-line/70 ${row.key === 'UPH' ? 'bg-accent-soft/60' : ''}`}
                    >
                      <td className="px-2 py-2.5 font-medium">{row.key}</td>
                      <td className={`num px-2 py-2.5 ${row.key === 'UPH' ? 'font-semibold text-accent' : ''}`}>
                        {row.format(row.a)}
                      </td>
                      <td className={`num px-2 py-2.5 ${row.key === 'UPH' ? 'font-semibold text-accent' : ''}`}>
                        {row.format(row.b)}
                      </td>
                      <td className="num px-2 py-2.5">{row.delta(row.a, row.b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mb-2 text-xs font-medium text-muted">
              {selectedUphProduct} · {uphRangeLabel} · 검사자별 UPH (높은 순)
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-[720px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs text-muted">
                    <th className="px-2 py-2 font-medium">순위</th>
                    <th className="px-2 py-2 font-medium">검사자</th>
                    <th className="px-2 py-2 font-medium">소속</th>
                    <th className="px-2 py-2 font-medium">검수량</th>
                    <th className="px-2 py-2 font-medium">부적합률</th>
                    <th className="px-2 py-2 font-medium">소요시간(분)</th>
                    <th className="px-2 py-2 font-medium">UPH</th>
                  </tr>
                </thead>
                <tbody>
                  {productInspectorRows.map((row, idx) => {
                    const highlight =
                      row.inspector === activeInspA || row.inspector === activeInspB
                    return (
                      <tr
                        key={row.id}
                        className={`border-b border-line/70 ${highlight ? 'bg-accent-soft/50' : ''}`}
                      >
                        <td className="num px-2 py-2.5 text-muted">{idx + 1}</td>
                        <td className="px-2 py-2.5 font-medium">{row.inspector}</td>
                        <td className="px-2 py-2.5">{row.team}</td>
                        <td className="num px-2 py-2.5">{row.qty.toLocaleString()}</td>
                        <td className="num px-2 py-2.5">{formatPpm(row.failRate)}</td>
                        <td className="num px-2 py-2.5">{row.minutes.toLocaleString()}</td>
                        <td className="num px-2 py-2.5 font-semibold">{row.uph.toLocaleString()}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  )
}
