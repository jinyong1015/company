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
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { isAnalyzable } from '../lib/groups'

export function ProductDetail() {
  const { id } = useParams()
  const { analytics, records } = useData()
  const product = analytics.products.find((p) => p.id === id) ?? analytics.products[0]

  if (!product) {
    return (
      <div className="space-y-5">
        <PageHeader title="품번 상세" description="데이터가 없습니다." />
      </div>
    )
  }

  const own = records.filter((r) => r.product === product.name && isAnalyzable(r))
  const byDate = Object.values(
    own.reduce<Record<string, { date: string; qty: number; fail: number }>>((acc, r) => {
      if (!acc[r.date]) acc[r.date] = { date: r.date.slice(5), qty: 0, fail: 0 }
      acc[r.date].qty += r.qty
      acc[r.date].fail += r.fail
      return acc
    }, {}),
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      failRate: d.qty > 0 ? Math.round((d.fail / d.qty) * 10000) / 100 : 0,
    }))

  const workerUph = analytics.workerProductUph.filter((w) => w.product === product.name)

  return (
    <div className="space-y-5">
      <PageHeader
        title={product.name}
        description={`${product.type} · 품번 품질/효율/불량 상세`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={product.status} />
            <Link to="/products" className="text-sm text-accent hover:underline">
              ← 목록으로
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['검사량', product.qty.toLocaleString()],
          ['합격수량', product.pass.toLocaleString()],
          ['부적합수량', product.fail.toLocaleString()],
          ['부적합 합계', product.failTotal.toLocaleString()],
          ['폐기비용', `₩${product.scrapCost.toLocaleString()}`],
          ['소요시간(분)', product.minutes.toLocaleString()],
          ['UPH', String(product.uph)],
          ['부적합률', `${product.failRate.toFixed(2)}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="기간별 부적합률 추이">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDate}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey="failRate" name="부적합률" stroke="#c2410c" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="불량 유형별 발생량" description="어떤 불량이 발생했는지 정확히 집계">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={product.defects}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Bar dataKey="count" fill="#0f766e" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="불량 내역 상세">
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">불량 유형</th>
                <th className="px-2 py-2 font-medium">발생 수량</th>
                <th className="px-2 py-2 font-medium">비중</th>
              </tr>
            </thead>
            <tbody>
              {product.defects.map((d) => (
                <tr key={d.name} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{d.name}</td>
                  <td className="num px-2 py-2.5">{d.count.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{d.share.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['금형', [...new Set(own.map((r) => r.moldNo))]],
          ['설비', [...new Set(own.map((r) => r.equipment))]],
          ['검사자', [...new Set(own.map((r) => r.inspector))]],
          ['LOT', [...new Set(own.map((r) => r.lot))]],
        ].map(([title, items]) => (
          <Panel key={String(title)} title={String(title)}>
            <ul className="space-y-1.5 text-sm">
              {(items as string[]).slice(0, 8).map((item) => (
                <li key={item} className="border-b border-line/60 py-1.5">
                  {item}
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel title="작업자별 품번 UPH" description={`${product.name}를 담당한 작업자 효율`}>
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">작업자</th>
                <th className="px-2 py-2 font-medium">검사량</th>
                <th className="px-2 py-2 font-medium">합격</th>
                <th className="px-2 py-2 font-medium">부적합</th>
                <th className="px-2 py-2 font-medium">소요시간(분)</th>
                <th className="px-2 py-2 font-medium">UPH</th>
                <th className="px-2 py-2 font-medium">불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {workerUph.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{row.worker}</td>
                  <td className="num px-2 py-2.5">{row.qty.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{row.pass.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{row.fail.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{row.minutes.toLocaleString()}</td>
                  <td className="num px-2 py-2.5 font-semibold">{row.uph}</td>
                  <td className="px-2 py-2.5 text-xs">{row.defectSummary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
