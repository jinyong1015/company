import { useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { ANALYSIS_GROUPS, type AnalysisGroupId } from '../lib/groups'
import { formatPpm, formatWon } from '../lib/format'

export function SmartCompare() {
  const { analytics } = useData()
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
      <PageHeader title="스마트 비교" description="분석 그룹, 검사자, 설비 간 품질과 효율을 비교합니다." />

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
