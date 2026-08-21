import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { StatusBadge } from '../components/common/StatusBadge'
import { DefectBarChart } from '../components/charts/DefectCharts'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { filterRecords } from '../lib/analyze'
import { toEntityId } from '../lib/entityId'
import { formatPpm, failRatePpm } from '../lib/format'
import type { InspectionRecord } from '../types'

type TopMode = 'byDefect' | 'byProduct'
type ProductSort = 'fail' | 'failRate' | 'qty' | 'scrapCost'

function defectCountOf(record: InspectionRecord, defect: string) {
  const fromMap = record.defects?.[defect]
  if (typeof fromMap === 'number') return fromMap
  if (record.mainDefect === defect) return record.fail
  return 0
}

export function QualityAnalysis() {
  const { analytics, records } = useData()
  const { filters } = useFilters()
  const { defectTypes, products } = analytics
  const [selected, setSelected] = useState(defectTypes[0]?.name ?? '')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [topMode, setTopMode] = useState<TopMode>('byDefect')
  const [productSort, setProductSort] = useState<ProductSort>('fail')

  const activeDefect = defectTypes.some((d) => d.name === selected)
    ? selected
    : (defectTypes[0]?.name ?? '')

  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen])

  const scoped = useMemo(
    () => filterRecords(records, filters, true),
    [records, filters],
  )

  const defectProductTop = useMemo(() => {
    if (!activeDefect) return []
    const map = new Map<
      string,
      { product: string; type: string; qty: number; fail: number; defectCount: number }
    >()
    for (const r of scoped) {
      const count = defectCountOf(r, activeDefect)
      if (count <= 0) continue
      const cur = map.get(r.product) ?? {
        product: r.product,
        type: r.productType || '미지정',
        qty: 0,
        fail: 0,
        defectCount: 0,
      }
      cur.qty += r.qty
      cur.fail += r.fail
      cur.defectCount += count
      map.set(r.product, cur)
    }
    return [...map.values()]
      .sort((a, b) => b.defectCount - a.defectCount || b.fail - a.fail)
      .slice(0, 10)
      .map((row, i) => ({
        ...row,
        rank: i + 1,
        failRate: failRatePpm(row.fail, row.qty),
        id: toEntityId('prd', row.product),
      }))
  }, [scoped, activeDefect])

  const productFailTop = useMemo(
    () =>
      [...products]
        .sort((a, b) => b[productSort] - a[productSort])
        .slice(0, 10),
    [products, productSort],
  )

  const activeMeta = defectTypes.find((d) => d.name === activeDefect)

  function pickDefect(name: string) {
    setSelected(name)
    setPickerOpen(false)
    setTopMode('byDefect')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="품질 분석"
        description="불량 유형 TOP 10과 품번 TOP 10을 함께 확인합니다."
      />

      <Panel title="불량 유형 TOP 10" description="아래 버튼으로 유형을 선택하세요">
        <DefectBarChart data={defectTypes} />

        <div className="mt-4 rounded-2xl border border-line bg-canvas/50 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-ink">불량 유형 선택</p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-ink/90"
            >
              전체 유형 보기
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {defectTypes.map((d, i) => {
              const active = d.name === activeDefect
              return (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => pickDefect(d.name)}
                  className={`rounded-full border px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? 'scale-[1.03] border-accent bg-accent text-white shadow-md shadow-accent/25'
                      : 'border-line bg-white text-ink hover:border-accent/40 hover:bg-accent-soft'
                  }`}
                >
                  <span className="mr-1.5 text-xs opacity-70">{i + 1}.</span>
                  {d.name}
                  <span className={`ml-2 num text-xs ${active ? 'text-white/80' : 'text-muted'}`}>
                    {d.share}%
                  </span>
                </button>
              )
            })}
          </div>
          {activeMeta && (
            <p className="mt-3 text-xs text-muted">
              선택: <span className="font-semibold text-ink">{activeMeta.name}</span>
              {' · '}
              {activeMeta.count.toLocaleString()}건 · {activeMeta.share}%
              {activeMeta.delta ? ` · ${activeMeta.delta}` : ''}
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="품번 TOP 10"
        description={
          topMode === 'byDefect'
            ? activeDefect
              ? `${activeDefect} 발생 수량 기준`
              : '불량 유형을 선택하세요'
            : '품번 전체 부적합 기준'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-line bg-white p-0.5">
              <button
                type="button"
                onClick={() => setTopMode('byDefect')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  topMode === 'byDefect' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                불량 유형별
              </button>
              <button
                type="button"
                onClick={() => setTopMode('byProduct')}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  topMode === 'byProduct' ? 'bg-accent text-white shadow-sm' : 'text-muted hover:text-ink'
                }`}
              >
                품번 기준 불량
              </button>
            </div>
            {topMode === 'byProduct' && (
              <select
                value={productSort}
                onChange={(e) => setProductSort(e.target.value as ProductSort)}
                className="rounded-full border border-line bg-white px-3 py-1.5 text-xs"
              >
                <option value="fail">부적합수량</option>
                <option value="failRate">부적합률</option>
                <option value="qty">검수량</option>
                <option value="scrapCost">폐기비용</option>
              </select>
            )}
            {topMode === 'byDefect' && (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-white"
              >
                유형 변경
              </button>
            )}
          </div>
        }
      >
        {topMode === 'byDefect' ? (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 font-medium">순위</th>
                  <th className="px-2 py-2 font-medium">품번</th>
                  <th className="px-2 py-2 font-medium">제품유형</th>
                  <th className="px-2 py-2 font-medium">{activeDefect || '불량'} 수량</th>
                  <th className="px-2 py-2 font-medium">검수량</th>
                  <th className="px-2 py-2 font-medium">부적합률</th>
                </tr>
              </thead>
              <tbody>
                {defectProductTop.map((row) => (
                  <tr key={row.id} className="border-b border-line/70 hover:bg-canvas">
                    <td className="num px-2 py-2.5 text-muted">{row.rank}</td>
                    <td className="px-2 py-2.5 font-medium">
                      <Link to={`/products/${row.id}`} className="text-accent hover:underline">
                        {row.product}
                      </Link>
                    </td>
                    <td className="px-2 py-2.5">{row.type}</td>
                    <td className="num px-2 py-2.5 font-semibold">{row.defectCount.toLocaleString()}</td>
                    <td className="num px-2 py-2.5">{row.qty.toLocaleString()}</td>
                    <td className="num px-2 py-2.5">{formatPpm(row.failRate)}</td>
                  </tr>
                ))}
                {!defectProductTop.length && (
                  <tr>
                    <td colSpan={6} className="px-2 py-8 text-center text-muted">
                      {activeDefect
                        ? `선택한 기간에 ${activeDefect} 발생 품번이 없습니다.`
                        : '표시할 불량 유형이 없습니다.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="space-y-2">
            {productFailTop.map((p, i) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="flex items-center justify-between rounded-xl bg-canvas/70 px-3 py-2.5 transition hover:bg-accent-soft"
              >
                <div className="flex items-start gap-3">
                  <span className="num mt-0.5 w-5 text-xs text-muted">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{p.name}</p>
                    <p className="num text-xs text-muted">
                      부적합 {p.fail.toLocaleString()} · {formatPpm(p.failRate)} · {p.mainDefect}
                    </p>
                  </div>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
            {!productFailTop.length && (
              <p className="py-8 text-center text-sm text-muted">표시할 품번이 없습니다.</p>
            )}
          </div>
        )}
      </Panel>

      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
          onClick={() => setPickerOpen(false)}
          role="presentation"
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="불량 유형 선택"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <p className="text-sm font-semibold text-ink">불량 유형 선택</p>
                <p className="text-xs text-muted">유형을 고르면 품번 TOP 10이 갱신됩니다</p>
              </div>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="rounded-full border border-line px-3 py-1 text-xs hover:bg-canvas"
              >
                닫기
              </button>
            </div>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
              {defectTypes.map((d, i) => {
                const active = d.name === activeDefect
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => pickDefect(d.name)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-accent bg-accent text-white shadow-md shadow-accent/20'
                        : 'border-line bg-white hover:border-accent/40 hover:bg-accent-soft'
                    }`}
                  >
                    <span className="font-medium">
                      <span className={`mr-2 text-xs ${active ? 'text-white/70' : 'text-muted'}`}>
                        {i + 1}.
                      </span>
                      {d.name}
                    </span>
                    <span className={`num text-sm ${active ? 'text-white/85' : 'text-muted'}`}>
                      {d.count.toLocaleString()} · {d.share}%
                    </span>
                  </button>
                )
              })}
              {!defectTypes.length && (
                <p className="py-6 text-center text-sm text-muted">선택할 불량 유형이 없습니다.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
