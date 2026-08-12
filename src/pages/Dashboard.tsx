import { useState } from 'react'
import { Link } from 'react-router-dom'
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
import { KpiCard } from '../components/kpi/KpiCard'
import { Panel } from '../components/common/Panel'
import { PageHeader } from '../components/common/PageHeader'
import { StatusBadge } from '../components/common/StatusBadge'
import { useData } from '../context/DataContext'
import { groupLabel } from '../lib/groups'
import { useFilters } from '../context/FilterContext'
import { downloadExcel } from '../lib/download'
import { Sparkles } from 'lucide-react'

const trendMetrics = [
  { id: 'qty', label: '검수량' },
  { id: 'failRate', label: '부적합률' },
  { id: 'fail', label: '부적합수량' },
  { id: 'scrapCost', label: '폐기비용' },
] as const

export function Dashboard() {
  const { analytics, hasUploadedData, meta } = useData()
  const { filters } = useFilters()
  const { kpis, insights, products, dailyTrends, defectTypes, groupSummaries } = analytics
  const [metric, setMetric] = useState<(typeof trendMetrics)[number]['id']>('qty')
  const [productSort, setProductSort] = useState<'fail' | 'failRate' | 'qty' | 'scrapCost' | 'changeRate'>('fail')

  const productTop = [...products]
    .sort((a, b) => b[productSort] - a[productSort])
    .slice(0, 10)

  return (
    <div className="space-y-5">
      <PageHeader
        title="대시보드"
        description={
          hasUploadedData
            ? `${meta.fileName} · ${groupLabel(filters.analysisGroup)} 기준 품질 현황`
            : `${groupLabel(filters.analysisGroup)} 기준 품질 현황`
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                downloadExcel(
                  '대시보드.xlsx',
                  groupSummaries.map((g) => ({
                    그룹: g.label,
                    검수량: g.qty,
                    부적합률: g.failRate,
                    부적합수량: g.fail,
                    폐기비용: g.scrapCost,
                  })),
                )
              }
              className="rounded-full border border-line bg-white px-3.5 py-2 text-sm hover:bg-canvas"
            >
              Excel 다운로드
            </button>
            <Link
              to="/ai"
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-600"
            >
              <Sparkles size={14} />
              AI 분석
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </div>

      <Panel title="분석 그룹 비교" description="#N/A 제외 유효 DATA">
        <div className="overflow-x-auto">
          <table className="min-w-[720px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">그룹</th>
                <th className="px-2 py-2 font-medium">검수량</th>
                <th className="px-2 py-2 font-medium">부적합률</th>
                <th className="px-2 py-2 font-medium">부적합수량</th>
                <th className="px-2 py-2 font-medium">폐기비용</th>
              </tr>
            </thead>
            <tbody>
              {groupSummaries.map((g) => (
                <tr key={g.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{g.label}</td>
                  <td className="num px-2 py-2.5">{g.qty.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">{g.failRate.toFixed(2)}%</td>
                  <td className="num px-2 py-2.5">{g.fail.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">₩{g.scrapCost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Panel
          title="품질 추이"
          actions={
            <div className="flex flex-wrap gap-1">
              {trendMetrics.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMetric(m.id)}
                  className={`rounded-full px-2.5 py-1 text-xs ${
                    metric === m.id ? 'bg-accent text-white' : 'bg-canvas text-muted'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dailyTrends}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} width={48} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Line type="monotone" dataKey={metric} stroke="#3b82f6" strokeWidth={2.4} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="AI Insight">
          <div className="space-y-3">
            {insights.map((item) => (
              <article key={item.id} className="rounded-xl border border-line p-3">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.body.map((line) => (
                  <p key={line} className="mt-1 text-sm text-muted">
                    {line}
                  </p>
                ))}
                {item.to && (
                  <Link to={item.to} className="mt-2 inline-block text-sm font-medium text-accent">
                    {item.action}
                  </Link>
                )}
              </article>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="불량 유형 TOP 10" description="이전 기간 대비 변화 포함">
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defectTypes} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#eef1f5" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: '#5b6577' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" width={84} tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 6, 6, 0]} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm">
            {defectTypes.map((d) => (
              <li key={d.name} className="flex justify-between">
                <span>
                  {d.name} <span className="num text-muted">{d.share}%</span>
                </span>
                <span className={`num ${d.tone === 'up-bad' ? 'text-danger' : d.tone === 'down-good' ? 'text-ok' : 'text-muted'}`}>
                  {d.delta}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel
          title="품번 기준 불량 TOP 10"
          actions={
            <select
              value={productSort}
              onChange={(e) => setProductSort(e.target.value as typeof productSort)}
              className="rounded-lg border border-line px-2 py-1 text-xs"
            >
              <option value="fail">부적합수량</option>
              <option value="failRate">부적합률</option>
              <option value="qty">검수량</option>
              <option value="scrapCost">폐기비용</option>
              <option value="changeRate">증가율</option>
            </select>
          }
        >
          <div className="space-y-2">
            {productTop.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="flex items-center justify-between rounded-xl bg-canvas/70 px-3 py-2.5 hover:bg-accent-soft"
              >
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="num text-xs text-muted">
                    부적합 {p.fail.toLocaleString()} · {p.failRate.toFixed(2)}% · {p.mainDefect}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  )
}
