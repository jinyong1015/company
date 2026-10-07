import { useEffect, useMemo, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { PageHeader } from '../../components/common/PageHeader'
import {
  SplitTop10Panel,
  type SplitTop10RowBase,
} from '../../components/charts/SplitTop10Panel'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { useFilters } from '../../context/FilterContext'
import { filterRecords } from '../../lib/analyze'
import { toEntityId } from '../../lib/entityId'
import { itemMatchKey, preferDisplayItem } from '../../lib/itemMatchKey'
import { loadPageViewState, savePageViewState } from '../../lib/pageViewState'
import { formatPpm, failRatePpm } from '../../lib/format'
import { defectTypeColor } from '../../lib/defectColors'
import { getProductPhotoUrlMap } from '../../lib/productPhotos'
import { isCloudSyncEnabled } from '../../lib/supabase'
import type { DefectType, InspectionRecord } from '../../types'
import { Link } from 'react-router-dom'

const VIEW_STATE_KEY = 'vina-quality-analysis'

type QualityAnalysisViewState = {
  selected: string
}

const defaultViewState: QualityAnalysisViewState = {
  selected: '',
}

function readViewState(): QualityAnalysisViewState {
  const stored = loadPageViewState<Partial<QualityAnalysisViewState>>(VIEW_STATE_KEY)
  if (!stored) return defaultViewState
  return {
    selected: typeof stored.selected === 'string' ? stored.selected : defaultViewState.selected,
  }
}

function defectCountOf(record: InspectionRecord, defect: string) {
  const fromMap = record.defects?.[defect]
  if (typeof fromMap === 'number') return fromMap
  if (record.mainDefect === defect) return record.fail
  return 0
}

type DefectTop10Row = SplitTop10RowBase & { defect: DefectType }

type ProductTop10Row = SplitTop10RowBase & {
  type: string
  qty: number
  failRate: number
  defectCount: number
}

/** 기존 품질 분석과 동일 UI · VINA 데이터만 사용 */
export function VinaQualityAnalysis() {
  const { analytics, records, hasUploadedData, loading } = useVinaData()
  const { filters } = useFilters()
  const { defectTypes } = analytics
  const [view, setView] = useState<QualityAnalysisViewState>(readViewState)
  const { selected } = view

  useEffect(() => {
    savePageViewState(VIEW_STATE_KEY, view)
  }, [view])

  function patchView(patch: Partial<QualityAnalysisViewState>) {
    setView((prev) => ({ ...prev, ...patch }))
  }

  const activeDefect = defectTypes.some((d) => d.name === selected)
    ? selected
    : (defectTypes[0]?.name ?? '')

  const scoped = useMemo(
    () =>
      filterRecords(records, filters, true, { ignoreAnalysisGroup: true }),
    [records, filters],
  )

  const defectTopRows = useMemo((): DefectTop10Row[] => {
    return defectTypes.slice(0, 10).map((d, idx) => ({
      id: d.name,
      name: d.name,
      rank: idx + 1,
      value: d.share,
      sharePercent: d.share,
      defect: d,
    }))
  }, [defectTypes])

  const totalDefectCount = useMemo(
    () => defectTypes.reduce((s, d) => s + d.count, 0),
    [defectTypes],
  )

  const defectProductTop = useMemo((): ProductTop10Row[] => {
    if (!activeDefect) return []
    const map = new Map<
      string,
      {
        product: string
        type: string
        qty: number
        fail: number
        defectCount: number
      }
    >()
    for (const r of scoped) {
      const count = defectCountOf(r, activeDefect)
      if (count <= 0) continue
      const key = itemMatchKey(r.product) || r.product
      const cur = map.get(key) ?? {
        product: r.product,
        type: r.productType || '미지정',
        qty: 0,
        fail: 0,
        defectCount: 0,
      }
      cur.product = preferDisplayItem([cur.product, r.product])
      cur.qty += r.qty
      cur.fail += r.fail
      cur.defectCount += count
      map.set(key, cur)
    }
    const all = [...map.values()]
    const totalDefect = all.reduce((s, r) => s + r.defectCount, 0)
    return all
      .sort((a, b) => b.defectCount - a.defectCount || b.fail - a.fail)
      .slice(0, 10)
      .map((row, i) => ({
        id: toEntityId('prd', row.product),
        name: row.product,
        rank: i + 1,
        value: row.defectCount,
        sharePercent:
          totalDefect > 0
            ? Math.round((row.defectCount / totalDefect) * 1000) / 10
            : 0,
        href: `/vina/products/${toEntityId('prd', row.product)}?from=vina-quality`,
        type: row.type,
        qty: row.qty,
        failRate: failRatePpm(row.fail, row.qty),
        defectCount: row.defectCount,
      }))
  }, [scoped, activeDefect])

  const activeMeta = defectTypes.find((d) => d.name === activeDefect)
  const activeDefectIndex = Math.max(
    0,
    defectTypes.findIndex((d) => d.name === activeDefect),
  )
  const activeDefectColor = defectTypeColor(activeDefectIndex)

  const productKeys = useMemo(
    () =>
      [...new Set(defectProductTop.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [defectProductTop],
  )
  const productKeysSignature = productKeys.join('\u0001')
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!isCloudSyncEnabled() || !productKeys.length) {
      setPhotoUrls({})
      return
    }
    let cancelled = false
    void getProductPhotoUrlMap(productKeys).then((map) => {
      if (!cancelled) setPhotoUrls(map)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature])

  return (
    <div className="space-y-5">
      <VinaSubNav />
      <PageHeader title="VINA 품질 분석" />
      <VinaNotice />

      {loading ? (
        <p className="text-sm text-muted">VINA 데이터 불러오는 중…</p>
      ) : !hasUploadedData ? (
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <p className="text-sm font-semibold text-ink">VINA 데이터가 없습니다</p>
          <p className="mt-1 text-sm text-muted">
            「VINA 데이터 업로드」 후 품질 분석을 이용할 수 있습니다.
          </p>
          <Link
            to="/vina/manage"
            className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
          >
            VINA 데이터 업로드
          </Link>
        </div>
      ) : (
        <section className="quality-drilldown">
          <header className="quality-drilldown-rail">
            <div className="quality-drilldown-step is-active">
              <span className="quality-drilldown-step-num">1</span>
              <div>
                <p className="quality-drilldown-step-title">불량 유형 선택</p>
                <p className="quality-drilldown-step-desc">
                  오른쪽 순위에서 유형을 고르세요
                </p>
              </div>
            </div>
            <div className="quality-drilldown-rail-line" aria-hidden />
            <div
              className="quality-drilldown-step"
              data-filled={activeDefect ? 'true' : undefined}
            >
              <span className="quality-drilldown-step-num">2</span>
              <div>
                <p className="quality-drilldown-step-title">품번 TOP 10 확인</p>
                <p className="quality-drilldown-step-desc">
                  선택한 유형이 많이 난 품번
                </p>
              </div>
            </div>
          </header>

          <SplitTop10Panel
            className="quality-drilldown-panel"
            title="불량 유형 TOP 10"
            description="VINA · 발생 비중 기준 상위 10개 · 유형을 선택하면 아래 품번 순위가 바뀝니다"
            actions={
              <div className="quality-defect-total" aria-label="전체 종합 불량 발생량">
                <span className="quality-defect-total-label">전체 종합 발생량</span>
                <strong className="quality-defect-total-value num">
                  {totalDefectCount.toLocaleString('ko-KR')}
                  <span className="quality-defect-total-unit">건</span>
                </strong>
              </div>
            }
            rows={defectTopRows}
            getBarColor={(_row, index) => defectTypeColor(index)}
            valueLabel="비중"
            formatValue={(n) => `${Number(n)}%`}
            emptyMessage="표시할 불량 유형 데이터가 없습니다."
            detailKicker="선택 유형"
            detailMeta={(row) =>
              row.defect.delta
                ? `발생 ${row.defect.count.toLocaleString('ko-KR')}건 · ${row.defect.delta}`
                : `발생 ${row.defect.count.toLocaleString('ko-KR')}건`
            }
            rankMeta={(row) => `${row.defect.count.toLocaleString('ko-KR')}건`}
            showRankShare={false}
            metrics={[
              {
                label: '비중',
                value: (row) => `${row.sharePercent}%`,
              },
              {
                label: '발생량',
                value: (row) => `${row.defect.count.toLocaleString('ko-KR')}건`,
              },
              {
                label: '순위',
                value: (row) => `${row.rank}위`,
              },
              {
                label: '변화',
                value: (row) => row.defect.delta || '-',
              },
            ]}
            activeId={activeDefect || null}
            onActiveChange={(id) => patchView({ selected: id })}
            xAxisAngle={0}
          />

          <div
            className="quality-drilldown-bridge"
            style={{ ['--defect-color' as string]: activeDefectColor }}
          >
            <span className="quality-drilldown-bridge-icon" aria-hidden>
              <ArrowDown size={16} />
            </span>
            <div className="quality-drilldown-bridge-body">
              <p className="quality-drilldown-bridge-kicker">
                선택 유형 기준 드릴다운
              </p>
              <p className="quality-drilldown-bridge-text">
                <strong style={{ color: activeDefectColor }}>
                  {activeDefect || '유형 미선택'}
                </strong>
                {activeMeta ? (
                  <span>
                    {' '}
                    · {activeMeta.count.toLocaleString('ko-KR')}건 ·{' '}
                    {activeMeta.share}%
                  </span>
                ) : null}
                <span> 발생 품번 TOP 10</span>
              </p>
            </div>
          </div>

          <SplitTop10Panel
            className="quality-drilldown-panel quality-drilldown-panel--products"
            style={{ ['--defect-color' as string]: activeDefectColor }}
            title="품번 TOP 10"
            description={`${activeDefect || '선택 유형'} 발생 수량 기준 상위 10개 VINA 품번`}
            actions={
              activeDefect ? (
                <div className="quality-drilldown-filter-chip">
                  <span
                    className="quality-drilldown-filter-swatch"
                    style={{ background: activeDefectColor }}
                    aria-hidden
                  />
                  <span className="quality-drilldown-filter-label">필터</span>
                  <strong>{activeDefect}</strong>
                </div>
              ) : null
            }
            rows={defectProductTop}
            barColor={activeDefectColor}
            photoUrls={photoUrls}
            valueLabel={`${activeDefect || '불량'} 수량`}
            formatValue={(n) => Math.round(n).toLocaleString('ko-KR')}
            emptyMessage={
              activeDefect
                ? `선택한 기간에 ${activeDefect} 발생 품번이 없습니다.`
                : '표시할 불량 유형이 없습니다.'
            }
            detailKicker="VINA 품번"
            detailMeta={(row) =>
              `${row.type} · 전체 대비 ${row.sharePercent}%`
            }
            rankMeta={(row) => `${row.type} · ${row.sharePercent}%`}
            showRankShare={false}
            xAxisAngle={0}
            metrics={[
              {
                label: `${activeDefect || '불량'} 수량`,
                value: (row) => row.defectCount.toLocaleString('ko-KR'),
              },
              {
                label: '비중',
                value: (row) => `${row.sharePercent}%`,
              },
              {
                label: '검수량',
                value: (row) => row.qty.toLocaleString('ko-KR'),
              },
              {
                label: '부적합률',
                value: (row) => formatPpm(row.failRate),
              },
            ]}
          />
        </section>
      )}
    </div>
  )
}
