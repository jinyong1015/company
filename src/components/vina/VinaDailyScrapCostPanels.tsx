import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarDays, PackageSearch, Search, X } from 'lucide-react'
import { Panel } from '../common/Panel'
import { buildPeriodTrends } from '../../lib/analyze'
import type { FilterState } from '../../context/FilterContext'
import { formatWon, formatWonSuffix, roundWon } from '../../lib/format'
import { isAnalyzable } from '../../lib/groups'
import {
  itemMatchKey,
  preferDisplayItem,
  sameItemMatchKey,
} from '../../lib/itemMatchKey'
import { monthKeyToDateRange } from '../../lib/weeklyReport'
import type { DailyTrend, InspectionRecord } from '../../types'

const LINE_COLOR = '#d97706'
const LINE_SOFT = 'rgba(217, 119, 6, 0.12)'

function formatTrendAxisLabel(label: string, grain: 'day' | 'month') {
  if (grain === 'month') return label
  return label.replace('-', '/')
}

function monthLabelOf(monthKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  return `${m[1].slice(2)}.${m[2]}`
}

function monthTitleOf(monthKey: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!m) return monthKey
  return `${m[1]}년 ${Number(m[2])}월`
}

function listMonthKeys(records: InspectionRecord[]): string[] {
  const set = new Set<string>()
  for (const r of records) {
    if (!r.date || r.date.length < 7) continue
    set.add(r.date.slice(0, 7))
  }
  return [...set].sort((a, b) => b.localeCompare(a))
}

function listProductsInMonth(
  records: InspectionRecord[],
  monthKey: string,
): string[] {
  if (!monthKey) return []
  const map = new Map<string, string[]>()
  for (const r of records) {
    if (!r.date.startsWith(monthKey)) continue
    const name = r.product?.trim()
    if (!name) continue
    const key = itemMatchKey(name) || name
    const list = map.get(key) ?? []
    list.push(name)
    map.set(key, list)
  }
  return [...map.values()]
    .map((names) => preferDisplayItem(names))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'ko'))
}

function customMonthFilters(monthKey: string): FilterState | null {
  const range = monthKeyToDateRange(monthKey)
  if (!range) return null
  return {
    analysisGroup: 'all',
    period: 'custom',
    startDate: range.startDate,
    endDate: range.endDate,
    teams: [],
    inspectors: [],
    workTypes: [],
    productTypes: [],
    products: [],
    molds: [],
    equipment: [],
    workers: [],
    lots: [],
  }
}

function ScrapCostLineChart({
  data,
  grain,
}: {
  data: Array<{ date: string; scrapCost: number; fail: number }>
  grain: 'day' | 'month'
}) {
  const showLabels = data.length <= 15
  const maxCost = Math.max(0, ...data.map((d) => d.scrapCost))
  const axisWidth = Math.max(
    56,
    Math.min(
      96,
      `${Math.round(maxCost).toLocaleString('ko-KR')}`.length * 8 + 18,
    ),
  )

  return (
    <div className="h-[280px] rounded-2xl border border-line/80 bg-gradient-to-b from-amber-50/40 to-white px-2 pt-3 pb-1">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: showLabels ? 28 : 12, right: 28, left: 8, bottom: 4 }}
        >
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            padding={{ left: 20, right: 20 }}
            tickFormatter={(v) => formatTrendAxisLabel(String(v), grain)}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#5b6577' }}
            axisLine={false}
            tickLine={false}
            width={axisWidth}
            tickFormatter={(v) => Number(v).toLocaleString('ko-KR')}
          />
          <Tooltip
            contentStyle={{
              border: '1px solid #e2e6ec',
              borderRadius: 12,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              fontSize: 12,
            }}
            labelFormatter={(label) =>
              formatTrendAxisLabel(String(label), grain)
            }
            formatter={(value, name) => {
              const n = Number(value ?? 0)
              if (name === 'fail') {
                return [`${n.toLocaleString('ko-KR')} EA`, '불량수량']
              }
              return [formatWonSuffix(n), '불량금액']
            }}
          />
          <Line
            type="monotone"
            dataKey="scrapCost"
            name="scrapCost"
            stroke={LINE_COLOR}
            strokeWidth={2.4}
            dot={{ r: 3.5, fill: LINE_COLOR, stroke: '#fff', strokeWidth: 1.5 }}
            activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }}
          >
            {showLabels ? (
              <LabelList
                dataKey="scrapCost"
                position="top"
                offset={8}
                fill="#92400e"
                fontSize={10}
                fontWeight={600}
                formatter={(v: unknown) => {
                  const n = Number(v)
                  if (!n) return ''
                  return roundWon(n).toLocaleString('ko-KR')
                }}
              />
            ) : null}
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function DailyScrapTable({
  rows,
  grain,
  showFail,
}: {
  rows: DailyTrend[]
  grain: 'day' | 'month'
  showFail?: boolean
}) {
  const visible = rows.filter((r) => r.scrapCost > 0 || r.fail > 0)
  if (!visible.length) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-10 text-center">
        <p className="text-sm font-medium text-ink">표시할 불량금액이 없습니다</p>
        <p className="mt-1 text-xs text-muted">
          선택한 조건에 NG금액(폐기금액) 데이터가 없습니다.
        </p>
      </div>
    )
  }

  return (
    <div className="max-h-[300px] overflow-auto rounded-2xl border border-line bg-white shadow-sm">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-[1] bg-slate-50/95 backdrop-blur-sm">
          <tr className="border-b border-line text-xs text-muted">
            <th className="px-3.5 py-2.5 font-semibold">
              {grain === 'month' ? '월' : '날짜'}
            </th>
            {showFail ? (
              <th className="px-3.5 py-2.5 font-semibold text-right">
                불량수량
              </th>
            ) : null}
            <th className="px-3.5 py-2.5 font-semibold text-right">불량금액</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row, i) => (
            <tr
              key={row.date}
              className={`border-b border-line/60 transition-colors hover:bg-amber-50/40 ${
                i % 2 === 0 ? 'bg-white' : 'bg-slate-50/35'
              }`}
            >
              <td className="px-3.5 py-2.5 font-medium text-ink">
                {formatTrendAxisLabel(row.date, grain)}
              </td>
              {showFail ? (
                <td className="num px-3.5 py-2.5 text-right text-ink/90">
                  {row.fail.toLocaleString('ko-KR')}
                </td>
              ) : null}
              <td className="num px-3.5 py-2.5 text-right font-semibold text-amber-800">
                {formatWonSuffix(row.scrapCost)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TotalChip({
  label,
  value,
}: {
  label: string
  value: number
}) {
  return (
    <div
      className="rounded-2xl border border-amber-200/80 px-3.5 py-2 text-right shadow-sm"
      style={{ background: LINE_SOFT }}
    >
      <p className="text-[10px] font-bold tracking-wide text-amber-800/80 uppercase">
        {label}
      </p>
      <p className="num mt-0.5 text-sm font-bold text-amber-950">
        {formatWon(value)}
      </p>
    </div>
  )
}

function ProductSearchField({
  value,
  options,
  onChange,
  disabled,
}: {
  value: string
  options: string[]
  onChange: (product: string) => void
  disabled?: boolean
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 20)
    return options
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 20)
  }, [options, query])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  if (value) {
    return (
      <div className="flex min-w-[14rem] flex-1 flex-wrap items-center gap-2">
        <span className="inline-flex max-w-full items-center gap-1.5 rounded-xl border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-950">
          <PackageSearch size={14} className="shrink-0 opacity-70" aria-hidden />
          <span className="truncate">{value}</span>
          <button
            type="button"
            className="rounded-md p-0.5 text-amber-800/70 hover:bg-white/70 hover:text-amber-950"
            aria-label="품번 선택 해제"
            onClick={() => onChange('')}
          >
            <X size={14} />
          </button>
        </span>
        <button
          type="button"
          className="text-xs font-medium text-muted hover:text-accent"
          onClick={() => {
            setQuery(value)
            setOpen(true)
            onChange('')
          }}
        >
          다시 찾기
        </button>
      </div>
    )
  }

  return (
    <div ref={rootRef} className="relative min-w-[14rem] flex-1">
      <Search
        size={14}
        className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={disabled ? '먼저 월을 선택하세요' : '품번 검색·입력…'}
        className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm text-ink shadow-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-muted"
        aria-label="품번 검색"
      />
      {open && !disabled ? (
        <ul className="absolute z-30 mt-1.5 max-h-56 w-full overflow-auto rounded-xl border border-line bg-white py-1 shadow-lg">
          {filtered.length ? (
            filtered.map((p) => (
              <li key={p}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-amber-50"
                  onClick={() => {
                    onChange(p)
                    setQuery('')
                    setOpen(false)
                  }}
                >
                  {p}
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-2.5 text-sm text-muted">검색 결과 없음</li>
          )}
        </ul>
      ) : null}
    </div>
  )
}

function MonthSelect({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: string
  options: string[]
  onChange: (monthKey: string) => void
  ariaLabel: string
}) {
  return (
    <label className="flex w-full flex-col gap-1.5 sm:w-[9.5rem] sm:shrink-0">
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted">
        <CalendarDays size={12} aria-hidden />
        월
      </span>
      <select
        className="rounded-xl border border-line bg-white px-3 py-2 text-sm font-medium text-ink shadow-sm outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        {!options.length ? <option value="">데이터 없음</option> : null}
        {options.map((m) => (
          <option key={m} value={m}>
            {monthLabelOf(m)}
          </option>
        ))}
      </select>
    </label>
  )
}

/**
 * VINA 비용 분석 — 전체·품번별 일별 불량금액.
 * 둘 다 상단 조회조건과 무관하며, 각자 월(·품번)로만 조회한다.
 */
export function VinaDailyScrapCostPanels({
  allRecords,
  overallMonth,
  onSelectOverallMonth,
  productMonth,
  onSelectProductMonth,
  selectedProduct,
  onSelectProduct,
}: {
  /** 기간 무관 전체 VINA 레코드 */
  allRecords: InspectionRecord[]
  overallMonth: string
  onSelectOverallMonth: (monthKey: string) => void
  productMonth: string
  onSelectProductMonth: (monthKey: string) => void
  selectedProduct: string
  onSelectProduct: (product: string) => void
}) {
  const analyzableAll = useMemo(
    () => allRecords.filter((r) => isAnalyzable(r)),
    [allRecords],
  )

  const monthOptions = useMemo(
    () => listMonthKeys(analyzableAll),
    [analyzableAll],
  )

  // 월 목록이 바뀌면 각 패널 선택 월을 유효값으로 보정
  useEffect(() => {
    if (!monthOptions.length) {
      if (overallMonth) onSelectOverallMonth('')
      return
    }
    if (overallMonth && monthOptions.includes(overallMonth)) return
    onSelectOverallMonth(monthOptions[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOptions, overallMonth])

  useEffect(() => {
    if (!monthOptions.length) {
      if (productMonth) onSelectProductMonth('')
      return
    }
    if (productMonth && monthOptions.includes(productMonth)) return
    onSelectProductMonth(monthOptions[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthOptions, productMonth])

  const productOptions = useMemo(
    () => listProductsInMonth(analyzableAll, productMonth),
    [analyzableAll, productMonth],
  )

  useEffect(() => {
    if (!selectedProduct) return
    const ok = productOptions.some((p) =>
      sameItemMatchKey(p, selectedProduct),
    )
    if (!ok) onSelectProduct('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productOptions, selectedProduct])

  const overallMonthFilters = useMemo(
    () => (overallMonth ? customMonthFilters(overallMonth) : null),
    [overallMonth],
  )

  const overallRecords = useMemo(() => {
    if (!overallMonth) return []
    return analyzableAll.filter((r) => r.date.startsWith(overallMonth))
  }, [analyzableAll, overallMonth])

  const overall = useMemo(() => {
    if (!overallMonthFilters || !overallRecords.length) {
      return { trends: [] as DailyTrend[], grain: 'day' as const }
    }
    return buildPeriodTrends(overallRecords, overallMonthFilters)
  }, [overallRecords, overallMonthFilters])

  const productMonthFilters = useMemo(
    () => (productMonth ? customMonthFilters(productMonth) : null),
    [productMonth],
  )

  const productRecords = useMemo(() => {
    if (!selectedProduct || !productMonth) return []
    return analyzableAll.filter(
      (r) =>
        r.date.startsWith(productMonth) &&
        sameItemMatchKey(r.product, selectedProduct),
    )
  }, [analyzableAll, selectedProduct, productMonth])

  const byProduct = useMemo(() => {
    if (!productMonthFilters || !productRecords.length) {
      return { trends: [] as DailyTrend[], grain: 'day' as const }
    }
    return buildPeriodTrends(productRecords, productMonthFilters)
  }, [productRecords, productMonthFilters])

  const overallTotal = useMemo(
    () => roundWon(overall.trends.reduce((s, t) => s + t.scrapCost, 0)),
    [overall.trends],
  )
  const productTotal = useMemo(
    () => roundWon(byProduct.trends.reduce((s, t) => s + t.scrapCost, 0)),
    [byProduct.trends],
  )

  const overallChart = useMemo(
    () =>
      overall.trends.map((t) => ({
        date: t.date,
        scrapCost: roundWon(t.scrapCost),
        fail: t.fail,
      })),
    [overall.trends],
  )
  const productChart = useMemo(
    () =>
      byProduct.trends.map((t) => ({
        date: t.date,
        scrapCost: roundWon(t.scrapCost),
        fail: t.fail,
      })),
    [byProduct.trends],
  )

  const activeProduct =
    selectedProduct &&
    productOptions.some((p) => sameItemMatchKey(p, selectedProduct))
      ? productOptions.find((p) => sameItemMatchKey(p, selectedProduct)) ??
        selectedProduct
      : ''

  return (
    <div className="space-y-5">
      <Panel
        title="VINA 전체 일별 불량금액"
        description="상단 조회조건과 무관합니다. 월을 선택하면 해당 월의 전체 NG금액(폐기금액)을 일별로 합산합니다."
        actions={
          overallMonth ? (
            <TotalChip label="월 합계" value={overallTotal} />
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas/50 p-3 sm:flex-row sm:items-end">
            <MonthSelect
              value={overallMonth}
              options={monthOptions}
              onChange={onSelectOverallMonth}
              ariaLabel="전체 일별 불량금액 월 선택"
            />
            {overallMonth ? (
              <p className="pb-2 text-xs text-muted sm:pb-2.5">
                {monthTitleOf(overallMonth)} · 전체 품번 합산
              </p>
            ) : null}
          </div>

          {!overallMonth || !monthOptions.length ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">조회할 월이 없습니다</p>
              <p className="mt-1 text-xs text-muted">
                VINA 데이터를 업로드하면 월을 선택할 수 있습니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <ScrapCostLineChart data={overallChart} grain={overall.grain} />
              <DailyScrapTable rows={overall.trends} grain={overall.grain} />
            </div>
          )}
        </div>
      </Panel>

      <Panel
        title="품번별 일별 불량금액"
        description="상단 조회조건과 무관합니다. 월을 고른 뒤 품번을 검색·입력해 해당 월의 일별 불량수량·금액을 봅니다."
        actions={
          activeProduct ? (
            <TotalChip label="월 합계" value={productTotal} />
          ) : null
        }
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas/50 p-3 sm:flex-row sm:items-end sm:gap-3">
            <MonthSelect
              value={productMonth}
              options={monthOptions}
              onChange={onSelectProductMonth}
              ariaLabel="품번별 불량금액 월 선택"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-muted">품번</span>
              <ProductSearchField
                value={activeProduct}
                options={productOptions}
                disabled={!productMonth || !monthOptions.length}
                onChange={onSelectProduct}
              />
            </div>
          </div>

          {!productMonth || !monthOptions.length ? (
            <div className="rounded-2xl border border-dashed border-line bg-canvas/40 px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink">조회할 월이 없습니다</p>
              <p className="mt-1 text-xs text-muted">
                VINA 데이터를 업로드하면 월·품번을 선택할 수 있습니다.
              </p>
            </div>
          ) : !activeProduct ? (
            <div className="rounded-2xl border border-dashed border-amber-200/80 bg-amber-50/30 px-4 py-10 text-center">
              <PackageSearch
                size={28}
                className="mx-auto text-amber-700/50"
                aria-hidden
              />
              <p className="mt-3 text-sm font-medium text-ink">
                {monthTitleOf(productMonth)} · 품번을 검색하세요
              </p>
              <p className="mt-1 text-xs text-muted">
                해당 월에 검사 기록이 있는 품번만 목록에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-ink px-2.5 py-1 text-[11px] font-semibold text-white">
                  {monthTitleOf(productMonth)}
                </span>
                <span className="text-sm font-semibold text-ink">
                  {activeProduct}
                </span>
                <span className="text-xs text-muted">일별 추이</span>
              </div>
              <ScrapCostLineChart data={productChart} grain={byProduct.grain} />
              <DailyScrapTable
                rows={byProduct.trends}
                grain={byProduct.grain}
                showFail
              />
            </div>
          )}
        </div>
      </Panel>
    </div>
  )
}
