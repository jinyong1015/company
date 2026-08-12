import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts'
import { useMemo } from 'react'
import type { DefectType } from '../../types'

const colors = [
  '#0f766e',
  '#0d9488',
  '#14b8a6',
  '#2dd4bf',
  '#5eead4',
  '#99f6e4',
  '#ccfbf1',
  '#a8a29e',
  '#78716c',
  '#57534e',
]

export function DefectBarChart({
  data,
  onSelect,
}: {
  data: DefectType[]
  onSelect?: (name: string) => void
}) {
  if (!data.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted">
        불량 유형 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, left: 8, bottom: 0 }}
        >
          <CartesianGrid stroke="#eef1f5" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#5b6577', fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={84}
            tick={{ fill: '#0b1220', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
            formatter={(value, _n, item) => [
              `${Number(value).toLocaleString()}건 (${item.payload.share}%)`,
              '발생량',
            ]}
          />
          <Bar
            dataKey="count"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            cursor="pointer"
            onClick={(d) => onSelect?.(String(d.name))}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function ParetoChart({ data }: { data: DefectType[] }) {
  const chartData = useMemo(() => {
    let acc = 0
    const total = data.reduce((s, d) => s + d.count, 0) || 1
    return data.map((d) => {
      acc += d.count
      return { ...d, cumulative: Math.round((acc / total) * 1000) / 10 }
    })
  }, [data])

  if (!chartData.length) {
    return (
      <div className="flex h-[300px] items-center justify-center text-sm text-muted">
        Pareto 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: '#5b6577', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={50}
          />
          <YAxis yAxisId="count" tick={{ fill: '#5b6577', fontSize: 12 }} axisLine={false} tickLine={false} width={40} />
          <YAxis
            yAxisId="cum"
            orientation="right"
            domain={[0, 100]}
            tick={{ fill: '#5b6577', fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            contentStyle={{ border: '1px solid #e2e6ec', borderRadius: 12, boxShadow: 'none', fontSize: 12 }}
          />
          <Bar yAxisId="count" dataKey="count" name="발생량" fill="#99f6e4" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Line
            yAxisId="cum"
            type="monotone"
            dataKey="cumulative"
            name="누적 비율"
            stroke="#c2410c"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
