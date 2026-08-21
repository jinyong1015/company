import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DailyTrend } from '../../types'
import { formatPpm } from '../../lib/format'

function formatCost(v: number) {
  return `₩${(v / 10000).toFixed(0)}만`
}

export function TrendChart({ data }: { data: DailyTrend[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted">
        표시할 추이 데이터가 없습니다. 엑셀을 업로드하세요.
      </div>
    )
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#5b6577', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="qty"
            tick={{ fill: '#5b6577', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tick={{ fill: '#5b6577', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={56}
            tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
          />
          <Tooltip
            contentStyle={{
              border: '1px solid #e2e6ec',
              borderRadius: 12,
              boxShadow: 'none',
              fontSize: 12,
            }}
            formatter={(value, name) => {
              const n = Number(value ?? 0)
              if (name === '부적합률') return [formatPpm(n), name]
              if (name === '폐기비용') return [formatCost(n), name]
              return [n.toLocaleString(), String(name)]
            }}
            labelFormatter={(label) => `날짜 ${label}`}
          />
          <Bar
            yAxisId="qty"
            dataKey="qty"
            name="검수량"
            fill="#99f6e4"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="failRate"
            name="부적합률"
            stroke="#0f766e"
            strokeWidth={2.2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-teal-200" />
          검수량
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-3 bg-accent" />
          부적합률
        </span>
      </div>
    </div>
  )
}
