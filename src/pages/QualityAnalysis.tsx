import { useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { DefectBarChart } from '../components/charts/DefectCharts'
import { useData } from '../context/DataContext'

export function QualityAnalysis() {
  const { analytics, records } = useData()
  const { defectTypes, products, molds, equipment } = analytics
  const [selected, setSelected] = useState<string | null>(defectTypes[0]?.name ?? null)
  const relatedInspectors = selected
    ? [...new Set(records.filter((r) => r.mainDefect === selected && r.rowClass !== 'excluded' && r.rowClass !== 'error').map((r) => r.inspector))].slice(0, 4)
    : []

  return (
    <div className="space-y-5">
      <PageHeader title="품질 분석" description="불량 유형 TOP 10과 품번/금형/설비 연계 분석입니다. Pareto는 사용하지 않습니다." />
      <Panel title="불량 유형 TOP 10">
        <DefectBarChart data={defectTypes} onSelect={setSelected} />
        <ul className="mt-3 space-y-1.5 text-sm">
          {defectTypes.map((d) => (
            <li key={d.name} className="flex justify-between">
              <span>{d.name} · {d.count.toLocaleString()} · {d.share}%</span>
              <span className="num text-muted">{d.delta}</span>
            </li>
          ))}
        </ul>
      </Panel>
      {selected && (
        <Panel title={`${selected} 상세`}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['관련 품번', products.filter((p) => p.mainDefect === selected).slice(0, 4).map((p) => `${p.name} ${p.failRate.toFixed(2)}%`)],
              ['관련 금형', molds.filter((m) => m.mainDefect === selected).slice(0, 4).map((m) => m.moldNo)],
              ['관련 설비', equipment.filter((e) => e.mainDefect === selected).slice(0, 4).map((e) => e.name)],
              ['관련 검사자', relatedInspectors],
            ].map(([title, items]) => (
              <div key={String(title)} className="rounded-lg border border-line p-3">
                <p className="mb-2 text-xs text-muted">{title}</p>
                <ul className="space-y-1 text-sm">
                  {(items as string[]).length ? (items as string[]).map((i) => <li key={i}>{i}</li>) : <li className="text-muted">없음</li>}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  )
}
