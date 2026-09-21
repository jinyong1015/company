import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  Coins,
  HardHat,
  LayoutDashboard,
  Package,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { ResponsiveGrid } from "../components/common/ResponsiveGrid";
import { StatusBadge } from "../components/common/StatusBadge";
import { DefectPieChart } from "../components/charts/DefectCharts";
import { useData } from "../context/DataContext";
import {
  cloneFilterState,
  useFilters,
  type FilterState,
} from "../context/FilterContext";
import {
  analyzeRecords,
  buildDefectEquipmentMoldAnalysis,
  filterRecords,
  resolvePeriodRange,
} from "../lib/analyze";
import { fromEntityId, toEntityId } from "../lib/entityId";
import {
  parseProductDetailFrom,
  PRODUCT_DETAIL_FROM_LABELS,
  PRODUCT_DETAIL_FROM_PATHS,
  buildWeeklyReportBackHref,
  buildWorkerAnalysisBackHref,
  buildInspectorAnalysisBackHref,
  type ProductDetailFromId,
} from "../lib/productDetailNav";
import {
  failRatePpm,
  formatPercent,
  formatPpm,
  formatPpmAsPercent,
  formatWonSuffix,
  statusByPpm,
} from "../lib/format";
import {
  DEFECT_ALL_COLOR,
  defectTypeColor,
} from "../lib/defectColors";
import type { Analytics, InspectionRecord, ProductRow } from "../types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readUrlDateRange(searchParams: URLSearchParams) {
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  if (
    !startDate ||
    !endDate ||
    !DATE_PATTERN.test(startDate) ||
    !DATE_PATTERN.test(endDate)
  ) {
    return null;
  }
  return { startDate, endDate };
}

const BACK_NAV_ICONS: Record<ProductDetailFromId, LucideIcon> = {
  "weekly-report": CalendarRange,
  dashboard: LayoutDashboard,
  products: Package,
  quality: Activity,
  workers: HardHat,
  inspectors: Users,
  cost: Coins,
};

function buildBackNav(from: ProductDetailFromId, searchParams: URLSearchParams) {
  const path =
    from === "weekly-report"
      ? buildWeeklyReportBackHref(searchParams)
      : from === "workers"
        ? buildWorkerAnalysisBackHref(searchParams)
        : from === "inspectors"
          ? buildInspectorAnalysisBackHref(searchParams)
          : PRODUCT_DETAIL_FROM_PATHS[from];

  return {
    from,
    label: PRODUCT_DETAIL_FROM_LABELS[from],
    path,
    icon: BACK_NAV_ICONS[from],
  };
}

export function ProductDetail() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const { analytics, records } = useData();
  const { filters, setCustomDateRange, replaceFilters } = useFilters();
  const name = fromEntityId(id, "prd");
  const urlDateRange = useMemo(
    () => readUrlDateRange(searchParams),
    [searchParams],
  );
  const urlWorker = (searchParams.get("worker") ?? "").trim();
  const urlInspector = (searchParams.get("inspector") ?? "").trim();
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  // 주간업무 보고·성형작업자·검사자 등 URL 기간은 상세 화면에만 임시 반영하고,
  // 이탈 시 진입 전 전역 조회기준으로 복원한다.
  useLayoutEffect(() => {
    if (!urlDateRange) return;

    const snapshot = cloneFilterState(filtersRef.current);
    setCustomDateRange(urlDateRange.startDate, urlDateRange.endDate);

    return () => {
      replaceFilters(snapshot);
    };
  }, [
    urlDateRange?.startDate,
    urlDateRange?.endDate,
    setCustomDateRange,
    replaceFilters,
  ]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [id, searchParams]);

  const effectiveFilters = useMemo<FilterState>(() => {
    const withPeriod = urlDateRange
      ? {
          ...filters,
          period: "custom" as const,
          startDate: urlDateRange.startDate,
          endDate: urlDateRange.endDate,
        }
      : filters;
    if (urlWorker) return { ...withPeriod, workers: [urlWorker] };
    if (urlInspector) return { ...withPeriod, inspectors: [urlInspector] };
    return withPeriod;
  }, [filters, urlDateRange, urlWorker, urlInspector]);

  const scoped = useMemo(
    () =>
      filterRecords(records, effectiveFilters, true).filter((r) => {
        if (r.product !== name) return false;
        if (urlWorker) return r.worker === urlWorker && r.qty > 0;
        if (urlInspector) return r.inspector === urlInspector && r.qty > 0;
        return true;
      }),
    [records, effectiveFilters, name, urlWorker, urlInspector],
  );

  const productAnalytics = useMemo(
    () =>
      urlDateRange || urlWorker || urlInspector
        ? analyzeRecords(records, effectiveFilters)
        : analytics,
    [urlDateRange, urlWorker, urlInspector, records, effectiveFilters, analytics],
  );

  const product =
    productAnalytics.products.find(
      (p) => p.id === id || p.id === toEntityId("prd", name) || p.name === name,
    ) ?? null;
  const trendRange = resolvePeriodRange(effectiveFilters);

  const backFrom = parseProductDetailFrom(searchParams.get("from"));
  const backNav = buildBackNav(backFrom, searchParams);
  const fromWeeklyReport = backFrom === "weekly-report";
  const fromWorkers = backFrom === "workers";
  const fromInspectors = backFrom === "inspectors";
  const rangeStart = searchParams.get("startDate");
  const rangeEnd = searchParams.get("endDate");
  const periodRange =
    (fromWeeklyReport || fromWorkers || fromInspectors) &&
    rangeStart &&
    rangeEnd
      ? { start: rangeStart, end: rangeEnd }
      : null;

  const personScope = urlWorker
    ? { label: "성형작업자", value: urlWorker }
    : urlInspector
      ? { label: "검사자", value: urlInspector }
      : null;

  if (!name) {
    return (
      <div className="space-y-5">
        <PageHeader title="품번 상세" description="대상을 찾을 수 없습니다." />
      </div>
    );
  }

  if (!product && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <ProductDetailBackNav
          backNav={backNav}
          periodRange={periodRange}
          personScope={personScope}
        />
        <PageHeader
          title={name}
          description={
            personScope
              ? `${personScope.label} ${personScope.value} · 선택한 기간에 이 품번 실적이 없습니다.`
              : "선택한 기간/분석 그룹에 이 품번의 DATA가 없습니다."
          }
        />
        <Panel>
          <p className="text-sm text-muted">
            기간이나 분석 그룹을 바꿔 다시 확인해 주세요.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <ProductDetailBody
      name={name}
      product={product}
      scoped={scoped}
      analytics={productAnalytics}
      backNav={backNav}
      periodRange={periodRange}
      trendRange={trendRange}
      personScope={personScope}
    />
  );
}

function ProductDetailBackNav({
  backNav,
  periodRange,
  personScope,
}: {
  backNav: ReturnType<typeof buildBackNav>;
  periodRange?: { start: string; end: string } | null;
  personScope?: { label: string; value: string } | null;
}) {
  const Icon = backNav.icon;

  return (
    <nav aria-label="품번 상세 돌아가기" className="sticky top-16 z-10">
      <Link
        to={backNav.path}
        className="group flex items-center gap-3 rounded-2xl border-2 border-accent/50 bg-white p-3 shadow-[0_8px_24px_rgba(59,130,246,0.12)] ring-1 ring-accent/20 transition hover:border-accent hover:bg-accent/[0.03] hover:shadow-[0_12px_28px_rgba(59,130,246,0.18)] sm:gap-4 sm:p-4"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-sm transition group-hover:bg-blue-600 sm:h-12 sm:w-12">
          <ArrowLeft size={20} strokeWidth={2.5} aria-hidden />
        </span>

        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/25 sm:h-12 sm:w-12">
          <Icon size={20} strokeWidth={2.25} aria-hidden />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold tracking-[0.12em] text-accent uppercase">
            돌아가기
          </span>
          <span className="mt-0.5 block truncate text-base font-bold text-ink transition group-hover:text-accent sm:text-lg">
            {backNav.label}
          </span>
        </span>

        {personScope ? (
          <span className="hidden shrink-0 rounded-xl border border-line bg-canvas px-3 py-2 text-right sm:block">
            <span className="block text-[10px] font-semibold tracking-wide text-muted uppercase">
              {personScope.label}
            </span>
            <span className="mt-0.5 block max-w-[9rem] truncate text-xs font-semibold text-ink">
              {personScope.value}
            </span>
          </span>
        ) : null}

        {periodRange ? (
          <span className="hidden shrink-0 rounded-xl border border-line bg-canvas px-3 py-2 text-right sm:block">
            <span className="block text-[10px] font-semibold tracking-wide text-muted uppercase">
              조회기간
            </span>
            <span className="num mt-0.5 block text-xs font-semibold text-ink">
              {periodRange.start} ~ {periodRange.end}
            </span>
          </span>
        ) : null}

        <ChevronRight
          size={20}
          className="shrink-0 text-muted/60 transition group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden
        />
      </Link>
      {(personScope || periodRange) && (
        <p className="mt-2 px-1 text-center text-xs font-medium text-muted sm:hidden">
          {personScope ? (
            <span>
              {personScope.label}{" "}
              <span className="font-semibold text-ink">{personScope.value}</span>
            </span>
          ) : null}
          {personScope && periodRange ? <span className="mx-1.5">·</span> : null}
          {periodRange ? (
            <span className="num">
              조회기간 {periodRange.start} ~ {periodRange.end}
            </span>
          ) : null}
        </p>
      )}
    </nav>
  );
}

function ProductDetailBody({
  name,
  product,
  scoped,
  analytics,
  backNav,
  periodRange,
  trendRange,
  personScope,
}: {
  name: string;
  product: ProductRow | null;
  scoped: InspectionRecord[];
  analytics: Analytics;
  backNav: ReturnType<typeof buildBackNav>;
  periodRange?: { start: string; end: string } | null;
  trendRange: { start: Date; end: Date };
  personScope?: { label: string; value: string } | null;
}) {
  const qty = product?.qty ?? scoped.reduce((s, r) => s + r.qty, 0);
  const pass = product?.pass ?? scoped.reduce((s, r) => s + r.pass, 0);
  const fail = product?.fail ?? scoped.reduce((s, r) => s + r.fail, 0);
  const scrapCost =
    product?.scrapCost ?? scoped.reduce((s, r) => s + r.scrapCost, 0);
  const minutes =
    product?.minutes ??
    Math.round(scoped.reduce((s, r) => s + r.hours, 0) * 60);
  const hours = product?.hours ?? scoped.reduce((s, r) => s + r.hours, 0);
  const uph = product?.uph ?? (hours > 0 ? Math.round(qty / hours) : 0);
  const failRate = product?.failRate ?? failRatePpm(fail, qty);
  const defects = product?.defects ?? [];
  const status = product?.status ?? statusByPpm(failRate);
  const type = product?.type ?? scoped[0]?.productType ?? "미지정";

  /** 빈 문자열 = 전체 불량 (초기 진입 기본값) */
  const [selectedDefect, setSelectedDefect] = useState("");
  const [trendMetric, setTrendMetric] = useState<"qty" | "scrapCost">("qty");

  const selectedDefectColor = useMemo(() => {
    if (!selectedDefect) return DEFECT_ALL_COLOR;
    const idx = defects.findIndex((d) => d.name === selectedDefect);
    return idx >= 0 ? defectTypeColor(idx) : DEFECT_ALL_COLOR;
  }, [defects, selectedDefect]);

  useEffect(() => {
    if (!defects.length) {
      setSelectedDefect("");
      return;
    }
    if (
      selectedDefect &&
      !defects.some((d) => d.name === selectedDefect)
    ) {
      setSelectedDefect("");
    }
  }, [defects, selectedDefect]);

  const defectDrill = useMemo(
    () => buildDefectEquipmentMoldAnalysis(scoped, selectedDefect),
    [scoped, selectedDefect],
  );

  const startMonthIndex =
    trendRange.start.getFullYear() * 12 + trendRange.start.getMonth();
  const endMonthIndex =
    trendRange.end.getFullYear() * 12 + trendRange.end.getMonth();
  const isMonthlyTrend = endMonthIndex - startMonthIndex >= 2;

  const trendData = Object.values(
    scoped.reduce<
      Record<
        string,
        {
          period: string;
          date: string;
          qty: number;
          fail: number;
          scrapCost: number;
        }
      >
    >(
      (acc, r) => {
        const period = isMonthlyTrend ? r.date.slice(0, 7) : r.date;
        if (!acc[period])
          acc[period] = {
            period,
            date: isMonthlyTrend ? period : r.date.slice(5),
            qty: 0,
            fail: 0,
            scrapCost: 0,
          };
        acc[period].qty += r.qty;
        acc[period].fail += r.fail;
        acc[period].scrapCost += r.scrapCost;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => a.period.localeCompare(b.period))
    .map((d) => ({
      ...d,
      failRate: failRatePpm(d.fail, d.qty),
    }));

  const workerUph = analytics.workerProductUph
    .filter(
      (w) =>
        w.product === name &&
        (personScope?.label !== "성형작업자" || w.worker === personScope.value),
    )
    .sort(
      (a, b) =>
        b.failRate - a.failRate || a.worker.localeCompare(b.worker, "ko"),
    );
  const inspectorUph = analytics.inspectorProductUph
    .filter(
      (row) =>
        row.product === name &&
        (personScope?.label !== "검사자" ||
          row.inspector === personScope.value),
    )
    .sort(
      (a, b) =>
        b.uph - a.uph || a.inspector.localeCompare(b.inspector, "ko"),
    );

  return (
    <div className="space-y-5">
      <ProductDetailBackNav
        backNav={backNav}
        periodRange={periodRange}
        personScope={personScope}
      />

      <PageHeader
        title={name}
        description={
          personScope
            ? `${type} · ${personScope.label} ${personScope.value} · 선택 기간 실적 기준`
            : periodRange
              ? `${type} · 선택 주차 품번 상세`
              : `${type} · 선택한 기간/분석 그룹 기준`
        }
        actions={<StatusBadge status={status} />}
      />

      <ResponsiveGrid variant="kpi">
        {[
          ["검사량", qty.toLocaleString()],
          ["합격수량", pass.toLocaleString()],
          ["부적합수량", fail.toLocaleString()],
          ["폐기비용", formatWonSuffix(scrapCost)],
          ["소요시간(분)", minutes.toLocaleString()],
          ["UPH", String(uph)],
          ["부적합률", `${formatPpm(failRate)}`],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </ResponsiveGrid>

      <ResponsiveGrid variant="split">
        <Panel
          title="기간별 부적합률 추이"
          description={`${isMonthlyTrend ? "월별" : "일별"} ${
            trendMetric === "qty" ? "검수량" : "폐기비용"
          }과 부적합률을 함께 비교합니다.`}
          actions={
            <div
              role="group"
              aria-label="차트 조회 기준"
              className="inline-flex items-center rounded-full border border-line bg-canvas/80 p-1"
            >
              {[
                { id: "qty" as const, label: "검수량" },
                { id: "scrapCost" as const, label: "폐기비용" },
              ].map((metric) => (
                <button
                  key={metric.id}
                  type="button"
                  aria-pressed={trendMetric === metric.id}
                  onClick={() => setTrendMetric(metric.id)}
                  className={`min-w-[72px] rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                    trendMetric === metric.id
                      ? "bg-white text-accent shadow-sm ring-1 ring-black/5"
                      : "text-muted hover:bg-white/60 hover:text-ink"
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="rounded-2xl border border-line/70 bg-white px-3 pb-3 pt-4">
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendData}
                  margin={{ top: 28, right: 8, left: 12, bottom: 0 }}
                >
                  <CartesianGrid
                    stroke="#e5eaf1"
                    strokeDasharray="4 4"
                    vertical={false}
                  />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="metric"
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                  width={trendMetric === "scrapCost" ? 120 : 80}
                  tickFormatter={(value) =>
                    trendMetric === "scrapCost"
                      ? formatWonSuffix(Number(value))
                      : Number(value).toLocaleString()
                  }
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tickFormatter={(value) => formatPpm(Number(value))}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #dbe3ee",
                    borderRadius: 14,
                    boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                    fontSize: 12,
                    backgroundColor: "rgba(255, 255, 255, 0.96)",
                  }}
                  cursor={{ fill: "rgba(59, 130, 246, 0.06)" }}
                  formatter={(value, name) => {
                    const numericValue = Number(value ?? 0);
                    if (name === "부적합률")
                      return [formatPpm(numericValue), name];
                    if (name === "폐기비용")
                      return [formatWonSuffix(numericValue), name];
                    return [numericValue.toLocaleString(), String(name)];
                  }}
                  labelFormatter={(label) =>
                    `${isMonthlyTrend ? "월" : "날짜"} ${label}`
                  }
                />
                <Bar
                  yAxisId="metric"
                  dataKey={trendMetric}
                  name={trendMetric === "qty" ? "검수량" : "폐기비용"}
                  fill="#93c5fd"
                  radius={[7, 7, 2, 2]}
                  maxBarSize={30}
                />
                <Line
                  yAxisId="rate"
                  type="monotone"
                  dataKey="failRate"
                  name="부적합률"
                  stroke="#e05252"
                  strokeWidth={2.5}
                  dot={{ r: 2.5, fill: "#fff", strokeWidth: 2 }}
                  activeDot={{
                    r: 5,
                    fill: "#fff",
                    stroke: "#e05252",
                    strokeWidth: 2.5,
                  }}
                >
                  <LabelList
                    dataKey="failRate"
                    position="top"
                    offset={8}
                    fill="#b84343"
                    fontSize={9}
                    fontWeight={600}
                    formatter={(value: unknown) => {
                      const rate = Math.round(Number(value ?? 0));
                      return rate > 0 ? rate.toLocaleString() : "";
                    }}
                  />
                </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-[11px] font-medium text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-blue-400" />
                {trendMetric === "qty" ? "검수량" : "폐기비용"}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded-full bg-red-500" />
                부적합률 (ppm)
              </span>
            </div>
          </div>
        </Panel>
        <Panel
          title="불량 유형별 발생량"
          description="품질 분석과 동일한 색상 · 원그래프"
        >
          <DefectPieChart data={defects} />
        </Panel>
      </ResponsiveGrid>

      <Panel
        title="불량 내역 상세"
        description="유형을 선택하면 아래 설비·금형 비중이 바로 바뀝니다."
        className="transition-[border-color,box-shadow] duration-200"
        style={{
          borderColor: selectedDefectColor,
          boxShadow: `0 0 0 1px color-mix(in srgb, ${selectedDefectColor} 35%, transparent)`,
        }}
      >
        {defects.length ? (
          <>
            <div
              className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2.5"
              style={{
                borderColor: `color-mix(in srgb, ${selectedDefectColor} 45%, transparent)`,
                background: `color-mix(in srgb, ${selectedDefectColor} 8%, transparent)`,
              }}
            >
              <p className="text-sm text-ink">
                <span
                  className="font-medium"
                  style={{ color: selectedDefectColor }}
                >
                  불량 유형을 선택
                </span>
                해 설비·금형별 발생 비중을 확인하세요.
              </p>
              <p className="text-xs text-muted">
                현재 선택{" "}
                <span
                  className="font-semibold"
                  style={{ color: selectedDefectColor }}
                >
                  {selectedDefect || "전체"}
                </span>
              </p>
            </div>

            <div
              className="grid-dense max-h-[360px] overflow-y-auto pr-1"
              role="radiogroup"
              aria-label="불량 유형 선택"
            >
              {(
                [
                  {
                    key: "__all__",
                    value: "",
                    label: "전체",
                    count: defects.reduce((s, d) => s + d.count, 0),
                    share: 100,
                    color: DEFECT_ALL_COLOR,
                  },
                  ...defects.map((d, i) => ({
                    key: d.name,
                    value: d.name,
                    label: d.name,
                    count: d.count,
                    share: d.share,
                    color: defectTypeColor(i),
                  })),
                ] as const
              ).map((d) => {
                const active = d.value === selectedDefect;
                return (
                  <button
                    key={d.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedDefect(d.value)}
                    className={`group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      active
                        ? "shadow-sm"
                        : "border-line bg-white hover:bg-canvas"
                    }`}
                    style={
                      active
                        ? {
                            borderColor: d.color,
                            background: `color-mix(in srgb, ${d.color} 12%, var(--card))`,
                            boxShadow: `0 0 0 1px color-mix(in srgb, ${d.color} 35%, transparent)`,
                          }
                        : undefined
                    }
                  >
                    <span
                      className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
                      style={{
                        borderColor: active ? d.color : "var(--border)",
                      }}
                      aria-hidden
                    >
                      {active ? (
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: d.color }}
                        />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ background: d.color }}
                            aria-hidden
                          />
                          <span
                            className={`truncate text-sm font-semibold ${
                              active ? "" : "text-ink"
                            }`}
                            style={active ? { color: d.color } : undefined}
                          >
                            {d.label}
                          </span>
                        </span>
                        {active ? (
                          <span
                            className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ background: d.color }}
                          >
                            선택됨
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] text-muted opacity-0 transition group-hover:opacity-100">
                            클릭
                          </span>
                        )}
                      </span>
                      <span className="mt-1.5 flex items-baseline justify-between gap-2 text-xs text-muted">
                        <span className="num">
                          {d.count.toLocaleString()}건
                        </span>
                        <span className="num font-medium text-ink/80">
                          {d.share.toFixed(1)}%
                        </span>
                      </span>
                      <span className="mt-2 block h-1 overflow-hidden rounded-full bg-line/70">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${Math.min(100, d.share)}%`,
                            background: d.color,
                            opacity: active ? 1 : 0.55,
                          }}
                        />
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">이 기간에 불량 상세가 없습니다.</p>
        )}

        {defects.length && defectDrill.total > 0 ? (
          <div className="mt-5 border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2 py-1 text-xs font-semibold text-white"
                style={{ background: selectedDefectColor }}
              >
                {defectDrill.defectName}
              </span>
              <span className="text-sm font-medium text-ink">
                설비 · 금형 비중
              </span>
              <span className="text-xs text-muted">
                총 {defectDrill.total.toLocaleString()}건
              </span>
            </div>
            <div className="grid-split">
            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-medium">
                설비별 비중
                <span className="ml-2 text-xs font-normal text-muted">
                  {defectDrill.defectName} · {defectDrill.total.toLocaleString()}
                  건
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                해당 불량이 어느 설비에서 얼마나 발생했는지 · 설비 아래 금형
                비중
              </p>
              <ul className="mt-3 space-y-3">
                {defectDrill.equipments.map((eq) => (
                  <li
                    key={eq.equipment}
                    className="rounded-lg border border-line/80 bg-canvas/40 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{eq.equipment}</span>
                      <span className="num text-muted">
                        {eq.count.toLocaleString()}건 ·{" "}
                        {formatPercent(eq.share)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, eq.share)}%`,
                          background: selectedDefectColor,
                        }}
                      />
                    </div>
                    <ul
                      className="mt-2 space-y-1 border-l-2 pl-3 text-xs text-muted"
                      style={{
                        borderColor: `color-mix(in srgb, ${selectedDefectColor} 40%, var(--border))`,
                      }}
                    >
                      <li className="font-medium text-ink/70">금형</li>
                      {eq.molds.map((m) => (
                        <li
                          key={`${eq.equipment}-${m.name}`}
                          className="flex justify-between gap-2"
                        >
                          <span>{m.name}</span>
                          <span className="num">
                            {m.count.toLocaleString()}건 ·{" "}
                            {formatPercent(m.share)}
                          </span>
                        </li>
                      ))}
                      {!eq.molds.length && <li>금형 DATA 없음</li>}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-line p-4">
              <p className="text-sm font-medium">
                금형별 비중
                <span className="ml-2 text-xs font-normal text-muted">
                  {defectDrill.defectName} 전체 기준
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                해당 불량 제품을 작업한 금형별 발생 비율
              </p>
              <ul className="mt-3 space-y-2">
                {defectDrill.molds.map((m) => (
                  <li
                    key={m.name}
                    className="rounded-lg border border-line/80 px-3 py-2.5"
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{m.name}</span>
                      <span className="num text-muted">
                        {m.count.toLocaleString()}건 · {formatPercent(m.share)}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line/60">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, m.share)}%`,
                          background: selectedDefectColor,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </li>
                ))}
                {!defectDrill.molds.length && (
                  <li className="text-sm text-muted">금형 DATA 없음</li>
                )}
              </ul>
            </div>
            </div>
          </div>
        ) : defects.length ? (
          <p className="mt-4 text-sm text-muted">
            {selectedDefect
              ? "선택한 불량 유형의 설비·금형 DATA가 없습니다."
              : "전체 기준 설비·금형 DATA가 없습니다."}
          </p>
        ) : null}
      </Panel>

      <ResponsiveGrid variant="split">
        {(
          [
            ["금형", [...new Set(scoped.map((r) => r.moldNo).filter(Boolean))]],
            [
              "설비",
              [...new Set(scoped.map((r) => r.equipment).filter(Boolean))],
            ],
          ] as const
        ).map(([title, items]) => {
          const sorted = [...items].sort((a, b) => a.localeCompare(b, "ko"));
          return (
            <Panel
              key={title}
              title={title}
              description={`이 품번·기간 기준 ${sorted.length}개 전체`}
            >
              <div className="max-h-72 overflow-y-auto pr-1">
                <ul className="space-y-1.5 text-sm">
                  {sorted.map((item) => (
                    <li key={item} className="border-b border-line/60 py-1.5">
                      {item}
                    </li>
                  ))}
                  {!sorted.length && (
                    <li className="text-muted">없음</li>
                  )}
                </ul>
              </div>
            </Panel>
          );
        })}
      </ResponsiveGrid>

      <Panel
        title="작업자별 품번 상세"
        description={`${name}를 담당한 작업자별 검사·불량 현황 · 불량률 높은 순`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[800px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">성형 작업자</th>
                <th className="px-2 py-2 font-medium">실적수량</th>
                <th className="px-2 py-2 font-medium">합격</th>
                <th className="px-2 py-2 font-medium">부적합</th>
                <th className="px-2 py-2 font-medium">불량률(%)</th>
                <th className="px-2 py-2 font-medium">불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {workerUph.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">
                    <Link
                      to={`/workers/${toEntityId("wrk", row.worker)}?product=${encodeURIComponent(name)}`}
                      className="text-accent hover:underline"
                    >
                      {row.worker}
                    </Link>
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.qty.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.pass.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.fail.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5 font-semibold">
                    {formatPpmAsPercent(row.failRate)}
                  </td>
                  <td className="px-2 py-2.5 text-xs">{row.defectSummary}</td>
                </tr>
              ))}
              {!workerUph.length && (
                <tr>
                  <td colSpan={6} className="px-2 py-4 text-sm text-muted">
                    이 기간에 작업자별 DATA가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        title="검사자별 품번 UPH"
        description={`${name}를 검사한 검사자 효율 · UPH 높은 순`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">검사자</th>
                <th className="px-2 py-2 font-medium">소속</th>
                <th className="px-2 py-2 font-medium">검사량</th>
                <th className="px-2 py-2 font-medium">합격</th>
                <th className="px-2 py-2 font-medium">부적합</th>
                <th className="px-2 py-2 font-medium">소요시간(분)</th>
                <th className="px-2 py-2 font-medium">UPH</th>
                <th className="px-2 py-2 font-medium">불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {inspectorUph.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">
                    <Link
                      to={`/inspectors/${toEntityId("ins", row.inspector)}?product=${encodeURIComponent(name)}`}
                      className="text-accent hover:underline"
                    >
                      {row.inspector}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">{row.team}</td>
                  <td className="num px-2 py-2.5">
                    {row.qty.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.pass.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.fail.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">
                    {row.minutes.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5 font-semibold">{row.uph}</td>
                  <td className="px-2 py-2.5 text-xs">{row.defectSummary}</td>
                </tr>
              ))}
              {!inspectorUph.length && (
                <tr>
                  <td colSpan={8} className="px-2 py-4 text-sm text-muted">
                    이 기간에 검사자별 DATA가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
