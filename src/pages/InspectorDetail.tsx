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
import { isAnalyzable } from '../lib/groups'

export function InspectorDetail() {
  const { id } = useParams()
  const { analytics, records } = useData()
  const inspector = analytics.inspectors.find((i) => i.id === id) ?? analytics.inspectors[0]

  if (!inspector) {
    return (
      <div className="space-y-5">
        <PageHeader title="검사자 상세" description="데이터가 없습니다." />
      </div>
    )
  }

  const ownRecords = records.filter((r) => r.inspector === inspector.name && isAnalyzable(r))
  const byDate = Object.values(
    ownRecords.reduce<Record<string, { date: string; qty: number; fail: number; hours: number }>>(
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

  const products = [...new Set(ownRecords.map((r) => r.product))]
  const molds = [...new Set(ownRecords.map((r) => r.moldNo))]
  const defects = Object.entries(
    ownRecords.reduce<Record<string, number>>((acc, r) => {
      acc[r.mainDefect] = (acc[r.mainDefect] ?? 0) + r.fail
      return acc
    }, {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)

  return (
    <div className="space-y-5">
      <PageHeader
        title={inspector.name}
        description={`${inspector.team} · 담당 제품 및 작업 조건을 함께 확인하세요`}
        actions={
          <Link to="/inspectors" className="text-sm text-accent hover:underline">
            ← 목록으로
          </Link>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['검수량', inspector.qty.toLocaleString()],
          ['부적합률', `${inspector.failRate.toFixed(2)}%`],
          ['UPH', String(inspector.uph)],
          ['폐기비용', `₩${(inspector.scrapCost / 10000).toFixed(0)}만`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3">
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
                <Bar dataKey="qty" fill="#99f6e4" radius={[4, 4, 0, 0]} maxBarSize={22} />
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
                <Line type="monotone" dataKey="uph" stroke="#0f766e" strokeWidth={2} dot={false} />
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
                <Line type="monotone" dataKey="failRate" stroke="#c2410c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        <Panel title="담당 제품">
          <ul className="space-y-2 text-sm">
            {products.slice(0, 6).map((p) => (
              <li key={p} className="border-b border-line/60 py-1.5">
                {p}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="담당 금형">
          <ul className="space-y-2 text-sm">
            {molds.slice(0, 6).map((m) => (
              <li key={m} className="border-b border-line/60 py-1.5">
                {m}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="주요 불량 유형">
          <ul className="space-y-2 text-sm">
            {defects.map(([name, count]) => (
              <li key={name} className="flex justify-between border-b border-line/60 py-1.5">
                <span>{name}</span>
                <span className="num text-muted">{count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
