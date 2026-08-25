import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "../components/kpi/KpiCard";
import { Panel } from "../components/common/Panel";
import { PageHeader } from "../components/common/PageHeader";
import { StatusBadge } from "../components/common/StatusBadge";
import { useData } from "../context/DataContext";
import { groupLabel, analysisGroupColor } from "../lib/groups";
import { useFilters } from "../context/FilterContext";
import { downloadExcel } from "../lib/download";
import { DEFECT_TYPE_COLORS } from "../lib/defectColors";
import { formatPpm, formatWon } from "../lib/format";
import type { DailyTrend, DefectType, GroupTrendSeries } from "../types";
import { FileSpreadsheet } from "lucide-react";

const trendMetrics = [
  { id: "qty", label: "검수량" },
  { id: "failRate", label: "부적합률" },
  { id: "fail", label: "부적합수량" },
  { id: "scrapCost", label: "폐기비용" },
] as const;

type TrendMetricId = (typeof trendMetrics)[number]["id"];

const LINE_COLOR = "#f97316";
const LABEL_COLOR = "#ef4444";

const DEFECT_PIE_COLORS = DEFECT_TYPE_COLORS;
const PIE_LABEL_RADIAN = Math.PI / 180;
/** 7% 미만: 바깥 / 7% 이상: 조각 안 */
const PIE_INNER_LABEL_MIN_SHARE = 7;
const PIE_OUTER_RADIUS = 148;
const PIE_INNER_RADIUS = 72;
const PIE_OUTER_LABEL_GAP = 28;
/** 범례를 오른쪽에 두기 위해 원형 그래프를 왼쪽으로 치우침 */
const PIE_CX_RATIO = 0.42;
/** Pie와 바깥 라벨이 같은 각도를 쓰도록 맞춤 (Recharts computePieSectors) */
const PIE_PADDING_ANGLE = 2;
const PIE_START_ANGLE = 0;
const PIE_END_ANGLE = 360;

function DefectPieInnerLabel(props: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  name?: string;
  payload?: { share?: number };
}) {
  const { cx, cy, midAngle, innerRadius, outerRadius, name, payload } = props;
  if (
    cx == null ||
    cy == null ||
    midAngle == null ||
    innerRadius == null ||
    outerRadius == null
  ) {
    return null;
  }
  const share = Number(payload?.share ?? 0);
  if (share < PIE_INNER_LABEL_MIN_SHARE) return null;

  const radius = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + radius * Math.cos(-midAngle * PIE_LABEL_RADIAN);
  const y = cy + radius * Math.sin(-midAngle * PIE_LABEL_RADIAN);
  return (
    <text
      x={x}
      y={y}
      fill="#fff"
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fontSize: 12, fontWeight: 600, pointerEvents: "none" }}
    >
      <tspan x={x} dy="-0.55em">
        {name}
      </tspan>
      <tspan x={x} dy="1.25em">
        {share}%
      </tspan>
    </text>
  );
}

function spreadLabelYs<T extends { y: number }>(
  items: T[],
  minY: number,
  maxY: number,
  gap: number,
): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].y - sorted[i - 1].y < gap) {
      sorted[i].y = sorted[i - 1].y + gap;
    }
  }
  if (sorted.length && sorted[sorted.length - 1].y > maxY) {
    sorted[sorted.length - 1].y = maxY;
    for (let i = sorted.length - 2; i >= 0; i -= 1) {
      if (sorted[i + 1].y - sorted[i].y < gap) {
        sorted[i].y = sorted[i + 1].y - gap;
      }
    }
  }
  if (sorted.length && sorted[0].y < minY) {
    sorted[0].y = minY;
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].y - sorted[i - 1].y < gap) {
        sorted[i].y = sorted[i - 1].y + gap;
      }
    }
  }
  return sorted;
}

/** Recharts Pie.computePieSectors 와 동일한 midAngle 계산 */
function buildPieSectorMidAngles(items: DefectType[]) {
  const total = items.reduce((s, d) => s + d.count, 0) || 1;
  const notZeroItemCount = items.filter((d) => d.count !== 0).length;
  const absDeltaAngle = Math.min(Math.abs(PIE_END_ANGLE - PIE_START_ANGLE), 360);
  const sign = Math.sign(PIE_END_ANGLE - PIE_START_ANGLE) || 1;
  const paddingAngle = items.length <= 1 ? 0 : PIE_PADDING_ANGLE;
  const totalPaddingAngle =
    (absDeltaAngle >= 360 ? notZeroItemCount : Math.max(0, notZeroItemCount - 1)) *
    paddingAngle;
  const realTotalAngle = absDeltaAngle - totalPaddingAngle;

  const midAngles: number[] = [];
  let prevEndAngle = PIE_START_ANGLE;

  for (let i = 0; i < items.length; i += 1) {
    const val = items[i].count;
    const percent = val / total;
    const tempStartAngle =
      i === 0
        ? PIE_START_ANGLE
        : prevEndAngle + sign * paddingAngle * (val !== 0 ? 1 : 0);
    const tempEndAngle =
      tempStartAngle + sign * (val !== 0 ? percent * realTotalAngle : 0);
    midAngles.push((tempStartAngle + tempEndAngle) / 2);
    prevEndAngle = tempEndAngle;
  }

  return midAngles;
}

function buildOutsideLabelLayout(
  items: DefectType[],
  width: number,
  height: number,
  outerRadius: number,
) {
  if (!width || !height) return [];

  const cx = width * PIE_CX_RATIO;
  const cy = height / 2;
  const midAngles = buildPieSectorMidAngles(items);

  const candidates = items
    .map((d, index) => {
      if (d.share <= 0 || d.share >= PIE_INNER_LABEL_MIN_SHARE) return null;
      const midAngle = midAngles[index] ?? 0;
      const cos = Math.cos(-midAngle * PIE_LABEL_RADIAN);
      const sin = Math.sin(-midAngle * PIE_LABEL_RADIAN);
      return {
        key: `${d.name}-${index}`,
        name: d.name,
        share: d.share,
        midAngle,
        cos,
        sin,
        side: (cos >= 0 ? "right" : "left") as "right" | "left",
        // 조각 바깥 가장자리 중앙에 붙도록
        anchorX: cx + outerRadius * cos,
        anchorY: cy + outerRadius * sin,
        x: cx + (outerRadius + 52) * (cos >= 0 ? 1 : -1),
        y: cy + (outerRadius + 18) * sin,
      };
    })
    .filter((v): v is NonNullable<typeof v> => !!v);

  const right = spreadLabelYs(
    candidates.filter((c) => c.side === "right"),
    20,
    height - 20,
    PIE_OUTER_LABEL_GAP,
  );
  const left = spreadLabelYs(
    candidates.filter((c) => c.side === "left"),
    20,
    height - 20,
    PIE_OUTER_LABEL_GAP,
  );

  return [...left, ...right];
}

function DefectTypePieChart({ data }: { data: DefectType[] }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const outsideLabels = useMemo(
    () =>
      buildOutsideLabelLayout(data, size.width, size.height, PIE_OUTER_RADIUS),
    [data, size.width, size.height],
  );

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <Pie
            data={data}
            dataKey="count"
            nameKey="name"
            cx={`${PIE_CX_RATIO * 100}%`}
            cy="50%"
            startAngle={PIE_START_ANGLE}
            endAngle={PIE_END_ANGLE}
            innerRadius={PIE_INNER_RADIUS}
            outerRadius={PIE_OUTER_RADIUS}
            paddingAngle={PIE_PADDING_ANGLE}
            stroke="#fff"
            strokeWidth={2}
            label={DefectPieInnerLabel}
            labelLine={false}
          >
            {data.map((d, i) => (
              <Cell
                key={`${d.name}-${i}`}
                fill={DEFECT_PIE_COLORS[i % DEFECT_PIE_COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              border: "1px solid #e2e6ec",
              borderRadius: 12,
              boxShadow: "none",
              fontSize: 12,
            }}
            formatter={(value, name, item) => {
              const share = Number(item?.payload?.share ?? 0);
              return [
                `${Number(value ?? 0).toLocaleString()}건 (${share}%)`,
                String(name),
              ];
            }}
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
            // 조각 중앙 → 짧은 방사 연장 → 라벨 높이까지 꺾어 가로로 연결
            const radialX = p.anchorX + p.cos * 10;
            const radialY = p.anchorY + p.sin * 10;
            const elbowX = p.x - (p.side === "right" ? 6 : -6);
            const labelX = p.x + (p.side === "right" ? 4 : -4);
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
                  textAnchor={p.side === "right" ? "start" : "end"}
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
            );
          })}
        </svg>
      ) : null}
    </div>
  );
}

function formatTrendValue(metric: TrendMetricId, value: number) {
  if (metric === "failRate") return formatPpm(value);
  if (metric === "scrapCost") return formatWon(value);
  return value.toLocaleString();
}

function formatLineLabel(value: unknown) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "";
  return Math.round(n).toLocaleString();
}

function yAxisTick(metric: TrendMetricId, v: number) {
  if (metric === "failRate") return `${Math.round(v / 1000)}k`;
  return Math.round(v).toLocaleString("ko-KR");
}

function yAxisWidth(
  metric: TrendMetricId,
  data: Record<string, string | number>[],
  groups?: { id: string }[],
) {
  const keys = groups?.length
    ? ["total", ...groups.map((g) => g.id)]
    : [metric];
  let max = 0;
  for (const row of data) {
    for (const key of keys) {
      const n = Number(row[key] ?? 0);
      if (n > max) max = n;
    }
  }
  const sample = yAxisTick(metric, max || 0);
  // 글자 수에 맞춰 Y축 폭 확보 (최소 48, 백만 단위 이상도 안 잘리게)
  return Math.max(48, Math.min(96, sample.length * 8 + 12));
}

function buildGroupedTrendData(
  groupTrends: GroupTrendSeries[],
  totals: DailyTrend[],
  metric: TrendMetricId,
) {
  const dates = totals.map((t) => t.date);
  return dates.map((date, i) => {
    const row: Record<string, string | number> = {
      date,
      total: totals[i]?.[metric] ?? 0,
    };
    for (const g of groupTrends) {
      row[g.id] = g.trends[i]?.[metric] ?? 0;
    }
    return row;
  });
}

function QualityTrendChart({
  data,
  metric,
  metricLabel,
  trendGrain,
  groups,
  barColor = "#93c5fd",
}: {
  data: Record<string, string | number>[];
  metric: TrendMetricId;
  metricLabel: string;
  trendGrain: "day" | "month";
  groups?: { id: string; label: string; color: string }[];
  /** 단일 그룹(비묶음) 막대 색 — 전체 뷰의 해당 그룹 색과 맞춤 */
  barColor?: string;
}) {
  const tilt = trendGrain === "day" && data.length > 14;
  const grouped = Boolean(groups?.length);
  const denseLabels = data.length > 16;
  const axisWidth = yAxisWidth(metric, data, groups);

  return (
    <div className={`w-full ${grouped ? "h-[380px]" : "h-[320px]"}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{
            top: denseLabels ? 28 : 36,
            right: 16,
            left: 8,
            bottom: tilt ? 28 : 8,
          }}
        >
          <CartesianGrid stroke="#eef1f5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#5b6577" }}
            axisLine={false}
            tickLine={false}
            interval={0}
            minTickGap={4}
            angle={tilt ? -35 : 0}
            textAnchor={tilt ? "end" : "middle"}
            height={tilt ? 50 : 30}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#5b6577" }}
            axisLine={false}
            tickLine={false}
            width={axisWidth}
            tickFormatter={(v) => yAxisTick(metric, Number(v))}
          />
          <Tooltip
            contentStyle={{
              border: "1px solid #e2e6ec",
              borderRadius: 12,
              boxShadow: "none",
              fontSize: 12,
            }}
            formatter={(value, name) => [
              formatTrendValue(metric, Number(value ?? 0)),
              String(name),
            ]}
            labelFormatter={(label) =>
              trendGrain === "month" ? `${label}` : `날짜 ${label}`
            }
          />
          {grouped ? (
            <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          ) : null}
          {grouped ? (
            groups!.map((g) => (
              <Bar
                key={g.id}
                dataKey={g.id}
                name={g.label}
                fill={g.color}
                radius={[3, 3, 0, 0]}
                maxBarSize={trendGrain === "month" ? 28 : 16}
              />
            ))
          ) : (
            <Bar
              dataKey={metric}
              name={metricLabel}
              fill={barColor}
              radius={[4, 4, 0, 0]}
              maxBarSize={trendGrain === "month" ? 40 : 28}
            />
          )}
          <Line
            type="monotone"
            dataKey={grouped ? "total" : metric}
            name={grouped ? `합계(${metricLabel})` : metricLabel}
            stroke={LINE_COLOR}
            strokeWidth={2.4}
            dot={{ r: 4, fill: LABEL_COLOR, stroke: LABEL_COLOR }}
            activeDot={{ r: 5 }}
          >
            <LabelList
              dataKey={grouped ? "total" : metric}
              position="top"
              offset={8}
              fill={LABEL_COLOR}
              fontSize={denseLabels ? 9 : 11}
              fontWeight={600}
              formatter={(v: unknown) => formatLineLabel(v)}
            />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Dashboard() {
  const { analytics, hasUploadedData, meta } = useData();
  const { filters } = useFilters();
  const {
    kpis,
    products,
    dailyTrends,
    defectTypes,
    groupSummaries,
    trendGrain,
    groupTrends,
  } = analytics;
  const [metric, setMetric] = useState<TrendMetricId>("qty");
  const [productSort, setProductSort] = useState<
    "fail" | "failRate" | "qty" | "scrapCost"
  >("fail");

  const productTop = [...products]
    .sort((a, b) => b[productSort] - a[productSort])
    .slice(0, 10);

  const metricLabel = trendMetrics.find((m) => m.id === metric)?.label ?? "";
  const showGrouped = filters.analysisGroup === "all";
  const selectedGroupColor =
    filters.analysisGroup === "all"
      ? LINE_COLOR
      : analysisGroupColor(filters.analysisGroup);

  const chartGroups = useMemo(
    () =>
      groupTrends.map((g) => ({
        id: g.id,
        label: g.label,
        color: analysisGroupColor(g.id),
      })),
    [groupTrends],
  );

  const chartData = useMemo(() => {
    if (showGrouped)
      return buildGroupedTrendData(groupTrends, dailyTrends, metric);
    return dailyTrends.map((d) => ({ ...d }));
  }, [showGrouped, groupTrends, dailyTrends, metric]);

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
          <button
            type="button"
            onClick={() =>
              downloadExcel(
                "대시보드.xlsx",
                groupSummaries.map((g) => ({
                  그룹: g.label,
                  검수량: g.qty,
                  부적합률_ppm: g.failRate,
                  부적합수량: g.fail,
                  폐기비용: g.scrapCost,
                })),
              )
            }
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3.5 py-2 text-sm hover:bg-canvas"
          >
            <FileSpreadsheet size={15} />
            Excel 다운로드
          </button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </div>

      <Panel title="분석 그룹 비교" description="오류 제외 유효 DATA">
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
                  <td className="num px-2 py-2.5">{formatPpm(g.failRate)}</td>
                  <td className="num px-2 py-2.5">{g.fail.toLocaleString()}</td>
                  <td className="num px-2 py-2.5">
                    {formatWon(g.scrapCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="품질 추이"
        description={
          showGrouped
            ? `${trendGrain === "month" ? "월별" : "일별"} · 그룹 막대 + 합계 추이선`
            : trendGrain === "month"
              ? "월별 집계"
              : "일별 집계"
        }
        actions={
          <div className="flex flex-wrap gap-1">
            {trendMetrics.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                className={`rounded-full px-2.5 py-1 text-xs ${
                  metric === m.id
                    ? "bg-accent text-white"
                    : "bg-canvas text-muted"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        }
      >
        <QualityTrendChart
          data={chartData}
          metric={metric}
          metricLabel={metricLabel}
          trendGrain={trendGrain}
          groups={showGrouped ? chartGroups : undefined}
          barColor={selectedGroupColor}
        />
      </Panel>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="불량 유형 TOP 10" description="선택 기간 기준 점유율">
          <div className="flex h-[520px] gap-3">
            {defectTypes.length === 0 ? (
              <div className="flex h-full flex-1 items-center justify-center text-sm text-muted">
                표시할 불량 유형 데이터가 없습니다.
              </div>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <DefectTypePieChart data={defectTypes} />
                </div>
                <ul className="flex w-[148px] shrink-0 flex-col justify-center space-y-1.5 self-stretch text-sm">
                  {defectTypes.map((d, i) => (
                    <li
                      key={`${d.name}-${i}`}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <span
                          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              DEFECT_PIE_COLORS[i % DEFECT_PIE_COLORS.length],
                          }}
                        />
                        <span className="truncate">{d.name}</span>
                      </span>
                      <span className="num shrink-0 text-muted">{d.share}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Panel>

        <Panel
          title="품번 기준 불량 TOP 10"
          actions={
            <select
              value={productSort}
              onChange={(e) =>
                setProductSort(e.target.value as typeof productSort)
              }
              className="rounded-lg border border-line px-2 py-1 text-xs"
            >
              <option value="fail">부적합수량</option>
              <option value="failRate">부적합률</option>
              <option value="qty">검수량</option>
              <option value="scrapCost">폐기비용</option>
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
                    부적합 {p.fail.toLocaleString()} · {formatPpm(p.failRate)} ·{" "}
                    {p.mainDefect}
                  </p>
                </div>
                <StatusBadge status={p.status} />
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
