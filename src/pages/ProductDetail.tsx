import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  ChevronRight,
  LayoutDashboard,
  Package,
  type LucideIcon,
} from "lucide-react";
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
} from "recharts";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { StatusBadge } from "../components/common/StatusBadge";
import { useData } from "../context/DataContext";
import { useFilters } from "../context/FilterContext";
import {
  analyzeRecords,
  buildDefectEquipmentMoldAnalysis,
  filterRecords,
} from "../lib/analyze";
import { fromEntityId, toEntityId } from "../lib/entityId";
import {
  parseProductDetailFrom,
  PRODUCT_DETAIL_FROM_LABELS,
  PRODUCT_DETAIL_FROM_PATHS,
  buildWeeklyReportBackHref,
  type ProductDetailFromId,
} from "../lib/productDetailNav";
import {
  failRatePpm,
  formatPercent,
  formatPpm,
  formatWon,
  statusByPpm,
} from "../lib/format";
import type { Analytics, InspectionRecord, ProductRow } from "../types";
import type { FilterState } from "../context/FilterContext";

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
};

function buildBackNav(from: ProductDetailFromId, searchParams: URLSearchParams) {
  const path =
    from === "weekly-report"
      ? buildWeeklyReportBackHref(searchParams)
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
  const { filters, setCustomDateRange } = useFilters();
  const name = fromEntityId(id, "prd");
  const urlDateRange = useMemo(
    () => readUrlDateRange(searchParams),
    [searchParams],
  );

  useLayoutEffect(() => {
    if (!urlDateRange) return;
    setCustomDateRange(urlDateRange.startDate, urlDateRange.endDate);
  }, [urlDateRange, setCustomDateRange]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [id, searchParams]);

  const effectiveFilters = useMemo<FilterState>(
    () =>
      urlDateRange
        ? {
            ...filters,
            period: "custom",
            startDate: urlDateRange.startDate,
            endDate: urlDateRange.endDate,
          }
        : filters,
    [filters, urlDateRange],
  );

  const scoped = useMemo(
    () =>
      filterRecords(records, effectiveFilters, true).filter(
        (r) => r.product === name,
      ),
    [records, effectiveFilters, name],
  );

  const productAnalytics = useMemo(
    () => (urlDateRange ? analyzeRecords(records, effectiveFilters) : analytics),
    [urlDateRange, records, effectiveFilters, analytics],
  );

  const product =
    productAnalytics.products.find(
      (p) => p.id === id || p.id === toEntityId("prd", name) || p.name === name,
    ) ?? null;

  const backFrom = parseProductDetailFrom(searchParams.get("from"));
  const backNav = buildBackNav(backFrom, searchParams);
  const fromWeeklyReport = backFrom === "weekly-report";
  const weeklyStart = searchParams.get("startDate");
  const weeklyEnd = searchParams.get("endDate");
  const periodRange =
    fromWeeklyReport && weeklyStart && weeklyEnd
      ? { start: weeklyStart, end: weeklyEnd }
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
        <ProductDetailBackNav backNav={backNav} periodRange={periodRange} />
        <PageHeader
          title={name}
          description="선택한 기간/분석 그룹에 이 품번의 DATA가 없습니다."
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
    />
  );
}

function ProductDetailBackNav({
  backNav,
  periodRange,
}: {
  backNav: ReturnType<typeof buildBackNav>;
  periodRange?: { start: string; end: string } | null;
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
      {periodRange ? (
        <p className="num mt-2 px-1 text-center text-xs font-medium text-muted sm:hidden">
          조회기간 {periodRange.start} ~ {periodRange.end}
        </p>
      ) : null}
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
}: {
  name: string;
  product: ProductRow | null;
  scoped: InspectionRecord[];
  analytics: Analytics;
  backNav: ReturnType<typeof buildBackNav>;
  periodRange?: { start: string; end: string } | null;
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
  const failTotal = product?.failTotal ?? fail;
  const defects = product?.defects ?? [];
  const status = product?.status ?? statusByPpm(failRate);
  const type = product?.type ?? scoped[0]?.productType ?? "미지정";

  const [selectedDefect, setSelectedDefect] = useState(
    () => defects[0]?.name ?? "",
  );

  useEffect(() => {
    if (!defects.length) {
      setSelectedDefect("");
      return;
    }
    if (!defects.some((d) => d.name === selectedDefect)) {
      setSelectedDefect(defects[0]!.name);
    }
  }, [defects, selectedDefect]);

  const defectDrill = useMemo(
    () =>
      selectedDefect
        ? buildDefectEquipmentMoldAnalysis(scoped, selectedDefect)
        : null,
    [scoped, selectedDefect],
  );

  const byDate = Object.values(
    scoped.reduce<Record<string, { date: string; qty: number; fail: number }>>(
      (acc, r) => {
        if (!acc[r.date])
          acc[r.date] = { date: r.date.slice(5), qty: 0, fail: 0 };
        acc[r.date].qty += r.qty;
        acc[r.date].fail += r.fail;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      failRate: failRatePpm(d.fail, d.qty),
    }));

  const workerUph = analytics.workerProductUph
    .filter((w) => w.product === name)
    .sort((a, b) => b.uph - a.uph || a.worker.localeCompare(b.worker, "ko"));
  const inspectorUph = analytics.inspectorProductUph
    .filter((row) => row.product === name)
    .sort(
      (a, b) =>
        b.uph - a.uph || a.inspector.localeCompare(b.inspector, "ko"),
    );

  return (
    <div className="space-y-5">
      <ProductDetailBackNav backNav={backNav} periodRange={periodRange} />

      <PageHeader
        title={name}
        description={
          periodRange
            ? `${type} · 선택 주차 품번 상세`
            : `${type} · 선택한 기간/분석 그룹 기준`
        }
        actions={<StatusBadge status={status} />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["검사량", qty.toLocaleString()],
          ["합격수량", pass.toLocaleString()],
          ["부적합수량", fail.toLocaleString()],
          ["부적합 합계", failTotal.toLocaleString()],
          ["폐기비용", formatWon(scrapCost)],
          ["소요시간(분)", minutes.toLocaleString()],
          ["UPH", String(uph)],
          ["부적합률", `${formatPpm(failRate)}`],
        ].map(([label, value]) => (
          <div key={label} className="card px-4 py-3">
            <p className="text-xs text-muted">{label}</p>
            <p className="num mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="기간별 부적합률 추이">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={byDate}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e2e6ec",
                    borderRadius: 12,
                    boxShadow: "none",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="failRate"
                  name="부적합률"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel
          title="불량 유형별 발생량"
          description="어떤 불량이 발생했는지 정확히 집계"
        >
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={defects}>
                <CartesianGrid stroke="#eef1f5" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#5b6577" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e2e6ec",
                    borderRadius: 12,
                    boxShadow: "none",
                    fontSize: 12,
                  }}
                />
                <Bar
                  dataKey="count"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        title="불량 내역 상세"
        description="유형을 선택하면 아래 설비·금형 비중이 바로 바뀝니다."
      >
        {defects.length ? (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed border-accent/40 bg-accent/5 px-3 py-2.5">
              <p className="text-sm text-ink">
                <span className="font-medium text-accent">불량 유형을 선택</span>
                해 설비·금형별 발생 비중을 확인하세요.
              </p>
              {selectedDefect ? (
                <p className="text-xs text-muted">
                  현재 선택{" "}
                  <span className="font-semibold text-accent">
                    {selectedDefect}
                  </span>
                </p>
              ) : null}
            </div>

            <div
              className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3"
              role="radiogroup"
              aria-label="불량 유형 선택"
            >
              {defects.map((d) => {
                const active = d.name === selectedDefect;
                return (
                  <button
                    key={d.name}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setSelectedDefect(d.name)}
                    className={`group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition ${
                      active
                        ? "border-accent bg-accent/5 shadow-sm ring-1 ring-accent/30"
                        : "border-line bg-white hover:border-accent/50 hover:bg-canvas"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        active
                          ? "border-accent"
                          : "border-line group-hover:border-accent/60"
                      }`}
                      aria-hidden
                    >
                      {active ? (
                        <span className="h-2 w-2 rounded-full bg-accent" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span
                          className={`truncate text-sm font-semibold ${
                            active ? "text-accent" : "text-ink"
                          }`}
                        >
                          {d.name}
                        </span>
                        {active ? (
                          <span className="shrink-0 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-medium text-white">
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
                          className={`block h-full rounded-full ${
                            active ? "bg-accent" : "bg-slate-300"
                          }`}
                          style={{ width: `${Math.min(100, d.share)}%` }}
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

        {defectDrill && defectDrill.total > 0 ? (
          <div className="mt-5 border-t border-line pt-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-white">
                {defectDrill.defectName}
              </span>
              <span className="text-sm font-medium text-ink">
                설비 · 금형 비중
              </span>
              <span className="text-xs text-muted">
                총 {defectDrill.total.toLocaleString()}건
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
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
                        className="h-full rounded-full bg-accent"
                        style={{ width: `${Math.min(100, eq.share)}%` }}
                      />
                    </div>
                    <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-xs text-muted">
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
                        className="h-full rounded-full bg-sky-500"
                        style={{ width: `${Math.min(100, m.share)}%` }}
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
        ) : selectedDefect ? (
          <p className="mt-4 text-sm text-muted">
            선택한 불량 유형의 설비·금형 DATA가 없습니다.
          </p>
        ) : null}
      </Panel>

      <div className="grid gap-5 md:grid-cols-2">
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
      </div>

      <Panel
        title="작업자별 품번 UPH"
        description={`${name}를 담당한 작업자 효율 · UPH 높은 순`}
      >
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">성형 작업자</th>
                <th className="px-2 py-2 font-medium">검사량</th>
                <th className="px-2 py-2 font-medium">합격</th>
                <th className="px-2 py-2 font-medium">부적합</th>
                <th className="px-2 py-2 font-medium">소요시간(분)</th>
                <th className="px-2 py-2 font-medium">UPH</th>
                <th className="px-2 py-2 font-medium">불량 내역</th>
              </tr>
            </thead>
            <tbody>
              {workerUph.map((row) => (
                <tr key={row.id} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{row.worker}</td>
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
              {!workerUph.length && (
                <tr>
                  <td colSpan={7} className="px-2 py-4 text-sm text-muted">
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
                  <td className="px-2 py-2.5 font-medium">{row.inspector}</td>
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
