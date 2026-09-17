import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { KpiCard } from "../components/kpi/KpiCard";
import { Panel } from "../components/common/Panel";
import { PageHeader } from "../components/common/PageHeader";
import { ResponsiveGrid } from "../components/common/ResponsiveGrid";
import { useData } from "../context/DataContext";
import {
  groupLabel,
  analysisGroupColor,
  ANALYSIS_GROUP_TOTAL_LINE_COLOR,
  type AnalysisGroupId,
} from "../lib/groups";
import { useFilters } from "../context/FilterContext";
import { downloadExcel } from "../lib/download";
import { buildProductDetailHref } from "../lib/productDetailNav";
import { formatPercent, formatPpm, formatWon } from "../lib/format";
import type {
  DailyTrend,
  GroupSummary,
  GroupTrendSeries,
  ProductRow,
} from "../types";
import { AlertTriangle, FileSpreadsheet, Trophy } from "lucide-react";

const trendMetrics = [
  { id: "qty", label: "검수량" },
  { id: "failRate", label: "부적합률" },
  { id: "fail", label: "부적합수량" },
  { id: "scrapCost", label: "폐기비용" },
] as const;

type TrendMetricId = (typeof trendMetrics)[number]["id"];

const LINE_COLOR = ANALYSIS_GROUP_TOTAL_LINE_COLOR;
const LABEL_COLOR = "#ef4444";

function qtySharePct(qty: number, totalQty: number) {
  if (totalQty <= 0 || qty <= 0) return 0;
  return Math.round((qty / totalQty) * 1000) / 10;
}

function GroupComparisonTable({
  summaries,
  selectedGroupId,
  onSelectGroup,
}: {
  summaries: GroupSummary[];
  selectedGroupId: AnalysisGroupId;
  onSelectGroup: (id: AnalysisGroupId) => void;
}) {
  const total = summaries.find((g) => g.id === "all");
  const subgroups = summaries.filter((g) => g.id !== "all");
  const totalQty = total?.qty ?? 0;
  const maxFailRate = Math.max(0, ...subgroups.map((g) => g.failRate));
  const worstFailIds = new Set(
    subgroups
      .filter((g) => g.failRate > 0 && g.failRate === maxFailRate)
      .map((g) => g.id),
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted">검수량 비중</p>
          <p className="num text-xs text-muted">
            합계 {totalQty.toLocaleString()}
          </p>
        </div>
        <div
          className="flex h-2.5 overflow-hidden rounded-full bg-canvas"
          role="img"
          aria-label="분석 그룹별 검수량 비중"
        >
          {subgroups.map((g) => {
            const share = qtySharePct(g.qty, totalQty);
            if (share <= 0) return null;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onSelectGroup(g.id as AnalysisGroupId)}
                className="h-full transition-[width,opacity] duration-300 hover:opacity-90"
                style={{
                  width: `${share}%`,
                  backgroundColor: analysisGroupColor(g.id),
                  opacity:
                    selectedGroupId === "all" || selectedGroupId === g.id
                      ? 1
                      : 0.35,
                }}
                title={`${g.label} ${share}% · 클릭하여 전환`}
                aria-label={`${g.label} ${share}%`}
              />
            );
          })}
        </div>
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted">
          {subgroups.map((g) => {
            const share = qtySharePct(g.qty, totalQty);
            const active =
              selectedGroupId === "all" || selectedGroupId === g.id;
            return (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => onSelectGroup(g.id as AnalysisGroupId)}
                  className={`inline-flex items-center gap-1.5 transition-opacity hover:text-ink ${
                    active ? "text-ink" : "opacity-50"
                  }`}
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: analysisGroupColor(g.id) }}
                  />
                  <span>{g.label}</span>
                  <span className="num">{share}%</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="px-2 py-2 font-medium">그룹</th>
              <th className="px-2 py-2 text-right font-medium">검수량</th>
              <th className="min-w-[140px] px-2 py-2 font-medium">부적합률</th>
              <th className="px-2 py-2 text-right font-medium">부적합수량</th>
              <th className="px-2 py-2 text-right font-medium">폐기비용</th>
            </tr>
          </thead>
          <tbody>
            {summaries.map((g) => {
              const isTotal = g.id === "all";
              const isSelected = selectedGroupId === g.id;
              const color = isTotal
                ? LINE_COLOR
                : analysisGroupColor(g.id);
              const share = isTotal ? 100 : qtySharePct(g.qty, totalQty);
              const failBarPct =
                !isTotal && maxFailRate > 0
                  ? Math.min(100, (g.failRate / maxFailRate) * 100)
                  : 0;
              const isWorst = worstFailIds.has(g.id);

              return (
                <tr
                  key={g.id}
                  className={`border-b border-line/70 transition-colors ${
                    isSelected
                      ? "bg-accent-soft/70"
                      : "hover:bg-canvas/80"
                  } ${isTotal ? "font-medium" : ""}`}
                >
                  <td className="px-2 py-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        onSelectGroup(g.id as AnalysisGroupId)
                      }
                      className="flex w-full min-w-0 items-center gap-2 text-left"
                      aria-pressed={isSelected}
                      title={`${g.label} 분석 그룹으로 전환`}
                    >
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{g.label}</span>
                      {isSelected ? (
                        <span className="shrink-0 rounded-full bg-accent/15 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          선택
                        </span>
                      ) : null}
                      {isWorst ? (
                        <span className="shrink-0 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-medium text-danger">
                          부적합률↑
                        </span>
                      ) : null}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-right">
                    <div className="num">{g.qty.toLocaleString()}</div>
                    {!isTotal ? (
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-canvas">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${share}%`,
                              backgroundColor: color,
                            }}
                          />
                        </div>
                        <span className="num w-9 text-[11px] text-muted">
                          {share}%
                        </span>
                      </div>
                    ) : (
                      <div className="mt-0.5 text-[11px] font-normal text-muted">
                        기준 합계
                      </div>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    <div
                      className={`num text-right ${isWorst ? "font-semibold text-danger" : ""}`}
                    >
                      {formatPpm(g.failRate)}
                    </div>
                    {!isTotal ? (
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${failBarPct}%`,
                            backgroundColor: isWorst ? "#ef4444" : color,
                          }}
                        />
                      </div>
                    ) : null}
                  </td>
                  <td className="num px-2 py-2.5 text-right">
                    {g.fail.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5 text-right">
                    {formatWon(g.scrapCost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const productSortOptions = [
  { id: "fail", label: "부적합수량" },
  { id: "failRate", label: "부적합률" },
  { id: "qty", label: "검수량" },
  { id: "scrapCost", label: "폐기비용" },
] as const;

type ProductSortId = (typeof productSortOptions)[number]["id"];

function rankTone(rank: number): "gold" | "silver" | "bronze" | "muted" {
  if (rank === 1) return "gold";
  if (rank === 2) return "silver";
  if (rank === 3) return "bronze";
  return "muted";
}

function barFill(rank: number): string {
  if (rank === 1) return "#c2410c";
  if (rank === 2) return "#ea580c";
  if (rank === 3) return "#f97316";
  return "#fdba74";
}

function formatProductSortValue(sort: ProductSortId, value: number) {
  if (sort === "failRate") return formatPpm(value);
  if (sort === "scrapCost") return formatWon(value);
  return value.toLocaleString("ko-KR");
}

function ProductDefectTop10({
  products,
  sort,
  onSortChange,
}: {
  products: ProductRow[];
  sort: ProductSortId;
  onSortChange: (sort: ProductSortId) => void;
}) {
  const [hoverId, setHoverId] = useState<string | null>(null);

  const { rows, sortLabel } = useMemo(() => {
    const ranked = [...products]
      .sort((a, b) => b[sort] - a[sort])
      .slice(0, 10);
    const total = products.reduce((s, p) => s + p[sort], 0);
    const max = ranked[0]?.[sort] ?? 0;
    return {
      sortLabel: productSortOptions.find((o) => o.id === sort)?.label ?? "",
      rows: ranked.map((p, idx) => ({
        product: p,
        rank: idx + 1,
        value: p[sort],
        barPercent: max > 0 ? (p[sort] / max) * 100 : 0,
        sharePercent: total > 0 ? (p[sort] / total) * 100 : 0,
        href: buildProductDetailHref(p.id, "dashboard"),
      })),
    };
  }, [products, sort]);

  const hovered = rows.find((r) => r.product.id === hoverId) ?? null;

  return (
    <Panel
      title="품번 기준 불량 TOP 10"
      description={`선택 기간 · ${sortLabel} 상위 10개 품번`}
      actions={
        <div className="flex flex-wrap items-center gap-1.5">
          {productSortOptions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSortChange(opt.id)}
              className="filter-pill"
              data-active={sort === opt.id ? "true" : undefined}
            >
              {opt.label}
            </button>
          ))}
        </div>
      }
    >
      {rows.length === 0 ? (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-muted">
          표시할 품번 불량 데이터가 없습니다.
        </div>
      ) : (
        <div className="flex flex-col gap-3.5">
          <div
            className="op-prod-top-list"
            onMouseLeave={() => setHoverId(null)}
          >
            {rows.map((row) => (
              <div
                key={row.product.id}
                className="op-prod-top-item"
                data-top={row.rank <= 3 ? "true" : undefined}
                onMouseEnter={() => setHoverId(row.product.id)}
              >
                <Link
                  to={row.href}
                  className="op-prod-top-row"
                  data-rank={row.rank}
                  title={`${row.product.name} 상세 보기`}
                >
                  <span
                    className="op-prod-top-rank"
                    data-tone={rankTone(row.rank)}
                  >
                    {row.rank}
                  </span>
                  <div className="op-prod-top-main">
                    <div className="op-prod-top-row-head">
                      <strong className="op-prod-top-name">
                        {row.product.name}
                      </strong>
                      {row.product.mainDefect ? (
                        <span className="op-prod-top-factory">
                          {row.product.mainDefect}
                        </span>
                      ) : null}
                    </div>
                    <div className="op-prod-top-track" aria-hidden>
                      <div
                        className="op-prod-top-fill"
                        style={{
                          width: `${Math.max(row.barPercent, 3)}%`,
                          background: barFill(row.rank),
                        }}
                      />
                    </div>
                  </div>
                  <div className="op-prod-top-metrics">
                    <span className="op-prod-top-qty num">
                      <AlertTriangle size={13} aria-hidden />
                      {formatProductSortValue(sort, row.value)}
                    </span>
                    <span className="op-prod-top-share num">
                      {formatPercent(row.sharePercent)}
                    </span>
                  </div>
                </Link>

                {hovered?.product.id === row.product.id ? (
                  <div className="op-prod-top-tooltip" role="tooltip">
                    <p>
                      <strong>{row.rank}위</strong> · {row.product.name}
                    </p>
                    <p>
                      {sortLabel}: {formatProductSortValue(sort, row.value)}
                    </p>
                    <p>
                      부적합 {row.product.fail.toLocaleString("ko-KR")} ·{" "}
                      {formatPpm(row.product.failRate)}
                    </p>
                    <p>
                      검수 {row.product.qty.toLocaleString("ko-KR")} · 폐기{" "}
                      {formatWon(row.product.scrapCost)}
                    </p>
                    {row.product.mainDefect ? (
                      <p>주불량: {row.product.mainDefect}</p>
                    ) : null}
                    <p className="op-prod-top-tooltip-hint">
                      클릭하여 상세 보기
                    </p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
          <p className="op-prod-top-hint inline-flex items-center gap-1.5">
            <Trophy size={13} aria-hidden />
            막대는 1위 대비 비율 · 우측은 전체 대비 비중
          </p>
        </div>
      )}
    </Panel>
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
  const { filters, setAnalysisGroup } = useFilters();
  const {
    kpis,
    products,
    dailyTrends,
    groupSummaries,
    trendGrain,
    groupTrends,
  } = analytics;
  const [metric, setMetric] = useState<TrendMetricId>("qty");
  const [productSort, setProductSort] = useState<ProductSortId>("fail");

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

      <ResponsiveGrid variant="kpi">
        {kpis.map((item) => (
          <KpiCard key={item.id} item={item} />
        ))}
      </ResponsiveGrid>

      <Panel
        title="분석 그룹 비교"
        description="오류 제외 유효 DATA · 행을 누르면 해당 그룹으로 전환"
      >
        <GroupComparisonTable
          summaries={groupSummaries}
          selectedGroupId={filters.analysisGroup}
          onSelectGroup={setAnalysisGroup}
        />
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

      <ProductDefectTop10
        products={products}
        sort={productSort}
        onSortChange={setProductSort}
      />
    </div>
  );
}
