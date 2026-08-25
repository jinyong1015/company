import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  BAR_COLOR,
  formatAiBarTopLabel,
  formatAiValue,
  type AiBlock,
  type AiValueFormat,
} from '../../lib/aiAsk'
import { DEFECT_TYPE_COLORS } from '../../lib/defectColors'

function tipStyle() {
  return {
    border: '1px solid #e2e6ec',
    borderRadius: 12,
    boxShadow: 'none',
    fontSize: 12,
  } as const
}

function shortName(name: string, max = 10) {
  if (name.length <= max) return name
  return `${name.slice(0, max - 1)}…`
}

function AiBarBlock({
  title,
  data,
  format,
  valueLabel,
}: Extract<AiBlock, { type: 'bar' }>) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted">표시할 데이터가 없습니다.</p>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 28, right: 12, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={0}
              textAnchor="middle"
              height={36}
              tickMargin={8}
              tickFormatter={(v) => shortName(String(v), 14)}
            />
            <YAxis
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v) => formatAiBarTopLabel(Number(v), format)}
            />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value) => [
                formatAiBarTopLabel(Number(value ?? 0), format),
                valueLabel ?? '값',
              ]}
            />
            <Bar dataKey="value" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={42}>
              <LabelList
                dataKey="value"
                position="top"
                offset={6}
                fill="#0f172a"
                fontSize={11}
                fontWeight={600}
                formatter={(v: unknown) =>
                  formatAiBarTopLabel(Number(v ?? 0), format)
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-center text-[11px] text-muted">하단: 제품명 · 상단: 수치</p>
    </div>
  )
}

const PIE_INNER_LABEL_MIN_SHARE = 7
const PIE_LABEL_RADIAN = Math.PI / 180
const PIE_OUTER_RADIUS = 118
const PIE_INNER_RADIUS = 56
const PIE_OUTER_LABEL_GAP = 28
const PIE_CX_RATIO = 0.42
const PIE_PADDING_ANGLE = 2
const PIE_START_ANGLE = 0
const PIE_END_ANGLE = 360

function AiPieInnerLabel(props: {
  cx?: number
  cy?: number
  midAngle?: number
  innerRadius?: number
  outerRadius?: number
  name?: string
  payload?: { share?: number }
}) {
  const { cx, cy, midAngle, innerRadius, outerRadius, name, payload } = props
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null
  ) {
    return null
  }
  const share = Number(payload?.share ?? 0)
  if (share < PIE_INNER_LABEL_MIN_SHARE) return null

  const radius = innerRadius + (outerRadius - innerRadius) * 0.55
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RADIAN)
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 600, pointerEvents: 'none' }}
    >
      <tspan x={x} dy="-0.55em">
        {name}
      </tspan>
      <tspan x={x} dy="1.25em">
        {share}%
      </tspan>
    </text>
  )
}

function spreadLabelYs<T extends { y: number }>(
  items: T[],
  minY: number,
  maxY: number,
  gap: number,
): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]!.y - sorted[i - 1]!.y < gap) {
      sorted[i]!.y = sorted[i - 1]!.y + gap
    }
  }
  if (sorted.length && sorted[sorted.length - 1]!.y > maxY) {
    sorted[sorted.length - 1]!.y = maxY
    for (let i = sorted.length - 2; i >= 0; i -= 1) {
      if (sorted[i + 1]!.y - sorted[i]!.y < gap) {
        sorted[i]!.y = sorted[i + 1]!.y - gap
      }
    }
  }
  if (sorted.length && sorted[0]!.y < minY) {
    sorted[0]!.y = minY
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.y - sorted[i - 1]!.y < gap) {
        sorted[i]!.y = sorted[i - 1]!.y + gap
      }
    }
  }
  return sorted
}

function buildPieSectorMidAngles(items: { value: number }[]) {
  const total = items.reduce((s, d) => s + d.value, 0) || 1
  const notZeroItemCount = items.filter((d) => d.value !== 0).length
  const absDeltaAngle = Math.min(Math.abs(PIE_END_ANGLE - PIE_START_ANGLE), 360)
  const sign = Math.sign(PIE_END_ANGLE - PIE_START_ANGLE) || 1
  const paddingAngle = items.length <= 1 ? 0 : PIE_PADDING_ANGLE
  const totalPaddingAngle =
    (absDeltaAngle >= 360 ? notZeroItemCount : Math.max(0, notZeroItemCount - 1)) *
    paddingAngle
  const realTotalAngle = absDeltaAngle - totalPaddingAngle

  const midAngles: number[] = []
  let prevEndAngle = PIE_START_ANGLE

  for (let i = 0; i < items.length; i += 1) {
    const val = items[i]!.value
    const percent = val / total
    const tempStartAngle =
      i === 0
        ? PIE_START_ANGLE
        : prevEndAngle + sign * paddingAngle * (val !== 0 ? 1 : 0)
    const tempEndAngle =
      tempStartAngle + sign * (val !== 0 ? percent * realTotalAngle : 0)
    midAngles.push((tempStartAngle + tempEndAngle) / 2)
    prevEndAngle = tempEndAngle
  }

  return midAngles
}

function buildOutsideLabelLayout(
  items: { name: string; value: number; share: number }[],
  width: number,
  height: number,
  outerRadius: number,
) {
  if (!width || !height) return []

  const cx = width * PIE_CX_RATIO
  const cy = height / 2
  const midAngles = buildPieSectorMidAngles(items)

  const candidates = items
    .map((d, index) => {
      if (d.share <= 0 || d.share >= PIE_INNER_LABEL_MIN_SHARE) return null
      const midAngle = midAngles[index] ?? 0
      const cos = Math.cos(-midAngle * PIE_LABEL_RADIAN)
      const sin = Math.sin(-midAngle * PIE_LABEL_RADIAN)
      return {
        key: `${d.name}-${index}`,
        name: d.name,
        share: d.share,
        midAngle,
        cos,
        sin,
        side: (cos >= 0 ? 'right' : 'left') as 'right' | 'left',
        anchorX: cx + outerRadius * cos,
        anchorY: cy + outerRadius * sin,
        x: cx + (outerRadius + 52) * (cos >= 0 ? 1 : -1),
        y: cy + (outerRadius + 18) * sin,
      }
    })
    .filter((v): v is NonNullable<typeof v> => !!v)

  const right = spreadLabelYs(
    candidates.filter((c) => c.side === 'right'),
    20,
    height - 20,
    PIE_OUTER_LABEL_GAP,
  )
  const left = spreadLabelYs(
    candidates.filter((c) => c.side === 'left'),
    20,
    height - 20,
    PIE_OUTER_LABEL_GAP,
  )

  return [...left, ...right]
}

function AiPieBlock({ title, data }: Extract<AiBlock, { type: 'pie' }>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const outsideLabels = useMemo(
    () => buildOutsideLabelLayout(data, size.width, size.height, PIE_OUTER_RADIUS),
    [data, size.width, size.height],
  )

  if (!data.length) {
    return (
      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted">불량유형 데이터가 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{title}</p>
      <div ref={hostRef} className="relative mt-2 h-[360px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx={`${PIE_CX_RATIO * 100}%`}
              cy="50%"
              startAngle={PIE_START_ANGLE}
              endAngle={PIE_END_ANGLE}
              outerRadius={PIE_OUTER_RADIUS}
              innerRadius={PIE_INNER_RADIUS}
              paddingAngle={PIE_PADDING_ANGLE}
              stroke="#fff"
              strokeWidth={2}
              label={AiPieInnerLabel}
              labelLine={false}
            >
              {data.map((d, i) => (
                <Cell
                  key={`${d.name}-${i}`}
                  fill={DEFECT_TYPE_COLORS[i % DEFECT_TYPE_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value, _n, item) => [
                `${Number(value).toLocaleString()}건 (${item.payload.share}%)`,
                '발생량',
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {size.width > 0 ? (
          <svg
            className="pointer-events-none absolute inset-0"
            width={size.width}
            height={size.height}
          >
            {outsideLabels.map((p) => {
              const radialX = p.anchorX + p.cos * 10
              const radialY = p.anchorY + p.sin * 10
              const elbowX = p.x - (p.side === 'right' ? 6 : -6)
              const labelX = p.x + (p.side === 'right' ? 4 : -4)
              return (
                <g key={p.key}>
                  <path
                    d={`M${p.anchorX},${p.anchorY}L${radialX},${radialY}L${elbowX},${p.y}L${p.x},${p.y}`}
                    stroke="#94a3b8"
                    strokeWidth={1.25}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx={p.anchorX} cy={p.anchorY} r={2.25} fill="#64748b" />
                  <text
                    x={labelX}
                    y={p.y}
                    fill="#334155"
                    textAnchor={p.side === 'right' ? 'start' : 'end'}
                    dominantBaseline="central"
                    style={{ fontSize: 11, fontWeight: 600 }}
                  >
                    <tspan x={labelX} dy="-0.45em">
                      {p.name}
                    </tspan>
                    <tspan x={labelX} dy="1.15em">
                      {p.share}%
                    </tspan>
                  </text>
                </g>
              )
            })}
          </svg>
        ) : null}
      </div>
    </div>
  )
}

function shortCountLabel(v: number, format: AiValueFormat) {
  if (format === 'count') return Math.round(v).toLocaleString()
  if (format === 'ppm') return formatAiBarTopLabel(v, format)
  return formatAiValue(v, format)
}

function yAxisPlotWidth(
  data: Record<string, string | number>[],
  series: { key: string }[],
  format: AiValueFormat,
) {
  let max = 0
  for (const row of data) {
    for (const s of series) {
      const n = Number(row[s.key] ?? 0)
      if (n > max) max = n
    }
  }
  const sample = formatAiBarTopLabel(max || 0, format)
  return Math.max(64, Math.min(96, sample.length * 8 + 18))
}

function LineValueLabel(props: {
  x?: number
  y?: number
  value?: number | string
  fill?: string
  seriesIndex?: number
  format?: AiValueFormat
  dense?: boolean
  /** 0~1, 작을수록 X축(월)에 가까움 */
  valueRatio?: number
  /** 같은 X 시점의 시리즈 값들 (높낮이 비교용) */
  peers?: number[]
}) {
  const {
    x = 0,
    y = 0,
    value,
    fill = '#0f172a',
    seriesIndex = 0,
    format = 'count',
    dense = false,
    valueRatio = 1,
    peers = [],
  } = props
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return null

  const peerVals = peers.length ? peers : [n]
  const nearBottom = valueRatio < 0.3 || n === 0
  const ranked = peerVals
    .map((v, i) => ({ v, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
  const rank = Math.max(
    0,
    ranked.findIndex((r) => r.i === seriesIndex),
  )
  const isHighest = rank === 0
  const isLowest = rank === ranked.length - 1

  // 값이 더 큰 시리즈 → 점 위, 작은 시리즈 → 점 아래 (하단 근처면 모두 위)
  let above = true
  let stack = 0
  if (nearBottom || peerVals.length <= 1) {
    above = true
    stack = rank
  } else if (isHighest && !isLowest) {
    above = true
    stack = 0
  } else if (isLowest && !isHighest) {
    above = false
    stack = 0
  } else {
    // 동점이거나 3개 이상 중간값: 위쪽에 순위대로 쌓기
    above = true
    stack = rank
  }

  const dy = above ? -(12 + stack * 15) : 22 + stack * 15

  return (
    <text
      x={x}
      y={y + dy}
      fill={fill}
      fontSize={dense ? 9 : 11}
      fontWeight={600}
      textAnchor="middle"
      dominantBaseline={above ? 'auto' : 'hanging'}
    >
      {shortCountLabel(n, format)}
      {format === 'count' ? (
        <tspan fontSize={dense ? 8 : 9} fontWeight={500}>
          건
        </tspan>
      ) : null}
    </text>
  )
}

function AiLineBlock({
  title,
  data,
  xKey,
  series,
  format = 'count',
}: Extract<AiBlock, { type: 'line' }>) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted">추이 데이터가 없습니다.</p>
      </div>
    )
  }
  const dense = data.length > 20
  const axisWidth = yAxisPlotWidth(data, series, format as AiValueFormat)
  let maxVal = 0
  for (const row of data) {
    for (const s of series) {
      const n = Number(row[s.key] ?? 0)
      if (n > maxVal) maxVal = n
    }
  }
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{
              top: series.length > 1 ? 16 : 28,
              right: 20,
              left: 12,
              bottom: 36,
            }}
          >
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              height={36}
              tickMargin={12}
              padding={{ left: 18, right: 18 }}
            />
            <YAxis
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={axisWidth}
              padding={{ top: 8, bottom: 28 }}
              tickFormatter={(v) =>
                formatAiBarTopLabel(Number(v), format as AiValueFormat)
              }
            />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value, name) => [
                formatAiBarTopLabel(Number(value ?? 0), format as AiValueFormat),
                String(name),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 4 }} />
            {series.map((s, seriesIndex) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2.2}
                dot={{ r: 3.5, fill: '#fff', stroke: s.color, strokeWidth: 2 }}
              >
                {series.length <= 3 ? (
                  <LabelList
                    dataKey={s.key}
                    content={(p) => {
                      const raw = Number(p.value ?? 0)
                      const idx = typeof p.index === 'number' ? p.index : 0
                      const row = data[idx]
                      const peers = series.map((ser) => Number(row?.[ser.key] ?? 0))
                      return (
                        <LineValueLabel
                          x={typeof p.x === 'number' ? p.x : undefined}
                          y={typeof p.y === 'number' ? p.y : undefined}
                          value={p.value as number | string | undefined}
                          fill={s.color}
                          seriesIndex={seriesIndex}
                          format={format as AiValueFormat}
                          dense={dense || series.length > 1}
                          valueRatio={maxVal > 0 ? raw / maxVal : 0}
                          peers={peers}
                        />
                      )
                    }}
                  />
                ) : null}
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AiMultiBarBlock({
  title,
  data,
  xKey,
  series,
  format = 'count',
}: Extract<AiBlock, { type: 'multiBar' }>) {
  if (!data.length) {
    return (
      <div className="rounded-xl border border-line p-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-2 text-sm text-muted">표시할 데이터가 없습니다.</p>
      </div>
    )
  }
  const tilt = data.length > 14
  const showLabels = data.length <= 24
  const dense = data.length > 12 || series.length > 2
  const axisWidth = yAxisPlotWidth(data, series, format as AiValueFormat)
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: showLabels ? 32 : 16, right: 16, left: 12, bottom: tilt ? 28 : 8 }}
          >
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              interval={0}
              angle={tilt ? -35 : 0}
              textAnchor={tilt ? 'end' : 'middle'}
              height={tilt ? 50 : 30}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={axisWidth}
              padding={{ top: 8, bottom: 4 }}
              tickFormatter={(v) =>
                formatAiBarTopLabel(Number(v), format as AiValueFormat)
              }
            />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value, name) => [
                formatAiBarTopLabel(Number(value ?? 0), format as AiValueFormat),
                String(name),
              ]}
            />
            {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
            {series.map((s) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={series.length > 1 ? 28 : 36}
              >
                {showLabels ? (
                  <LabelList
                    dataKey={s.key}
                    position="top"
                    offset={6}
                    fill={s.color}
                    fontSize={dense ? 9 : 11}
                    fontWeight={600}
                    formatter={(v: unknown) => {
                      const n = Number(v ?? 0)
                      if (!Number.isFinite(n)) return ''
                      return formatAiBarTopLabel(n, format as AiValueFormat)
                    }}
                  />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AiComposedBlock({
  title,
  description,
  data,
  xKey,
  bars,
  line,
  format,
}: Extract<AiBlock, { type: 'composed' }>) {
  const barsOnly = !line
  const dense = data.length > 10
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      <div className="mt-2 h-[340px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: barsOnly ? 32 : 28, right: 16, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="#eef1f5" vertical={false} />
            <XAxis
              dataKey={xKey}
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#5b6577', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v) => formatAiBarTopLabel(Number(v), format)}
            />
            <Tooltip
              contentStyle={tipStyle()}
              formatter={(value, name) => [
                formatAiBarTopLabel(Number(value ?? 0), format),
                String(name),
              ]}
            />
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
            {bars.map((b) => (
              <Bar
                key={b.key}
                dataKey={b.key}
                name={b.label}
                fill={b.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={barsOnly ? 26 : 22}
              >
                {barsOnly ? (
                  <LabelList
                    dataKey={b.key}
                    position="top"
                    offset={4}
                    fill={b.color}
                    fontSize={dense ? 8 : 10}
                    fontWeight={600}
                    formatter={(v: unknown) =>
                      formatAiBarTopLabel(Number(v ?? 0), format)
                    }
                  />
                ) : null}
              </Bar>
            ))}
            {line ? (
              <Line
                type="monotone"
                dataKey={line.key}
                name={line.label}
                stroke={line.color}
                strokeWidth={2.4}
                dot={{ r: 3, fill: line.color }}
              >
                <LabelList
                  dataKey={line.key}
                  position="top"
                  offset={6}
                  fill="#ef4444"
                  fontSize={10}
                  fontWeight={600}
                  formatter={(v: unknown) =>
                    formatAiBarTopLabel(Number(v ?? 0), format)
                  }
                />
              </Line>
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function AiTableBlock({ title, headers, rows }: Extract<AiBlock, { type: 'table' }>) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">해당 조건의 품번이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-[640px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                {headers.map((h) => (
                  <th key={h} className="px-2 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={`${row[1]}-${i}`} className="border-b border-line/70">
                  {row.map((cell, j) => (
                    <td
                      key={`${i}-${j}`}
                      className={`px-2 py-2 ${j === 0 || j >= 3 ? 'num' : ''} ${j === 1 ? 'font-medium' : ''}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function AiAnswerBlocks({ blocks }: { blocks: AiBlock[] }) {
  return (
    <div className="mt-3 space-y-3">
      {blocks.map((block, i) => {
        const key = `${block.type}-${i}`
        if (block.type === 'text') {
          return (
            <ul key={key} className="space-y-1 text-sm text-muted">
              {block.lines.map((line, idx) => (
                <li key={`${i}-${idx}`}>{line}</li>
              ))}
            </ul>
          )
        }
        if (block.type === 'bar') return <AiBarBlock key={key} {...block} />
        if (block.type === 'pie') return <AiPieBlock key={key} {...block} />
        if (block.type === 'line') return <AiLineBlock key={key} {...block} />
        if (block.type === 'multiBar') return <AiMultiBarBlock key={key} {...block} />
        if (block.type === 'composed') return <AiComposedBlock key={key} {...block} />
        if (block.type === 'table') return <AiTableBlock key={key} {...block} />
        return null
      })}
    </div>
  )
}
