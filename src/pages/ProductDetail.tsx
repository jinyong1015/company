import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Coins,
  Factory,
  Gauge,
  HardHat,
  LayoutDashboard,
  Package,
  PackageX,
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
import {
  DetailBackNav,
  DetailDefectChips,
  DetailHero,
  DetailKpiStrip,
  DetailSnapshotBanner,
} from "../components/detail/DetailChrome";
import { ProductPhotoPanel } from "../components/product/ProductPhotoPanel";
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
  preferDisplayItem,
  sameItemMatchKey,
} from "../lib/itemMatchKey";
import {
  parseProductDetailFrom,
  PRODUCT_DETAIL_FROM_LABELS,
  PRODUCT_DETAIL_FROM_PATHS,
  buildWeeklyReportBackHref,
  buildWorkerAnalysisBackHref,
  buildInspectorAnalysisBackHref,
  buildWorkerDetailHref,
  buildInspectorDetailHref,
  readUrlDateRange,
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
import { useDetailInspectionData } from "../hooks/useDetailInspectionData";
import { useWeeklySnapshotSourceRecords } from "../hooks/useWeeklySnapshotSourceRecords";
import type { Analytics, InspectionRecord, ProductRow } from "../types";

const BACK_NAV_ICONS: Record<ProductDetailFromId, LucideIcon> = {
  "weekly-report": CalendarRange,
  dashboard: LayoutDashboard,
  products: Package,
  quality: Activity,
  workers: HardHat,
  inspectors: Users,
  cost: Coins,
  equipment: Factory,
  ai: Package,
  compare: Activity,
  "vina-products": Package,
  "vina-quality": Activity,
  "vina-inspectors": Users,
  "vina-cost": Coins,
  "vina-ai": Package,
  "vina-compare": Activity,
};

function buildBackNav(
  from: ProductDetailFromId,
  searchParams: URLSearchParams,
  productName?: string,
  vina = false,
) {
  const path =
    from === "weekly-report"
      ? buildWeeklyReportBackHref(searchParams)
      : from === "workers"
        ? buildWorkerAnalysisBackHref(searchParams, productName)
        : from === "inspectors" || from === "vina-inspectors"
          ? buildInspectorAnalysisBackHref(searchParams, productName, {
              vina: vina || from === "vina-inspectors",
            })
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
  const {
    source: dataSource,
    analytics,
    records: liveRecords,
    ignoreAnalysisGroup,
  } = useDetailInspectionData();
  const isVina = dataSource === "vina";
  const { filters, setCustomDateRange, replaceFilters } = useFilters();
  const name = fromEntityId(id, "prd");
  // 주간보고 확정본 → VINA 상세: vinaDetailRecords / 그 외 VINA: 라이브 VINA
  const snapshotId = searchParams.get("snapshotId")?.trim() || null;
  const {
    records: snapshotRecords,
    usingSnapshot,
    status: snapshotStatus,
    error: snapshotError,
  } = useWeeklySnapshotSourceRecords(
    snapshotId,
    isVina ? "vina" : "main",
  );
  const sourceRecords =
    usingSnapshot || !isVina ? snapshotRecords : liveRecords;
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
    const base: FilterState =
      usingSnapshot || isVina
        ? {
            ...filters,
            analysisGroup: "all",
            ...(usingSnapshot
              ? {
                  teams: [],
                  inspectors: [],
                  workTypes: [],
                  productTypes: [],
                  products: [],
                  molds: [],
                  equipment: [],
                  workers: [],
                  lots: [],
                }
              : {}),
          }
        : filters;
    const withPeriod = urlDateRange
      ? {
          ...base,
          period: "custom" as const,
          startDate: urlDateRange.startDate,
          endDate: urlDateRange.endDate,
        }
      : base;
    if (urlWorker) return { ...withPeriod, workers: [urlWorker] };
    if (urlInspector) return { ...withPeriod, inspectors: [urlInspector] };
    return withPeriod;
  }, [filters, urlDateRange, urlWorker, urlInspector, usingSnapshot, isVina]);

  const filterOpts = useMemo(
    () => (ignoreAnalysisGroup ? { ignoreAnalysisGroup: true } : undefined),
    [ignoreAnalysisGroup],
  );

  const scoped = useMemo(
    () =>
      filterRecords(sourceRecords, effectiveFilters, true, filterOpts).filter(
        (r) => {
          if (!sameItemMatchKey(r.product, name)) return false;
          if (urlWorker) return r.worker === urlWorker && r.qty > 0;
          if (urlInspector) return r.inspector === urlInspector && r.qty > 0;
          return true;
        },
      ),
    [
      sourceRecords,
      effectiveFilters,
      filterOpts,
      name,
      urlWorker,
      urlInspector,
    ],
  );

  // VINA도 목록과 동일하게 context analytics를 재사용한다.
  // (isVina일 때마다 analyzeRecords를 다시 돌리면 세부 진입이 버벅인다.)
  const productAnalytics = useMemo(
    () =>
      usingSnapshot || urlDateRange || urlWorker || urlInspector
        ? analyzeRecords(sourceRecords, effectiveFilters)
        : analytics,
    [
      usingSnapshot,
      urlDateRange,
      urlWorker,
      urlInspector,
      sourceRecords,
      effectiveFilters,
      analytics,
    ],
  );

  const displayName = useMemo(() => {
    if (!name) return "";
    const fromScoped = preferDisplayItem(scoped.map((r) => r.product));
    if (fromScoped) return fromScoped;
    const fromAnalytics = productAnalytics.products.find((p) =>
      sameItemMatchKey(p.name, name),
    )?.name;
    return fromAnalytics || name;
  }, [name, scoped, productAnalytics.products]);

  const product =
    productAnalytics.products.find(
      (p) =>
        p.id === id ||
        p.id === toEntityId("prd", name) ||
        p.id === toEntityId("prd", displayName) ||
        sameItemMatchKey(p.name, name),
    ) ?? null;
  const trendRange = resolvePeriodRange(effectiveFilters);

  const backFrom = parseProductDetailFrom(searchParams.get("from"), {
    vina: isVina,
  });
  const backNav = buildBackNav(backFrom, searchParams, name, isVina);
  const fromWeeklyReport = backFrom === "weekly-report";
  const fromWorkers = backFrom === "workers";
  const fromInspectors =
    backFrom === "inspectors" || backFrom === "vina-inspectors";
  const rangeStart = searchParams.get("startDate");
  const rangeEnd = searchParams.get("endDate");
  // 7차: URL에 기간이 있으면(AI·VINA 목록 등) 상세에도 동일 기간 표시
  const periodRange = urlDateRange
    ? { start: urlDateRange.startDate, end: urlDateRange.endDate }
    : (fromWeeklyReport || fromWorkers || fromInspectors) &&
        rangeStart &&
        rangeEnd
      ? { start: rangeStart, end: rangeEnd }
      : null;

  const personScope = urlWorker
    ? { label: "성형작업자", value: urlWorker }
    : urlInspector
      ? { label: "검사자", value: urlInspector }
      : null;

  const snapshotBanner = usingSnapshot ? (
    <DetailSnapshotBanner status={snapshotStatus} error={snapshotError} />
  ) : null;

  const backMetas = [
    ...(personScope
      ? [{ label: personScope.label, value: personScope.value }]
      : []),
    ...(periodRange
      ? [
          {
            label: "조회기간",
            value: `${periodRange.start} ~ ${periodRange.end}`,
          },
        ]
      : []),
  ];

  if (!name) {
    return (
      <div className="space-y-5">
        <PageHeader title="품번 상세" description="대상을 찾을 수 없습니다." />
      </div>
    );
  }

  if (usingSnapshot && snapshotStatus === "loading") {
    return (
      <div className="space-y-5">
        <DetailBackNav
          to={backNav.path}
          label={backNav.label}
          ariaLabel="품번 상세 돌아가기"
          Icon={backNav.icon}
          metas={backMetas}
        />
        {snapshotBanner}
      </div>
    );
  }

  if (!product && scoped.length === 0) {
    return (
      <div className="space-y-5">
        <DetailBackNav
          to={backNav.path}
          label={backNav.label}
          ariaLabel="품번 상세 돌아가기"
          Icon={backNav.icon}
          metas={backMetas}
        />
        {snapshotBanner}
        <DetailHero
          eyebrow="품번 상세"
          title={displayName || name}
          description={
            personScope
              ? `${personScope.label} ${personScope.value} · 선택한 기간에 이 품번 실적이 없습니다.`
              : "선택한 기간/분석 그룹에 이 품번의 DATA가 없습니다."
          }
        />
        <Panel>
          <p className="text-sm text-muted">
            {usingSnapshot
              ? "스냅샷에 저장된 원본 행 기준으로 해당 품번 DATA가 없습니다."
              : "기간이나 분석 그룹을 바꿔 다시 확인해 주세요."}
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <>
      {snapshotBanner ? <div className="mb-5">{snapshotBanner}</div> : null}
      <ProductDetailBody
        name={displayName || name}
        product={product}
        scoped={scoped}
        analytics={productAnalytics}
        backNav={backNav}
        periodRange={periodRange}
        trendRange={trendRange}
        personScope={personScope}
        isVina={isVina}
      />
    </>
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
  isVina,
}: {
  name: string;
  product: ProductRow | null;
  scoped: InspectionRecord[];
  analytics: Analytics;
  backNav: ReturnType<typeof buildBackNav>;
  periodRange?: { start: string; end: string } | null;
  trendRange: { start: Date; end: Date };
  personScope?: { label: string; value: string } | null;
  isVina: boolean;
}) {
  const [searchParams] = useSearchParams();
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
  const originalItem = useMemo(() => {
    if (!isVina) return null;
    for (const r of scoped) {
      const raw = String(r.extras?.["원본ITEM"] ?? "").trim();
      if (raw && raw !== name) return raw;
    }
    return null;
  }, [isVina, scoped, name]);

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
        sameItemMatchKey(w.product, name) &&
        (personScope?.label !== "성형작업자" || w.worker === personScope.value),
    )
    .sort(
      (a, b) =>
        b.failRate - a.failRate || a.worker.localeCompare(b.worker, "ko"),
    );
  const inspectorUph = analytics.inspectorProductUph
    .filter(
      (row) =>
        sameItemMatchKey(row.product, name) &&
        (personScope?.label !== "검사자" ||
          row.inspector === personScope.value),
    )
    .sort(
      (a, b) =>
        b.uph - a.uph || a.inspector.localeCompare(b.inspector, "ko"),
    );

  return (
    <div className="space-y-5">
      <DetailBackNav
        to={backNav.path}
        label={backNav.label}
        ariaLabel="품번 상세 돌아가기"
        Icon={backNav.icon}
        metas={[
          ...(personScope
            ? [{ label: personScope.label, value: personScope.value }]
            : []),
          ...(periodRange
            ? [
                {
                  label: "조회기간",
                  value: `${periodRange.start} ~ ${periodRange.end}`,
                },
              ]
            : []),
        ]}
      />

      <DetailHero
        eyebrow={isVina ? "VINA 품번 상세" : "품번 상세"}
        title={name}
        description={
          personScope
            ? `${type} · ${personScope.label} ${personScope.value} · 선택 기간 실적 기준`
            : periodRange
              ? `${type} · ${isVina ? "VINA" : "선택"} 기간 품번 상세`
              : `${type} · ${isVina ? "VINA DATA" : "선택한 기간/분석 그룹"} 기준`
        }
        chips={[
          ...(isVina ? ["데이터 출처: VINA"] : []),
          type,
          ...(originalItem ? [`원본 ITEM: ${originalItem}`] : []),
          ...(personScope ? [`${personScope.label} ${personScope.value}`] : []),
          ...(periodRange
            ? [`${periodRange.start} ~ ${periodRange.end}`]
            : []),
        ]}
        actions={<StatusBadge status={status} />}
      />

      <div className="detail-top">
        {/* 사진은 matchKey로 기존 품번 재사용 가능. 집계 KPI는 VINA/기존 source만 사용(7차) */}
        <ProductPhotoPanel productKey={name} />
        <DetailKpiStrip
          items={[
            {
              label: "검사량",
              value: qty.toLocaleString(),
              tone: "accent",
              icon: Package,
            },
            {
              label: "합격수량",
              value: pass.toLocaleString(),
              tone: "ok",
              icon: CheckCircle2,
            },
            {
              label: "부적합수량",
              value: fail.toLocaleString(),
              tone: fail > 0 ? "danger" : "default",
              icon: PackageX,
            },
            {
              label: "폐기비용",
              value: formatWonSuffix(scrapCost),
              tone: "warn",
              icon: Coins,
            },
            {
              label: "소요시간(분)",
              value: minutes.toLocaleString(),
              icon: Clock3,
            },
            {
              label: "UPH",
              value: String(uph),
              tone: "accent",
              icon: Gauge,
            },
            {
              label: "부적합률",
              value: formatPpm(failRate),
              tone: failRate > 0 ? "danger" : "default",
              icon: AlertTriangle,
            },
          ]}
        />
      </div>

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
              className="detail-seg"
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
                  className={`detail-seg-btn${
                    trendMetric === metric.id ? " is-active" : ""
                  }`}
                >
                  {metric.label}
                </button>
              ))}
            </div>
          }
        >
          <div className="detail-chart-frame">
            <div className="h-[268px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={trendData}
                  margin={{ top: 22, right: 6, left: 4, bottom: 4 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid
                    stroke="#e8eef5"
                    strokeDasharray="3 6"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "#7b8798", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    dy={4}
                  />
                  <YAxis
                    yAxisId="metric"
                    tick={{ fontSize: 10.5, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={trendMetric === "scrapCost" ? 88 : 56}
                    tickFormatter={(value) => {
                      const n = Number(value);
                      if (trendMetric === "scrapCost") {
                        if (n >= 1_000_000)
                          return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}백만`;
                        if (n >= 10_000) return `${Math.round(n / 10_000)}만`;
                        return formatWonSuffix(n);
                      }
                      if (n >= 1_000_000)
                        return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
                      if (n >= 1_000) return `${Math.round(n / 1000)}K`;
                      return String(n);
                    }}
                  />
                  <YAxis
                    yAxisId="rate"
                    orientation="right"
                    tick={{ fontSize: 10.5, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={58}
                    tickFormatter={(value) => `${Math.round(Number(value))}ppm`}
                  />
                  <Tooltip
                    contentStyle={{
                      border: "1px solid #dbe3ee",
                      borderRadius: 14,
                      boxShadow: "0 10px 28px rgba(15, 23, 42, 0.08)",
                      fontSize: 12,
                      backgroundColor: "rgba(255, 255, 255, 0.97)",
                      padding: "10px 12px",
                    }}
                    cursor={{ fill: "rgba(59, 130, 246, 0.05)" }}
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
                    fill="#7db4f8"
                    radius={[8, 8, 3, 3]}
                    maxBarSize={34}
                  />
                  <Line
                    yAxisId="rate"
                    type="monotone"
                    dataKey="failRate"
                    name="부적합률"
                    stroke="#d45555"
                    strokeWidth={2.4}
                    dot={{
                      r: 3.2,
                      fill: "#fff",
                      stroke: "#d45555",
                      strokeWidth: 2,
                    }}
                    activeDot={{
                      r: 5.5,
                      fill: "#fff",
                      stroke: "#d45555",
                      strokeWidth: 2.5,
                    }}
                  >
                    <LabelList
                      dataKey="failRate"
                      position="top"
                      offset={10}
                      fill="#b33f3f"
                      fontSize={10}
                      fontWeight={650}
                      formatter={(value: unknown) => {
                        const rate = Math.round(Number(value ?? 0));
                        return rate > 0 ? rate.toLocaleString() : "";
                      }}
                    />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="detail-chart-legend" aria-hidden>
              <span className="detail-chart-legend-item">
                <span className="detail-chart-swatch detail-chart-swatch-bar" />
                {trendMetric === "qty" ? "검수량" : "폐기비용"}
              </span>
              <span className="detail-chart-legend-item">
                <span className="detail-chart-swatch detail-chart-swatch-line" />
                부적합률 (ppm)
              </span>
            </div>
          </div>
        </Panel>
        <Panel
          title="불량 유형별 발생량"
          description="품질 분석과 동일한 색상 · 원그래프"
        >
          <div className="detail-chart-frame detail-chart-frame-pie">
            <DefectPieChart data={defects} />
          </div>
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
                {sorted.length ? (
                  <div className="detail-tags detail-tags-wrap">
                    {sorted.map((item) => (
                      <span key={item} className="detail-tag detail-tag-id">
                        {item}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">없음</p>
                )}
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
          <table className="detail-table min-w-[800px] w-full text-left text-sm">
            <thead>
              <tr>
                <th>성형 작업자</th>
                <th>실적수량</th>
                <th>합격</th>
                <th>부적합</th>
                <th>불량률(%)</th>
                <th>불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {workerUph.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">
                    {isVina ? (
                      row.worker
                    ) : (
                      <Link
                        to={buildWorkerDetailHref(
                          toEntityId("wrk", row.worker),
                          { product: name, carryFrom: searchParams },
                        )}
                        className="text-accent hover:underline"
                      >
                        {row.worker}
                      </Link>
                    )}
                  </td>
                  <td className="num">{row.qty.toLocaleString()}</td>
                  <td className="num">{row.pass.toLocaleString()}</td>
                  <td className="num">{row.fail.toLocaleString()}</td>
                  <td className="num font-semibold">
                    {formatPpmAsPercent(row.failRate)}
                  </td>
                  <td>
                    <DetailDefectChips summary={row.defectSummary} />
                  </td>
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
          <table className="detail-table min-w-[960px] w-full text-left text-sm">
            <thead>
              <tr>
                <th>검사자</th>
                <th>소속</th>
                <th>검사량</th>
                <th>합격</th>
                <th>부적합</th>
                <th>소요시간(분)</th>
                <th>UPH</th>
                <th>불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {inspectorUph.map((row) => (
                <tr key={row.id}>
                  <td className="font-medium">
                    <Link
                      to={buildInspectorDetailHref(
                        toEntityId("ins", row.inspector),
                        {
                          product: name,
                          carryFrom: searchParams,
                          vina: isVina,
                        },
                      )}
                      className="text-accent hover:underline"
                    >
                      {row.inspector}
                    </Link>
                  </td>
                  <td>{row.team}</td>
                  <td className="num">{row.qty.toLocaleString()}</td>
                  <td className="num">{row.pass.toLocaleString()}</td>
                  <td className="num">{row.fail.toLocaleString()}</td>
                  <td className="num">{row.minutes.toLocaleString()}</td>
                  <td className="num font-semibold">{row.uph}</td>
                  <td>
                    <DetailDefectChips summary={row.defectSummary} />
                  </td>
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
