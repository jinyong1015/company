import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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
import {
  SplitTop10Panel,
  type SplitTop10RowBase,
} from "../components/charts/SplitTop10Panel";
import { PageHeader } from "../components/common/PageHeader";
import { useData } from "../context/DataContext";
import {
  analysisGroupColor,
  ANALYSIS_GROUP_TOTAL_LINE_COLOR,
  type AnalysisGroupId,
} from "../lib/groups";
import { useFilters } from "../context/FilterContext";
import { buildProductDetailHref } from "../lib/productDetailNav";
import { formatPpm, formatWon } from "../lib/format";
import { getProductPhotoUrlMap } from "../lib/productPhotos";
import { isCloudSyncEnabled } from "../lib/supabase";
import type {
  DailyTrend,
  GroupSummary,
  GroupTrendSeries,
  ProductRow,
} from "../types";
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

function GroupSwitchEffect({
  label,
  color,
  onDone,
}: {
  label: string;
  color: string;
  onDone: () => void;
}) {
  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t = window.setTimeout(onDone, reduce ? 200 : 480);
    return () => window.clearTimeout(t);
  }, [onDone, label]);

  return createPortal(
    <div
      className="group-switch-backdrop"
      role="status"
      aria-live="polite"
      aria-label={`${label} 분석 그룹으로 전환`}
    >
      <div className="group-switch-card">
        <span
          className="group-switch-ring"
          style={{ ["--group-switch-color" as string]: color }}
          aria-hidden
        >
          <span
            className="group-switch-dot"
            style={{ backgroundColor: color }}
          />
        </span>
        <p className="group-switch-kicker">분석 그룹 전환</p>
        <p className="group-switch-label">{label}</p>
        <p className="group-switch-hint">필터 · KPI · 추이에 반영됩니다</p>
      </div>
    </div>,
    document.body,
  );
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
  const [switchEffect, setSwitchEffect] = useState<{
    id: AnalysisGroupId;
    label: string;
    color: string;
  } | null>(null);

  const selectGroup = (id: AnalysisGroupId, label: string, color: string) => {
    setSwitchEffect({ id, label, color });
    onSelectGroup(id);
  };

  const sealSummary = subgroups.find((g) => g.id === "seal");
  const hydraulicSummary = subgroups.find((g) => g.id === "hydraulic");
  const plant2Summary = subgroups.find((g) => g.id === "plant2");
  const sealQty = sealSummary?.qty ?? 0;
  const hydraulicQty = hydraulicSummary?.qty ?? 0;
  const plant2Qty = plant2Summary?.qty ?? 0;
  /** GROMMET 비중 = 본사(GROMMET) + 2공장 (색은 파랑·보라로 구분 표시) */
  const grommetQty = hydraulicQty + plant2Qty;
  const sealShare = qtySharePct(sealQty, totalQty);
  const grommetShare = qtySharePct(grommetQty, totalQty);
  const hydraulicWithin =
    grommetQty > 0 ? (hydraulicQty / grommetQty) * 100 : 0;
  const plant2Within = grommetQty > 0 ? (plant2Qty / grommetQty) * 100 : 0;

  return (
    <div className="group-compare">
      {switchEffect ? (
        <GroupSwitchEffect
          key={switchEffect.id + switchEffect.label}
          label={switchEffect.label}
          color={switchEffect.color}
          onDone={() => setSwitchEffect(null)}
        />
      ) : null}

      <div className="group-compare-share">
        <div className="group-compare-share-head">
          <p className="group-compare-share-title">검수량 비중</p>
          <p className="group-compare-share-total num">
            합계 {totalQty.toLocaleString("ko-KR")}
          </p>
        </div>
        <div
          className="group-compare-share-track"
          role="img"
          aria-label="분석 그룹별 검수량 비중"
        >
          {sealShare > 0 ? (
            <button
              type="button"
              onClick={() =>
                selectGroup(
                  "seal",
                  sealSummary?.label ?? "본사(SEAL)",
                  analysisGroupColor("seal"),
                )
              }
              className="group-compare-share-seg"
              style={{
                width: `${sealShare}%`,
                backgroundColor: analysisGroupColor("seal"),
                opacity:
                  selectedGroupId !== "all" && selectedGroupId !== "seal"
                    ? 0.32
                    : 1,
              }}
              title={`${sealSummary?.label ?? "본사(SEAL)"} ${sealShare}% · 클릭하여 전환`}
              aria-label={`${sealSummary?.label ?? "본사(SEAL)"} ${sealShare}%`}
            >
              {sealShare >= 12 ? (
                <span className="group-compare-share-seg-label">
                  SEAL {sealShare}%
                </span>
              ) : null}
            </button>
          ) : null}

          {grommetShare > 0 ? (
            <div
              className="group-compare-share-group"
              style={{ width: `${grommetShare}%` }}
              title={`GROMMET (본사+2공장) ${grommetShare}%`}
            >
              {hydraulicWithin > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    selectGroup(
                      "hydraulic",
                      hydraulicSummary?.label ?? "본사(GROMMET)",
                      analysisGroupColor("hydraulic"),
                    )
                  }
                  className="group-compare-share-seg"
                  style={{
                    width: `${hydraulicWithin}%`,
                    backgroundColor: analysisGroupColor("hydraulic"),
                    opacity:
                      selectedGroupId !== "all" &&
                      selectedGroupId !== "hydraulic" &&
                      selectedGroupId !== "plant2"
                        ? 0.32
                        : selectedGroupId === "plant2"
                          ? 0.55
                          : 1,
                  }}
                  title={`${hydraulicSummary?.label ?? "본사(GROMMET)"} · GROMMET 합계 ${grommetShare}%`}
                  aria-label={`${hydraulicSummary?.label ?? "본사(GROMMET)"} ${qtySharePct(hydraulicQty, totalQty)}%`}
                >
                  {grommetShare >= 12 && hydraulicWithin >= 45 ? (
                    <span className="group-compare-share-seg-label">
                      GROMMET {grommetShare}%
                    </span>
                  ) : null}
                </button>
              ) : null}
              {plant2Within > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    selectGroup(
                      "plant2",
                      plant2Summary?.label ?? "2공장",
                      analysisGroupColor("plant2"),
                    )
                  }
                  className="group-compare-share-seg"
                  style={{
                    width: `${plant2Within}%`,
                    backgroundColor: analysisGroupColor("plant2"),
                    opacity:
                      selectedGroupId !== "all" &&
                      selectedGroupId !== "plant2" &&
                      selectedGroupId !== "hydraulic"
                        ? 0.32
                        : selectedGroupId === "hydraulic"
                          ? 0.55
                          : 1,
                  }}
                  title={`${plant2Summary?.label ?? "2공장"} · GROMMET 합계 ${grommetShare}%`}
                  aria-label={`${plant2Summary?.label ?? "2공장"} ${qtySharePct(plant2Qty, totalQty)}%`}
                >
                  {grommetShare >= 12 &&
                  hydraulicWithin < 45 &&
                  plant2Within >= 40 ? (
                    <span className="group-compare-share-seg-label">
                      GROMMET {grommetShare}%
                    </span>
                  ) : plant2Within >= 18 ? (
                    <span className="group-compare-share-seg-label">2공장</span>
                  ) : null}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="group-compare-grid" role="listbox" aria-label="분석 그룹">
        {summaries.map((g) => {
          const isTotal = g.id === "all";
          const isSelected = selectedGroupId === g.id;
          const color = isTotal ? LINE_COLOR : analysisGroupColor(g.id);
          const share = isTotal ? 100 : qtySharePct(g.qty, totalQty);
          const failBarPct =
            !isTotal && maxFailRate > 0
              ? Math.min(100, (g.failRate / maxFailRate) * 100)
              : isTotal
                ? maxFailRate > 0
                  ? Math.min(100, (g.failRate / maxFailRate) * 100)
                  : 0
                : 0;
          const isWorst = worstFailIds.has(g.id);

          return (
            <button
              key={g.id}
              type="button"
              role="option"
              aria-selected={isSelected}
              className="group-compare-card"
              data-selected={isSelected ? "true" : undefined}
              data-total={isTotal ? "true" : undefined}
              data-worst={isWorst ? "true" : undefined}
              style={{ ["--group-color" as string]: color }}
              onClick={() =>
                selectGroup(g.id as AnalysisGroupId, g.label, color)
              }
              title={`${g.label} 분석 그룹으로 전환`}
            >
              <div className="group-compare-card-head">
                <span className="group-compare-swatch" aria-hidden />
                <div className="group-compare-card-title">
                  <strong>{g.label}</strong>
                  <span className="group-compare-card-sub">
                    {isTotal ? "기준 합계" : `검수 비중 ${share}%`}
                  </span>
                </div>
                <div className="group-compare-badges">
                  {isSelected ? (
                    <span className="group-compare-badge group-compare-badge--selected">
                      선택
                    </span>
                  ) : null}
                  {isWorst ? (
                    <span className="group-compare-badge group-compare-badge--worst">
                      부적합률↑
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="group-compare-metrics">
                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">검수량</span>
                  <strong className="group-compare-metric-value num">
                    {g.qty.toLocaleString("ko-KR")}
                  </strong>
                  {!isTotal ? (
                    <div className="group-compare-bar" aria-hidden>
                      <span style={{ width: `${share}%`, background: color }} />
                    </div>
                  ) : (
                    <div className="group-compare-bar group-compare-bar--ghost" aria-hidden>
                      <span style={{ width: "100%", background: color }} />
                    </div>
                  )}
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">부적합률</span>
                  <strong
                    className={`group-compare-metric-value num ${
                      isWorst ? "is-worst" : ""
                    }`}
                  >
                    {formatPpm(g.failRate)}
                  </strong>
                  <div className="group-compare-bar" aria-hidden>
                    <span
                      style={{
                        width: `${Math.max(failBarPct, failBarPct > 0 ? 6 : 0)}%`,
                        background: isWorst ? "var(--color-danger)" : color,
                      }}
                    />
                  </div>
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">부적합수량</span>
                  <strong className="group-compare-metric-value num">
                    {g.fail.toLocaleString("ko-KR")}
                  </strong>
                </div>

                <div className="group-compare-metric">
                  <span className="group-compare-metric-label">폐기비용</span>
                  <strong className="group-compare-metric-value num">
                    {formatWon(g.scrapCost)}
                  </strong>
                </div>
              </div>
            </button>
          );
        })}
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

function formatProductSortValue(sort: ProductSortId, value: number) {
  if (sort === "failRate") return formatPpm(value);
  if (sort === "scrapCost") return formatWon(value);
  return value.toLocaleString("ko-KR");
}

type ProductTypeTab = "all" | "grommet" | "seal";

const productTypeTabs: { id: ProductTypeTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "grommet", label: "GROMMET" },
  { id: "seal", label: "SEAL" },
];

function matchesProductTypeTab(type: string, tab: ProductTypeTab): boolean {
  if (tab === "all") return true;
  const t = (type || "").toLowerCase();
  if (tab === "seal") {
    return t.includes("seal") || t.includes("실링") || t.includes("씰");
  }
  return (
    t.includes("grommet") || t.includes("그로멧") || t.includes("유압")
  );
}

/** TOP10 탭별 막대색 — SEAL/GROMMET은 품질 추이 그룹색, 전체는 별도 */
const TOP10_ALL_TAB_BAR_COLOR = "#60a5fa";

function top10TabBarColor(tab: ProductTypeTab): string {
  if (tab === "seal") return analysisGroupColor("seal");
  if (tab === "grommet") return analysisGroupColor("hydraulic");
  return TOP10_ALL_TAB_BAR_COLOR;
}

type ProductTop10Row = SplitTop10RowBase & { product: ProductRow };

function ProductDefectTop10({
  products,
  sort,
  onSortChange,
}: {
  products: ProductRow[];
  sort: ProductSortId;
  onSortChange: (sort: ProductSortId) => void;
}) {
  const [typeTab, setTypeTab] = useState<ProductTypeTab>("all");

  const filteredProducts = useMemo(
    () => products.filter((p) => matchesProductTypeTab(p.type, typeTab)),
    [products, typeTab],
  );

  const typeTabCounts = useMemo(() => {
    const counts: Record<ProductTypeTab, number> = {
      all: products.length,
      grommet: 0,
      seal: 0,
    };
    for (const p of products) {
      if (matchesProductTypeTab(p.type, "grommet")) counts.grommet += 1;
      if (matchesProductTypeTab(p.type, "seal")) counts.seal += 1;
    }
    return counts;
  }, [products]);

  const { rows, sortLabel, tabLabel } = useMemo(() => {
    const ranked = [...filteredProducts]
      .sort((a, b) => b[sort] - a[sort])
      .slice(0, 10);
    const total = filteredProducts.reduce((s, p) => s + p[sort], 0);
    const mapped: ProductTop10Row[] = ranked.map((p, idx) => ({
      product: p,
      id: p.id,
      name: p.name,
      rank: idx + 1,
      value: p[sort],
      sharePercent: total > 0 ? (p[sort] / total) * 100 : 0,
      href: buildProductDetailHref(p.id, "dashboard"),
    }));
    return {
      sortLabel: productSortOptions.find((o) => o.id === sort)?.label ?? "",
      tabLabel:
        productTypeTabs.find((t) => t.id === typeTab)?.label ?? "전체",
      rows: mapped,
    };
  }, [filteredProducts, sort, typeTab]);

  const barColor = top10TabBarColor(typeTab);

  const productKeys = useMemo(
    () =>
      [...new Set(rows.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [rows],
  );
  const productKeysSignature = productKeys.join("\u0001");
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isCloudSyncEnabled() || !productKeys.length) {
      setPhotoUrls({});
      return;
    }
    let cancelled = false;
    void getProductPhotoUrlMap(productKeys).then((map) => {
      if (!cancelled) setPhotoUrls(map);
    });
    return () => {
      cancelled = true;
    };
    // productKeysSignature tracks productKeys content
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productKeysSignature]);

  return (
    <SplitTop10Panel
      title="품번 기준 TOP10"
      description={`선택 기간 · 전체 분석그룹 · ${tabLabel} · ${sortLabel} 상위 10개 품번`}
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
      toolbar={
        <div
          className="qty-type-tabs mb-3.5"
          role="tablist"
          aria-label="품번 TOP10 제품유형"
        >
          {productTypeTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={typeTab === tab.id}
              className="qty-type-tab"
              data-active={typeTab === tab.id}
              onClick={() => setTypeTab(tab.id)}
            >
              {tab.label}
              <span className="qty-type-tab-count">
                {typeTabCounts[tab.id]}
              </span>
            </button>
          ))}
        </div>
      }
      rows={rows}
      barColor={barColor}
      photoUrls={photoUrls}
      xAxisAngle={0}
      valueLabel={sortLabel}
      formatValue={(n) => formatProductSortValue(sort, n)}
      emptyMessage="선택한 제품유형에 해당하는 품번 데이터가 없습니다."
      detailKicker="선택 품번"
      detailMeta={(row) =>
        `${row.product.type || "유형 미지정"}${
          row.product.mainDefect ? ` · 주불량 ${row.product.mainDefect}` : ""
        }`
      }
      rankMeta={(row) =>
        `${row.product.type || "유형 미지정"}${
          row.product.mainDefect ? ` · ${row.product.mainDefect}` : ""
        }`
      }
      metrics={[
        {
          label: "부적합수량",
          value: (row) => row.product.fail.toLocaleString("ko-KR"),
        },
        {
          label: "부적합률",
          value: (row) => formatPpm(row.product.failRate),
        },
        {
          label: "검수량",
          value: (row) => row.product.qty.toLocaleString("ko-KR"),
        },
        {
          label: "폐기비용",
          value: (row) => formatWon(row.product.scrapCost),
        },
      ]}
    />
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
  const { analytics } = useData();
  const { filters, setAnalysisGroup } = useFilters();
  const {
    dashboardTop10Products,
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
      <PageHeader title="대시보드" />

      <section className="card dash-linked min-w-0">
        <div className="dash-linked-section">
          <header className="dash-linked-head">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">
                분석 그룹 비교
              </h2>
              <p className="mt-0.5 text-sm text-muted">
                오류 제외 유효 DATA · 행을 누르면 해당 그룹으로 전환
              </p>
            </div>
          </header>
          <GroupComparisonTable
            summaries={groupSummaries}
            selectedGroupId={filters.analysisGroup}
            onSelectGroup={setAnalysisGroup}
          />
        </div>

        <div className="dash-linked-section dash-linked-section--trend">
          <header className="dash-linked-head">
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-ink">품질 추이</h2>
              <p className="mt-0.5 text-sm text-muted">
                {showGrouped
                  ? `${trendGrain === "month" ? "월별" : "일별"} · 그룹 막대 + 합계 추이선`
                  : trendGrain === "month"
                    ? "월별 집계"
                    : "일별 집계"}
              </p>
            </div>
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
          </header>
          <QualityTrendChart
            data={chartData}
            metric={metric}
            metricLabel={metricLabel}
            trendGrain={trendGrain}
            groups={showGrouped ? chartGroups : undefined}
            barColor={selectedGroupColor}
          />
        </div>
      </section>

      <ProductDefectTop10
        products={dashboardTop10Products}
        sort={productSort}
        onSortChange={setProductSort}
      />
    </div>
  );
}
