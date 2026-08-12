import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'

const severityStyle = {
  high: 'bg-danger-soft text-danger',
  medium: 'bg-warn-soft text-warn',
  low: 'bg-ok-soft text-ok',
} as const

const severityLabel = {
  high: '높음',
  medium: '중간',
  low: '낮음',
} as const

export function AnomalyAnalysis() {
  const { analytics } = useData()
  const { anomalies } = analytics

  return (
    <div className="space-y-5">
      <PageHeader
        title="이상징후"
        description="품질·제품·금형·설비·검사 효율·비용 이상을 업로드 데이터 기준으로 추적합니다."
      />

      {anomalies.length === 0 ? (
        <Panel>
          <p className="text-sm text-muted">현재 필터 조건에서 감지된 이상징후가 없습니다.</p>
        </Panel>
      ) : (
        <div className="grid gap-4">
          {anomalies.map((item) => (
            <Panel key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                      {item.category}
                    </span>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${severityStyle[item.severity]}`}>
                      심각도 {severityLabel[item.severity]}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold">{item.title}</h3>
                  <p className="mt-1 text-sm text-muted">
                    발생 {item.occurredAt} · 영향 범위 {item.scope}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted">변화율</p>
                  <p className="num text-xl font-semibold text-danger">{item.change}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {(
                  [
                    ['현재 값', item.current],
                    ['평균 값', item.average],
                    ['관련 제품', item.products],
                    ['관련 금형', item.molds],
                    ['관련 설비', item.equipment],
                    ['주요 불량', item.mainDefect],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line px-3 py-2">
                    <p className="text-xs text-muted">{label}</p>
                    <p className="mt-1 text-sm font-medium">{value}</p>
                  </div>
                ))}
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  )
}
