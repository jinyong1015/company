import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import { Panel } from '../common/Panel'
import { summarizeDailyProductFailRateTop } from '../../lib/analyze'
import {
  formatPpm,
  formatPpmAsPercent,
  formatYmdWithWeekday,
} from '../../lib/format'
import {
  buildProductDetailHref,
  type ProductDetailFromId,
} from '../../lib/productDetailNav'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
import { loadPageViewState, savePageViewState } from '../../lib/pageViewState'
import type { InspectionRecord } from '../../types'

const DAILY_TOP_BAR_COLOR = '#60a5fa'
const DAILY_CHART_PHOTO_SIZE = 56
const DAILY_CHART_X_AXIS_HEIGHT = DAILY_CHART_PHOTO_SIZE + 28
const DAILY_CHART_MIN_HEIGHT = 420
const DEFAULT_DAILY_TOP_N = 10
const MIN_DAILY_TOP_N = 1
const MAX_DAILY_TOP_N = 50

type DailyProductTypeTab = 'all' | 'grommet' | 'seal'

const dailyProductTypeTabs: { id: DailyProductTypeTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'grommet', label: 'GROMMET' },
  { id: 'seal', label: 'SEAL' },
]

type PanelViewState = {
  topN: number
  typeTab: DailyProductTypeTab
}

function clampTopN(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_TOP_N
  return Math.min(
    MAX_DAILY_TOP_N,
    Math.max(MIN_DAILY_TOP_N, Math.floor(value)),
  )
}

function readPanelView(viewStateKey: string): PanelViewState {
  const stored = loadPageViewState<Partial<PanelViewState>>(viewStateKey)
  const topN =
    typeof stored?.topN === 'number'
      ? clampTopN(stored.topN)
      : DEFAULT_DAILY_TOP_N
  const typeTab =
    stored?.typeTab === 'grommet' ||
    stored?.typeTab === 'seal' ||
    stored?.typeTab === 'all'
      ? stored.typeTab
      : 'all'
  return { topN, typeTab }
}

function matchesDailyProductTypeTab(
  type: string,
  tab: DailyProductTypeTab,
): boolean {
  if (tab === 'all') return true
  const t = (type || '').toLowerCase()
  if (tab === 'seal') {
    return t.includes('seal') || t.includes('실링') || t.includes('씰')
  }
  return (
    t.includes('grommet') || t.includes('그로멧') || t.includes('유압')
  )
}

function formatMdDot(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return ymd
  return `${Number(m[2])}. ${m[3]}`
}

function DailyChartAxisTick({
  x = 0,
  y = 0,
  payload,
  photoUrls,
}: {
  x?: number
  y?: number
  payload?: { value?: string | number }
  photoUrls?: Record<string, string>
}) {
  const name = String(payload?.value ?? '')
  const label = name.length > 10 ? `${name.slice(0, 10)}…` : name
  const url = photoUrls?.[name.trim()]

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject
        x={-DAILY_CHART_PHOTO_SIZE / 2}
        y={4}
        width={DAILY_CHART_PHOTO_SIZE}
        height={DAILY_CHART_PHOTO_SIZE}
      >
        <div className="dash-top10-axis-photo">
          {url ? (
            <img src={url} alt="" title={name} referrerPolicy="no-referrer" />
          ) : (
            <span className="smart-compare-daily-photo-fallback" title={name}>
              {name.slice(0, 2) || '—'}
            </span>
          )}
        </div>
      </foreignObject>
      <text
        x={0}
        y={DAILY_CHART_PHOTO_SIZE + 16}
        textAnchor="middle"
        fill="var(--color-muted)"
        fontSize={12}
        fontWeight={650}
      >
        {label}
      </text>
    </g>
  )
}

export function DailyFailRateTopPanel({
  records,
  day,
  productFrom,
  vina = false,
  viewStateKey,
}: {
  records: InspectionRecord[]
  day: string
  productFrom: ProductDetailFromId
  vina?: boolean
  viewStateKey: string
}) {
  const [view, setView] = useState<PanelViewState>(() =>
    readPanelView(viewStateKey),
  )
  const { topN, typeTab } = view

  useEffect(() => {
    savePageViewState(viewStateKey, view)
  }, [view, viewStateKey])

  function patchView(patch: Partial<PanelViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const typedRecords = useMemo(() => {
    if (typeTab === 'all') return records
    return records.filter((r) =>
      matchesDailyProductTypeTab(r.productType || '', typeTab),
    )
  }, [records, typeTab])

  const rows = useMemo(
    () => summarizeDailyProductFailRateTop(typedRecords, day, topN, 'all'),
    [typedRecords, day, topN],
  )

  const typeTabCounts = useMemo(() => {
    const byType = summarizeDailyProductFailRateTop(records, day, 500, 'all')
    const counts: Record<DailyProductTypeTab, number> = {
      all: byType.length,
      grommet: 0,
      seal: 0,
    }
    for (const row of byType) {
      if (matchesDailyProductTypeTab(row.type, 'grommet')) counts.grommet += 1
      if (matchesDailyProductTypeTab(row.type, 'seal')) counts.seal += 1
    }
    return counts
  }, [records, day])

  const dayLabel = day ? formatYmdWithWeekday(day) : '—'
  const mdLabel = day ? formatMdDot(day) : '—'
  const typeTabLabel =
    dailyProductTypeTabs.find((t) => t.id === typeTab)?.label ?? '전체'

  const chartData = useMemo(
    () => rows.map((row) => ({ name: row.name, value: row.failRate })),
    [rows],
  )

  const photoKeys = useMemo(
    () => [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [rows],
  )
  const photoKeysSignature = photoKeys.join('\u0001')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isCloudSyncEnabled() || !photoKeys.length) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    void getProductPhotoUrlMap(photoKeys).then((map) => {
      if (!cancelled) setPhotoUrls(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKeysSignature])

  return (
    <Panel
      title={`일별 부적합률 TOP${topN}`}
      description={
        vina
          ? `${typeTabLabel} · 상단 조회일 기준 VINA 부적합률(ppm) TOP`
          : `${typeTabLabel} · 상단 조회일 기준 부적합률(ppm) TOP (분석 그룹 적용)`
      }
      className="smart-compare-panel"
      actions={
        <div className="smart-compare-daily-header-actions">
          <div
            className="qty-type-tabs smart-compare-daily-type-tabs"
            role="tablist"
            aria-label="일별 부적합률 TOP 제품유형"
          >
            {dailyProductTypeTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={typeTab === tab.id}
                className="qty-type-tab"
                data-active={typeTab === tab.id}
                onClick={() => patchView({ typeTab: tab.id })}
              >
                {tab.label}
                <span className="qty-type-tab-count">
                  {typeTabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>
          <div className="smart-compare-daily-controls smart-compare-daily-controls--header">
            <label className="smart-compare-field">
              <span className="smart-compare-field-label">TOP</span>
              <input
                type="number"
                min={MIN_DAILY_TOP_N}
                max={MAX_DAILY_TOP_N}
                value={topN}
                onChange={(e) =>
                  patchView({ topN: clampTopN(Number(e.target.value)) })
                }
                className="smart-compare-input smart-compare-input--topn"
              />
            </label>
          </div>
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="smart-compare-empty">
          {vina
            ? `선택한 일자·${typeTabLabel} VINA DATA가 없습니다.`
            : `선택한 일자·${typeTabLabel}·분석 그룹에 DATA가 없습니다.`}
        </div>
      ) : (
        <>
          <div
            className="dash-top10-chart dash-top10-chart--view detail-chart-frame smart-compare-daily-chart"
            style={
              {
                ['--dash-top10-bar' as string]: DAILY_TOP_BAR_COLOR,
              } as CSSProperties
            }
          >
            <ResponsiveContainer
              width="100%"
              height="100%"
              minHeight={DAILY_CHART_MIN_HEIGHT}
            >
              <BarChart
                data={chartData}
                margin={{ top: 36, right: 16, left: 8, bottom: 16 }}
              >
                <CartesianGrid
                  stroke="var(--color-line)"
                  vertical={false}
                  strokeDasharray="3 6"
                />
                <XAxis
                  dataKey="name"
                  interval={0}
                  height={DAILY_CHART_X_AXIS_HEIGHT}
                  tickMargin={0}
                  axisLine={false}
                  tickLine={false}
                  tick={(props) => (
                    <DailyChartAxisTick
                      x={
                        typeof props.x === 'number'
                          ? props.x
                          : Number(props.x) || 0
                      }
                      y={
                        typeof props.y === 'number'
                          ? props.y
                          : Number(props.y) || 0
                      }
                      payload={
                        props.payload
                          ? {
                              value: props.payload.value as
                                | string
                                | number
                                | undefined,
                            }
                          : undefined
                      }
                      photoUrls={photoUrls}
                    />
                  )}
                />
                <YAxis
                  tick={{
                    fill: 'var(--color-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                  tickFormatter={(v) => formatPpm(Number(v))}
                  width={72}
                  axisLine={false}
                  tickLine={false}
                />
                <Bar
                  dataKey="value"
                  name="부적합률"
                  fill={DAILY_TOP_BAR_COLOR}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={42}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    offset={8}
                    className="op-prod-top-bar-value"
                    formatter={(v) => formatPpm(Number(v))}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="smart-compare-daily-bridge" aria-hidden={false}>
            <span className="smart-compare-daily-bridge-arrow" aria-hidden>
              ↓
            </span>
            <div className="smart-compare-daily-bridge-copy">
              <p className="smart-compare-daily-bridge-title">
                검사이력 {mdLabel}
              </p>
              <p className="smart-compare-daily-bridge-desc">
                위 TOP{topN} · {typeTabLabel} · {dayLabel} · 부적합률(ppm) 높은
                순
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="smart-compare-table smart-compare-daily-table min-w-[980px] w-full text-left text-sm">
              <thead>
                <tr>
                  <th>품번</th>
                  <th>검수량</th>
                  <th>합격 수량</th>
                  <th>부적합 수량</th>
                  <th>부적합율 (PPM)</th>
                  <th>불량율</th>
                  <th>대표 유형</th>
                  <th>작업자</th>
                  <th>설비</th>
                  <th>생산LOT</th>
                  <th>상세</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="smart-compare-daily-product font-medium">
                      <Link
                        to={buildProductDetailHref(row.id, productFrom, {
                          startDate: day,
                          endDate: day,
                          vina,
                        })}
                      >
                        {row.name}
                      </Link>
                    </td>
                    <td className="num">{row.qty.toLocaleString('ko-KR')}</td>
                    <td className="num">{row.pass.toLocaleString('ko-KR')}</td>
                    <td className="num">{row.fail.toLocaleString('ko-KR')}</td>
                    <td className="num">
                      {row.failRate.toLocaleString('ko-KR')}
                    </td>
                    <td className="num smart-compare-daily-rate">
                      {formatPpmAsPercent(row.failRate)}
                    </td>
                    <td>
                      <span className="smart-compare-daily-defect">
                        {row.mainDefect}
                      </span>
                    </td>
                    <td>{row.worker}</td>
                    <td>{row.equipment}</td>
                    <td className="num">{row.lot}</td>
                    <td>
                      <Link
                        className="smart-compare-detail-link"
                        to={buildProductDetailHref(row.id, productFrom, {
                          startDate: day,
                          endDate: day,
                          vina,
                        })}
                      >
                        상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Panel>
  )
}
