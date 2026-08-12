import { Link, useParams } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { filterRecords } from '../lib/analyze'
import { fromEntityId, toEntityId } from '../lib/entityId'
import { useMemo } from 'react'

export function InspectorDetail() {
  const { id } = useParams()
  const { analytics, records } = useData()
  const { filters } = useFilters()
  const name = fromEntityId(id, 'ins')

  const inspector =
    analytics.inspectors.find((i) => i.id === id || i.id === toEntityId('ins', name) || i.name === name) ??
    null

  const scoped = useMemo(
    () => filterRecords(records, filters, true).filter((r) => r.inspector === name),
    [records, filters, name],
  )

  if (!name) {
    return (
      <div className="space-y-5">
        <PageHeader title="검사자 상세" description="대상을 찾을 수 없습니다." />
      </div>
    )
  }

  if (!inspector && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <PageHeader
          title={name}
          description="선택한 기간/분석 그룹에 이 검사자의 DATA가 없습니다."
          actions={
            <Link to="/inspectors" className="text-sm text-accent hover:underline">
              ← 목록으로
            </Link>
          }
        />
        <Panel>
          <p className="text-sm text-muted">기간이나 분석 그룹을 바꿔 다시 확인해 주세요.</p>
        </Panel>
      </div>
    )
  }

  const row = inspector ?? {
    id: toEntityId('ins', name),
    name,
    team: scoped[0]?.team || '미지정',
    count: scoped.length,
    qty: scoped.reduce((s, r) => s + r.qty, 0),
    pass: scoped.reduce((s, r) => s + r.pass, 0),
    fail: scoped.reduce((s, r) => s + r.fail, 0),
    failRate: 0,
    hours: scoped.reduce((s, r) => s + r.hours, 0),
    minutes: 0,
    uph: 0,
    scrapCost: scoped.reduce((s, r) => s + r.scrapCost, 0),
    products: [],
  }
  const qty = row.qty
  const fail = row.fail
  const hours = row.hours
  const failRate = qty > 0 ? Math.round((fail / qty) * 10000) / 100 : 0
  const uph = hours > 0 ? Math.round(qty / hours) : 0

  const byDate = Object.values(
    scoped.reduce<Record<string, { date: string; qty: number; fail: number; hours: number }>>(
      (acc, r) => {
        const key = r.date
        if (!acc[key]) acc[key] = { date: r.date.slice(5), qty: 0, fail: 0, hours: 0 }
        acc[key].qty += r.qty
        acc[key].fail += r.fail
        acc[key].hours += r.hours
        return acc
      },
      {},
    ),
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      failRate: d.qty > 0 ? Math.round((d.fail / d.qty) * 10000) / 100 : 0,
      uph: d.hours > 0 ? Math.round(d.qty / d.hours) : 0,
    }))

  const products = inspector?.products?.length
    ? inspector.products
    : [...new Set(scoped.map((r) => r.product))].map((p) => ({ product: p }))
  const molds = [...new Set(scoped.map((r) => r.moldNo))]
  const defects = Object.entries(
    scoped.reduce<Record<string, number>>((acc, r) => {
      acc[r.mainDefect] = (acc[r.mainDefect] ?? 0) + r.fail
      return acc
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="space-y-5">
      <PageHeader
        title={row.name}
        description={`${row.team} · 선택한 기간/분석 그룹 기준`}
        actions={
          <Link to="/inspectors" className="text-sm text-accent hover:underline">
            ← 목록으로
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['검수량', qty.toLocaleString()],
          ['부적합률', `${failRate.toFixed(2)}%`],
          ['UPH', String(uph)],
          ['폐기비용', `₩${row.scrapCost.toLocaleString()}`],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="기간별 검사량">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byDate}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Bar dataKey="qty" fill="#93c5fd" radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="기간별 UPH">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDate}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey="uph" stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="기간별 부적합률">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDate}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey="failRate" stroke="#ef4444" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Panel title="담당 제품">
          <ul className="space-y-2 text-sm">
            {products.slice(0, 8).map((p) => (
              <li key={'product' in p ? p.product : String(p)} className="border-b border-line/60 py-1.5">
                {'product' in p ? p.product : String(p)}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="담당 금형">
          <ul className="space-y-2 text-sm">
            {molds.slice(0, 8).map((m) => (
              <li key={m} className="border-b border-line/60 py-1.5">
                {m}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="주요 불량 유형">
          <ul className="space-y-2 text-sm">
            {defects.map(([defectName, count]) => (
              <li key={defectName} className="flex justify-between border-b border-line/60 py-1.5">
                <span>{defectName}</span>
                <span className="num text-muted">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
