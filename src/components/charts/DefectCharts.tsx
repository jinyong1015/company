import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from 'recharts'
import { useMemo } from 'react'
import type { DefectType } from '../../types'
import { DEFECT_TYPE_COLORS } from '../../lib/defectColors'

/** 예: 31758 → 32000 처럼 읽기 쉬운 정수로 올림 */
function niceCeil(value: number): number {
  if (value <= 0) return 1
  const exp = Math.floor(Math.log10(value))
  const step = 10 ** Math.max(0, exp - 1)
  return Math.ceil(value / step) * step
}

export function DefectBarChart({ data }: { data: DefectType[] }) {
  const chartData = useMemo(
    () => data.map((d, i) => ({ ...d, rank: i + 1 })),
    [data],
  )

  const xMax = useMemo(() => {
    const maxCount = Math.max(0, ...data.map((d) => d.count))
    if (maxCount <= 0) return 1
    return niceCeil(maxCount / 0.75)
  }, [data])

  const nameToRank = useMemo(() => {
    const map = new Map<string, number>()
    data.forEach((d, i) => map.set(d.name, i + 1))
    return map
  }, [data])

  if (!data.length) {
    return (
      <div className="flex h-[360px] items-center justify-center text-sm text-muted">
        불량 유형 데이터가 없습니다.
      </div>
    )
  }

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 8, right: 56, left: 4, bottom: 4 }}
          barCategoryGap="18%"
        >
          <CartesianGrid stroke="#eef1f5" horizontal={false} strokeDasharray="3 6" />
          <XAxis
            type="number"
            domain={[0, xMax]}
            allowDecimals={false}
            tickCount={5}
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            tickFormatter={(v) => Math.round(Number(v)).toLocaleString()}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={108}
            tick={{ fill: '#0f172a', fontSize: 12, fontWeight: 600 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(name) => {
              const rank = nameToRank.get(String(name))
              return rank ? `${rank}. ${name}` : String(name)
            }}
          />
          <Tooltip
            cursor={{ fill: 'rgba(59, 130, 246, 0.06)' }}
            contentStyle={{
              border: '1px solid #e2e6ec',
              borderRadius: 12,
              boxShadow: 'none',
              fontSize: 12,
            }}
            formatter={(value, _n, item) => [
              `${Number(value).toLocaleString()}건 (${item.payload.share}%)`,
              '발생량',
            ]}
          />
          <Bar
            dataKey="count"
            radius={[0, 6, 6, 0]}
            maxBarSize={26}
            isAnimationActive={false}
          >
            {chartData.map((d, i) => (
              <Cell
                key={`${d.name}-${i}`}
                fill={DEFECT_TYPE_COLORS[i % DEFECT_TYPE_COLORS.length]}
              />
            ))}
            <LabelList
              dataKey="share"
              position="right"
              offset={8}
              fill="#334155"
              fontSize={12}
              fontWeight={600}
              formatter={(v: unknown) => `${Number(v ?? 0)}%`}
            />
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
