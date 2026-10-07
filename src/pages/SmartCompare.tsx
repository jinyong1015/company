import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { PageHeader } from "../components/common/PageHeader";
import { VinaNotice } from "../components/vina/VinaNotice";
import { Panel } from "../components/common/Panel";
import { useFilters } from "../context/FilterContext";
import { useDetailInspectionData } from "../hooks/useDetailInspectionData";
import {
  summarizeProductPeriod,
  productsInPeriod,
  summarizeInspectorProductUph,
  summarizeDailyProductFailRateTop,
} from "../lib/analyze";
import {
  formatPpm,
  formatPpmAsPercent,
  formatPpmDelta,
  formatWon,
  formatYmdWithWeekday,
} from "../lib/format";
import { buildProductDetailHref } from "../lib/productDetailNav";
import { getProductPhotoUrlMap } from "../lib/productPhotos";
import { isCloudSyncEnabled } from "../lib/supabase";
import { loadPageViewState, savePageViewState } from "../lib/pageViewState";

const DAILY_TOP_BAR_COLOR = "#60a5fa";
const DAILY_CHART_PHOTO_SIZE = 56;
/** 사진+품번 라벨이 잘리지 않도록 X축 고정 높이 */
const DAILY_CHART_X_AXIS_HEIGHT = DAILY_CHART_PHOTO_SIZE + 28;
const DAILY_CHART_MIN_HEIGHT = 420;

type DailyProductTypeTab = "all" | "grommet" | "seal";

const dailyProductTypeTabs: { id: DailyProductTypeTab; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "grommet", label: "GROMMET" },
  { id: "seal", label: "SEAL" },
];

function matchesDailyProductTypeTab(
  type: string,
  tab: DailyProductTypeTab,
): boolean {
  if (tab === "all") return true;
  const t = (type || "").toLowerCase();
  if (tab === "seal") {
    return t.includes("seal") || t.includes("실링") || t.includes("씰");
  }
  return (
    t.includes("grommet") || t.includes("그로멧") || t.includes("유압")
  );
}

function DailyChartAxisTick({
  x = 0,
  y = 0,
  payload,
  photoUrls,
}: {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  photoUrls?: Record<string, string>;
}) {
  const name = String(payload?.value ?? "");
  const label = name.length > 10 ? `${name.slice(0, 10)}…` : name;
  const url = photoUrls?.[name.trim()];

  return (
    <g transform={`translate(${x},${y})`}>
      <foreignObject
        x={-DAILY_CHART_PHOTO_SIZE / 2}
        y={4}
        width={DAILY_CHART_PHOTO_SIZE}
        height={DAILY_CHART_PHOTO_SIZE}
      >
        <div className="dash-top10-axis-photo">
          {url ? (
            <img src={url} alt="" title={name} referrerPolicy="no-referrer" />
          ) : (
            <span className="smart-compare-daily-photo-fallback" title={name}>
              {name.slice(0, 2) || "—"}
            </span>
          )}
        </div>
      </foreignObject>
      <text
        x={0}
        y={DAILY_CHART_PHOTO_SIZE + 16}
        textAnchor="middle"
        fill="var(--color-muted)"
        fontSize={12}
        fontWeight={650}
      >
        {label}
      </text>
    </g>
  );
}

/** 2026-10-06 → 10. 06 (검사이력 표 제목용) */
function formatMdDot(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return ymd;
  return `${Number(m[2])}. ${m[3]}`;
}

/** 2026-08-10 → 2026.08.10~2026.08.20 */
function formatDotRange(start: string, end: string) {
  const toDot = (d: string) => d.replaceAll("-", ".");
  if (!start && !end) return "기간 미지정";
  if (start && end) return `${toDot(start)}~${toDot(end)}`;
  if (start) return `${toDot(start)}~`;
  return `~${toDot(end)}`;
}

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const ALL_PRODUCTS = "__all__";
const DAILY_TOP_VIEW_KEY = "smart-compare-daily-fail-top";
const DEFAULT_DAILY_TOP_N = 10;
const MIN_DAILY_TOP_N = 1;
const MAX_DAILY_TOP_N = 50;

type DailyTopViewState = {
  day: string;
  topN: number;
  typeTab: DailyProductTypeTab;
};

function clampTopN(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_DAILY_TOP_N;
  return Math.min(
    MAX_DAILY_TOP_N,
    Math.max(MIN_DAILY_TOP_N, Math.floor(value)),
  );
}

function readDailyTopView(today: string): DailyTopViewState {
  const stored =
    loadPageViewState<Partial<DailyTopViewState>>(DAILY_TOP_VIEW_KEY);
  const day =
    typeof stored?.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(stored.day)
      ? stored.day
      : today;
  const topN =
    typeof stored?.topN === "number"
      ? clampTopN(stored.topN)
      : DEFAULT_DAILY_TOP_N;
  const typeTab =
    stored?.typeTab === "grommet" ||
    stored?.typeTab === "seal" ||
    stored?.typeTab === "all"
      ? stored.typeTab
      : "all";
  return { day, topN, typeTab };
}

function deltaQty(a: number, b: number) {
  const d = a - b;
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toLocaleString()}`;
}

function formatWonDelta(a: number, b: number) {
  const d = Math.round(a - b);
  if (d === 0) return "₩0";
  const sign = d > 0 ? "+" : "-";
  return `${sign}₩${Math.abs(d).toLocaleString("ko-KR")}`;
}

function DeltaTone({ value }: { value: number }) {
  if (value > 0) return "up" as const;
  if (value < 0) return "down" as const;
  return "flat" as const;
}

export function SmartCompare() {
  const { source, analytics, records, ignoreAnalysisGroup } =
    useDetailInspectionData();
  const isVina = source === "vina";
  const { filters } = useFilters();
  const analysisGroup = ignoreAnalysisGroup ? "all" : filters.analysisGroup;

  const products = useMemo(() => {
    const list =
      analytics.filterOptions.products.length > 0
        ? analytics.filterOptions.products
        : analytics.products.map((p) => p.name);
    return [...new Set(list.filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, "ko"),
    );
  }, [analytics.filterOptions.products, analytics.products]);

  const [product, setProduct] = useState(ALL_PRODUCTS);
  const [today] = useState(todayYmd);
  const [periodAStart, setPeriodAStart] = useState(today);
  const [periodAEnd, setPeriodAEnd] = useState(today);
  const [periodBStart, setPeriodBStart] = useState(today);
  const [periodBEnd, setPeriodBEnd] = useState(today);

  const selectedProduct =
    product === ALL_PRODUCTS || products.includes(product)
      ? product
      : ALL_PRODUCTS;

  const summaryA = useMemo(
    () =>
      summarizeProductPeriod(
        records,
        selectedProduct,
        periodAStart,
        periodAEnd,
        analysisGroup,
      ),
    [records, selectedProduct, periodAStart, periodAEnd, analysisGroup],
  );
  const summaryB = useMemo(
    () =>
      summarizeProductPeriod(
        records,
        selectedProduct,
        periodBStart,
        periodBEnd,
        analysisGroup,
      ),
    [records, selectedProduct, periodBStart, periodBEnd, analysisGroup],
  );

  const productLabel =
    selectedProduct === ALL_PRODUCTS ? "전체" : selectedProduct;

  const rangeA = formatDotRange(periodAStart, periodAEnd);
  const rangeB = formatDotRange(periodBStart, periodBEnd);

  const [uphStart, setUphStart] = useState(today);
  const [uphEnd, setUphEnd] = useState(today);
  const [uphProduct, setUphProduct] = useState("");
  const [inspA, setInspA] = useState("");
  const [inspB, setInspB] = useState("");

  const uphProducts = useMemo(
    () => productsInPeriod(records, uphStart, uphEnd, analysisGroup),
    [records, uphStart, uphEnd, analysisGroup],
  );
  const selectedUphProduct =
    uphProduct && uphProducts.includes(uphProduct)
      ? uphProduct
      : (uphProducts[0] ?? "");

  const productInspectorRows = useMemo(
    () =>
      summarizeInspectorProductUph(
        records,
        selectedUphProduct,
        uphStart,
        uphEnd,
        analysisGroup,
      ),
    [records, selectedUphProduct, uphStart, uphEnd, analysisGroup],
  );

  const inspectorNamesForProduct = useMemo(
    () => productInspectorRows.map((r) => r.inspector),
    [productInspectorRows],
  );

  const activeInspA = inspectorNamesForProduct.includes(inspA)
    ? inspA
    : (inspectorNamesForProduct[0] ?? "");
  const activeInspB = inspectorNamesForProduct.includes(inspB)
    ? inspB
    : (inspectorNamesForProduct[1] ?? inspectorNamesForProduct[0] ?? "");

  const iA = productInspectorRows.find((r) => r.inspector === activeInspA);
  const iB = productInspectorRows.find((r) => r.inspector === activeInspB);
  const uphRangeLabel = formatDotRange(uphStart, uphEnd);

  const [dailyTopView, setDailyTopView] = useState<DailyTopViewState>(() =>
    readDailyTopView(today),
  );
  const {
    day: dailyTopDay,
    topN: dailyTopN,
    typeTab: dailyTypeTab,
  } = dailyTopView;

  useEffect(() => {
    savePageViewState(DAILY_TOP_VIEW_KEY, dailyTopView);
  }, [dailyTopView]);

  function patchDailyTop(patch: Partial<DailyTopViewState>) {
    setDailyTopView((prev) => ({ ...prev, ...patch }));
  }

  const dailyTypedRecords = useMemo(() => {
    if (dailyTypeTab === "all") return records;
    return records.filter((r) =>
      matchesDailyProductTypeTab(r.productType || "", dailyTypeTab),
    );
  }, [records, dailyTypeTab]);

  const dailyTopRows = useMemo(
    () =>
      summarizeDailyProductFailRateTop(
        dailyTypedRecords,
        dailyTopDay,
        dailyTopN,
        analysisGroup,
      ),
    [dailyTypedRecords, dailyTopDay, dailyTopN, analysisGroup],
  );

  const dailyTypeTabCounts = useMemo(() => {
    const byType = summarizeDailyProductFailRateTop(
      records,
      dailyTopDay,
      500,
      analysisGroup,
    );
    const counts: Record<DailyProductTypeTab, number> = {
      all: byType.length,
      grommet: 0,
      seal: 0,
    };
    for (const row of byType) {
      if (matchesDailyProductTypeTab(row.type, "grommet")) counts.grommet += 1;
      if (matchesDailyProductTypeTab(row.type, "seal")) counts.seal += 1;
    }
    return counts;
  }, [records, dailyTopDay, analysisGroup]);

  const dailyTopDetailFrom = isVina ? "vina-compare" : "compare";
  const dailyTopDayLabel = formatYmdWithWeekday(dailyTopDay);
  const dailyTopMdLabel = formatMdDot(dailyTopDay);
  const dailyTypeTabLabel =
    dailyProductTypeTabs.find((t) => t.id === dailyTypeTab)?.label ?? "전체";

  const dailyChartData = useMemo(
    () =>
      dailyTopRows.map((row) => ({
        name: row.name,
        value: row.failRate,
      })),
    [dailyTopRows],
  );

  const dailyPhotoKeys = useMemo(
    () =>
      [...new Set(dailyTopRows.map((r) => r.name.trim()).filter(Boolean))].sort(),
    [dailyTopRows],
  );
  const dailyPhotoKeysSignature = dailyPhotoKeys.join("\u0001");
  const [dailyPhotoUrls, setDailyPhotoUrls] = useState<Record<string, string>>(
    {},
  );

  useEffect(() => {
    if (!isCloudSyncEnabled() || !dailyPhotoKeys.length) {
      setDailyPhotoUrls({});
      return;
    }
    let cancelled = false;
    void getProductPhotoUrlMap(dailyPhotoKeys).then((map) => {
      if (!cancelled) setDailyPhotoUrls(map);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailyPhotoKeysSignature]);

  const productMetrics =
    summaryA && summaryB
      ? [
          {
            label: "검수량",
            a: `${summaryA.qty.toLocaleString()} EA`,
            b: `${summaryB.qty.toLocaleString()} EA`,
            delta: `${deltaQty(summaryA.qty, summaryB.qty)} EA`,
            tone: DeltaTone({ value: summaryA.qty - summaryB.qty }),
          },
          {
            label: "부적합률",
            a: formatPpm(summaryA.failRate),
            b: formatPpm(summaryB.failRate),
            delta: formatPpmDelta(summaryA.failRate - summaryB.failRate),
            tone: DeltaTone({ value: summaryA.failRate - summaryB.failRate }),
          },
          {
            label: "부적합수량",
            a: summaryA.fail.toLocaleString(),
            b: summaryB.fail.toLocaleString(),
            delta: deltaQty(summaryA.fail, summaryB.fail),
            tone: DeltaTone({ value: summaryA.fail - summaryB.fail }),
          },
          {
            label: "폐기비용",
            a: formatWon(summaryA.scrapCost),
            b: formatWon(summaryB.scrapCost),
            delta: formatWonDelta(summaryA.scrapCost, summaryB.scrapCost),
            tone: DeltaTone({
              value: summaryA.scrapCost - summaryB.scrapCost,
            }),
          },
        ]
      : [];

  const inspectorMetrics =
    iA || iB
      ? [
          {
            key: "UPH",
            a: iA?.uph ?? 0,
            b: iB?.uph ?? 0,
            format: (n: number) => n.toLocaleString(),
            delta: (a: number, b: number) => deltaQty(a, b),
            highlight: true,
          },
          {
            key: "검수량",
            a: iA?.qty ?? 0,
            b: iB?.qty ?? 0,
            format: (n: number) => n.toLocaleString(),
            delta: (a: number, b: number) => `${deltaQty(a, b)} EA`,
            highlight: false,
          },
          {
            key: "부적합수량",
            a: iA?.fail ?? 0,
            b: iB?.fail ?? 0,
            format: (n: number) => n.toLocaleString(),
            delta: (a: number, b: number) => deltaQty(a, b),
            highlight: false,
          },
          {
            key: "부적합률",
            a: iA?.failRate ?? 0,
            b: iB?.failRate ?? 0,
            format: (n: number) => formatPpm(n),
            delta: (a: number, b: number) => formatPpmDelta(a - b),
            highlight: false,
          },
          {
            key: "소요시간(분)",
            a: iA?.minutes ?? 0,
            b: iB?.minutes ?? 0,
            format: (n: number) => n.toLocaleString(),
            delta: (a: number, b: number) => deltaQty(a, b),
            highlight: false,
          },
        ]
      : [];

  return (
    <div className="space-y-5">
      <PageHeader title="스마트 비교" />
      {isVina ? <VinaNotice /> : null}

      <Panel
        title="품번 기간 비교"
        description={
          isVina
            ? "품번과 두 기간을 지정하면 검수량·부적합률·부적합수량·폐기비용을 바로 비교합니다. (VINA 데이터 · 헤더 기간 무관)"
            : "품번과 두 기간을 지정하면 검수량·부적합률·부적합수량·폐기비용을 바로 비교합니다. (전역 분석 그룹 적용 · 헤더 기간 무관)"
        }
        className="smart-compare-panel"
      >
        <div className="smart-compare-controls">
          <label className="smart-compare-field">
            <span className="smart-compare-field-label">품번</span>
            <select
              value={selectedProduct}
              onChange={(e) => setProduct(e.target.value)}
              className="smart-compare-input"
            >
              <option value={ALL_PRODUCTS}>전체</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <div className="smart-compare-vs-row">
            <div className="smart-compare-side smart-compare-side--a">
              <div className="smart-compare-side-head">
                <span className="smart-compare-side-badge">A</span>
                <strong>기간 A</strong>
              </div>
              <div className="smart-compare-dates">
                <label>
                  <span>시작</span>
                  <input
                    type="date"
                    value={periodAStart}
                    onChange={(e) => setPeriodAStart(e.target.value)}
                    className="smart-compare-input"
                  />
                </label>
                <span className="smart-compare-tilde">~</span>
                <label>
                  <span>종료</span>
                  <input
                    type="date"
                    value={periodAEnd}
                    onChange={(e) => setPeriodAEnd(e.target.value)}
                    className="smart-compare-input"
                  />
                </label>
              </div>
            </div>

            <span className="smart-compare-vs" aria-hidden>
              VS
            </span>

            <div className="smart-compare-side smart-compare-side--b">
              <div className="smart-compare-side-head">
                <span className="smart-compare-side-badge">B</span>
                <strong>기간 B</strong>
              </div>
              <div className="smart-compare-dates">
                <label>
                  <span>시작</span>
                  <input
                    type="date"
                    value={periodBStart}
                    onChange={(e) => setPeriodBStart(e.target.value)}
                    className="smart-compare-input"
                  />
                </label>
                <span className="smart-compare-tilde">~</span>
                <label>
                  <span>종료</span>
                  <input
                    type="date"
                    value={periodBEnd}
                    onChange={(e) => setPeriodBEnd(e.target.value)}
                    className="smart-compare-input"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        {!summaryA || !summaryB ? (
          <div className="smart-compare-empty">비교할 DATA가 없습니다.</div>
        ) : (
          <>
            <div className="smart-compare-result-head">
              <div>
                <p className="smart-compare-result-kicker">비교 대상</p>
                <p className="smart-compare-result-title">{productLabel}</p>
              </div>
              <div className="smart-compare-range-chips">
                <span className="smart-compare-range-chip smart-compare-range-chip--a">
                  A · {rangeA}
                </span>
                <span className="smart-compare-range-chip smart-compare-range-chip--b">
                  B · {rangeB}
                </span>
              </div>
            </div>

            <div className="smart-compare-metric-grid">
              {productMetrics.map((m) => (
                <article key={m.label} className="smart-compare-metric-card">
                  <p className="smart-compare-metric-label">{m.label}</p>
                  <div className="smart-compare-metric-pair">
                    <div className="smart-compare-metric-col">
                      <span className="smart-compare-metric-tag">A</span>
                      <strong className="num">{m.a}</strong>
                    </div>
                    <div className="smart-compare-metric-col">
                      <span className="smart-compare-metric-tag smart-compare-metric-tag--b">
                        B
                      </span>
                      <strong className="num">{m.b}</strong>
                    </div>
                  </div>
                  <p
                    className="smart-compare-metric-delta num"
                    data-tone={m.tone}
                  >
                    차이 {m.delta}
                  </p>
                </article>
              ))}
            </div>

            {summaryA.recordCount === 0 && summaryB.recordCount === 0 ? (
              <div className="smart-compare-empty smart-compare-empty--soft">
                {isVina
                  ? "선택한 품번·기간에 VINA DATA가 없습니다. 날짜를 확인해 주세요."
                  : "선택한 품번·기간에 DATA가 없습니다. 날짜 또는 분석 그룹을 확인해 주세요."}
              </div>
            ) : null}
          </>
        )}
      </Panel>

      <Panel
        title="기간·품번 → 검사자 UPH 비교"
        description={
          isVina
            ? "기간과 품번을 고른 뒤 검사자 A·B UPH를 비교합니다. (VINA 데이터 · 헤더 기간 무관)"
            : "기간과 품번을 고른 뒤 검사자 A·B UPH를 비교합니다. (전역 분석 그룹 적용 · 헤더 기간 무관)"
        }
        className="smart-compare-panel"
      >
        <div className="smart-compare-steps">
          <div className="smart-compare-step">
            <span className="smart-compare-step-num">1</span>
            <div className="smart-compare-step-body">
              <p className="smart-compare-step-title">기간</p>
              <div className="smart-compare-dates">
                <label>
                  <span>시작</span>
                  <input
                    type="date"
                    value={uphStart}
                    onChange={(e) => {
                      setUphStart(e.target.value);
                      setInspA("");
                      setInspB("");
                    }}
                    className="smart-compare-input"
                  />
                </label>
                <span className="smart-compare-tilde">~</span>
                <label>
                  <span>종료</span>
                  <input
                    type="date"
                    value={uphEnd}
                    onChange={(e) => {
                      setUphEnd(e.target.value);
                      setInspA("");
                      setInspB("");
                    }}
                    className="smart-compare-input"
                  />
                </label>
              </div>
            </div>
          </div>

          <span className="smart-compare-step-arrow" aria-hidden>
            →
          </span>

          <div className="smart-compare-step">
            <span className="smart-compare-step-num">2</span>
            <div className="smart-compare-step-body">
              <p className="smart-compare-step-title">품번</p>
              <select
                value={selectedUphProduct}
                onChange={(e) => {
                  setUphProduct(e.target.value);
                  setInspA("");
                  setInspB("");
                }}
                className="smart-compare-input"
                disabled={!uphProducts.length}
              >
                {!uphProducts.length ? (
                  <option value="">선택 가능한 품번 없음</option>
                ) : (
                  uphProducts.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <span className="smart-compare-step-arrow" aria-hidden>
            →
          </span>

          <div className="smart-compare-step smart-compare-step--pair">
            <span className="smart-compare-step-num">3</span>
            <div className="smart-compare-step-body">
              <p className="smart-compare-step-title">검사자 비교</p>
              <div className="smart-compare-inspector-pair">
                <label className="smart-compare-field">
                  <span className="smart-compare-field-label">
                    <span className="smart-compare-side-badge">A</span>
                    검사자 A
                  </span>
                  <select
                    value={activeInspA}
                    onChange={(e) => setInspA(e.target.value)}
                    className="smart-compare-input"
                    disabled={!inspectorNamesForProduct.length}
                  >
                    {inspectorNamesForProduct.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <span
                  className="smart-compare-vs smart-compare-vs--sm"
                  aria-hidden
                >
                  VS
                </span>
                <label className="smart-compare-field">
                  <span className="smart-compare-field-label">
                    <span className="smart-compare-side-badge smart-compare-side-badge--b">
                      B
                    </span>
                    검사자 B
                  </span>
                  <select
                    value={activeInspB}
                    onChange={(e) => setInspB(e.target.value)}
                    className="smart-compare-input"
                    disabled={!inspectorNamesForProduct.length}
                  >
                    {inspectorNamesForProduct.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>

        {!selectedUphProduct || !productInspectorRows.length ? (
          <div className="smart-compare-empty">
            {isVina
              ? "선택한 기간·품번의 VINA DATA에서 비교할 검사자가 없습니다."
              : "선택한 기간·품번·분석 그룹에서 비교할 검사자 DATA가 없습니다."}
          </div>
        ) : (
          <>
            <div className="smart-compare-result-head">
              <div>
                <p className="smart-compare-result-kicker">UPH 비교</p>
                <p className="smart-compare-result-title">
                  {selectedUphProduct}
                  <span className="smart-compare-result-sub">
                    · {uphRangeLabel}
                  </span>
                </p>
              </div>
              <div className="smart-compare-range-chips">
                <span className="smart-compare-range-chip smart-compare-range-chip--a">
                  A · {iA?.inspector ?? activeInspA}
                  {iA ? ` (${iA.team})` : ""}
                </span>
                <span className="smart-compare-range-chip smart-compare-range-chip--b">
                  B · {iB?.inspector ?? activeInspB}
                  {iB ? ` (${iB.team})` : ""}
                </span>
              </div>
            </div>

            <div className="smart-compare-metric-grid smart-compare-metric-grid--uph">
              {inspectorMetrics.map((row) => {
                const tone = DeltaTone({ value: row.a - row.b });
                return (
                  <article
                    key={row.key}
                    className="smart-compare-metric-card"
                    data-highlight={row.highlight ? "true" : undefined}
                  >
                    <p className="smart-compare-metric-label">{row.key}</p>
                    <div className="smart-compare-metric-pair">
                      <div className="smart-compare-metric-col">
                        <span className="smart-compare-metric-tag">A</span>
                        <strong className="num">{row.format(row.a)}</strong>
                      </div>
                      <div className="smart-compare-metric-col">
                        <span className="smart-compare-metric-tag smart-compare-metric-tag--b">
                          B
                        </span>
                        <strong className="num">{row.format(row.b)}</strong>
                      </div>
                    </div>
                    <p
                      className="smart-compare-metric-delta num"
                      data-tone={tone}
                    >
                      차이 {row.delta(row.a, row.b)}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="smart-compare-rank-block">
              <div className="smart-compare-rank-head">
                <p className="smart-compare-rank-title">검사자별 UPH 순위</p>
                <p className="smart-compare-rank-desc">
                  {selectedUphProduct} · {uphRangeLabel} · 높은 순
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="smart-compare-table min-w-[720px] w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>순위</th>
                      <th>검사자</th>
                      <th>소속</th>
                      <th>검수량</th>
                      <th>부적합률</th>
                      <th>소요시간(분)</th>
                      <th>UPH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productInspectorRows.map((row, idx) => {
                      const side =
                        row.inspector === activeInspA
                          ? "a"
                          : row.inspector === activeInspB
                            ? "b"
                            : null;
                      return (
                        <tr key={row.id} data-side={side ?? undefined}>
                          <td className="num text-muted">{idx + 1}</td>
                          <td className="font-medium">
                            {row.inspector}
                            {side ? (
                              <span
                                className={`smart-compare-inline-badge smart-compare-inline-badge--${side}`}
                              >
                                {side.toUpperCase()}
                              </span>
                            ) : null}
                          </td>
                          <td>{row.team}</td>
                          <td className="num">{row.qty.toLocaleString()}</td>
                          <td className="num">{formatPpm(row.failRate)}</td>
                          <td className="num">
                            {row.minutes.toLocaleString()}
                          </td>
                          <td className="num font-semibold">
                            {row.uph.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </Panel>

      <Panel
        title={`일별 부적합률 TOP${dailyTopN}`}
        description={
          isVina
            ? `${dailyTypeTabLabel} · 일자를 고르면 해당일 VINA 부적합률(ppm) TOP 그래프와 아래 검사이력이 함께 갱신됩니다.`
            : `${dailyTypeTabLabel} · 일자를 고르면 해당일 부적합률(ppm) TOP 그래프와 아래 검사이력이 함께 갱신됩니다. (전역 분석 그룹 적용 · 헤더 기간 무관)`
        }
        className="smart-compare-panel"
        actions={
          <div className="smart-compare-daily-header-actions">
            <div
              className="qty-type-tabs smart-compare-daily-type-tabs"
              role="tablist"
              aria-label="일별 부적합률 TOP 제품유형"
            >
              {dailyProductTypeTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={dailyTypeTab === tab.id}
                  className="qty-type-tab"
                  data-active={dailyTypeTab === tab.id}
                  onClick={() => patchDailyTop({ typeTab: tab.id })}
                >
                  {tab.label}
                  <span className="qty-type-tab-count">
                    {dailyTypeTabCounts[tab.id]}
                  </span>
                </button>
              ))}
            </div>
            <div className="smart-compare-daily-controls smart-compare-daily-controls--header">
              <label className="smart-compare-field">
                <span className="smart-compare-field-label">일자</span>
                <input
                  type="date"
                  value={dailyTopDay}
                  onChange={(e) => patchDailyTop({ day: e.target.value })}
                  className="smart-compare-input"
                />
              </label>
              <label className="smart-compare-field">
                <span className="smart-compare-field-label">TOP</span>
                <input
                  type="number"
                  min={MIN_DAILY_TOP_N}
                  max={MAX_DAILY_TOP_N}
                  value={dailyTopN}
                  onChange={(e) =>
                    patchDailyTop({ topN: clampTopN(Number(e.target.value)) })
                  }
                  className="smart-compare-input smart-compare-input--topn"
                />
              </label>
            </div>
          </div>
        }
      >
        {dailyTopRows.length === 0 ? (
          <div className="smart-compare-empty">
            {isVina
              ? `선택한 일자·${dailyTypeTabLabel} VINA DATA가 없습니다.`
              : `선택한 일자·${dailyTypeTabLabel}·분석 그룹에 DATA가 없습니다.`}
          </div>
        ) : (
          <>
            <div
              className="dash-top10-chart dash-top10-chart--view detail-chart-frame smart-compare-daily-chart"
              style={
                {
                  ["--dash-top10-bar" as string]: DAILY_TOP_BAR_COLOR,
                } as CSSProperties
              }
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                minHeight={DAILY_CHART_MIN_HEIGHT}
              >
                <BarChart
                  data={dailyChartData}
                  margin={{
                    top: 36,
                    right: 16,
                    left: 8,
                    bottom: 16,
                  }}
                >
                  <CartesianGrid
                    stroke="var(--color-line)"
                    vertical={false}
                    strokeDasharray="3 6"
                  />
                  <XAxis
                    dataKey="name"
                    interval={0}
                    height={DAILY_CHART_X_AXIS_HEIGHT}
                    tickMargin={0}
                    axisLine={false}
                    tickLine={false}
                    tick={(props) => (
                      <DailyChartAxisTick
                        x={
                          typeof props.x === "number"
                            ? props.x
                            : Number(props.x) || 0
                        }
                        y={
                          typeof props.y === "number"
                            ? props.y
                            : Number(props.y) || 0
                        }
                        payload={
                          props.payload
                            ? {
                                value: props.payload.value as
                                  | string
                                  | number
                                  | undefined,
                              }
                            : undefined
                        }
                        photoUrls={dailyPhotoUrls}
                      />
                    )}
                  />
                  <YAxis
                    tick={{
                      fill: "var(--color-muted)",
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                    tickFormatter={(v) => formatPpm(Number(v))}
                    width={72}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Bar
                    dataKey="value"
                    name="부적합률"
                    fill={DAILY_TOP_BAR_COLOR}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={42}
                    isAnimationActive={false}
                  >
                    <LabelList
                      dataKey="value"
                      position="top"
                      offset={8}
                      className="op-prod-top-bar-value"
                      formatter={(v) => formatPpm(Number(v))}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="smart-compare-daily-bridge" aria-hidden={false}>
              <span className="smart-compare-daily-bridge-arrow" aria-hidden>
                ↓
              </span>
              <div className="smart-compare-daily-bridge-copy">
                <p className="smart-compare-daily-bridge-title">
                  검사이력 {dailyTopMdLabel}
                </p>
                <p className="smart-compare-daily-bridge-desc">
                  위 TOP{dailyTopN} · {dailyTypeTabLabel} · {dailyTopDayLabel} ·
                  부적합률(ppm) 높은 순
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="smart-compare-table smart-compare-daily-table min-w-[980px] w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>품번</th>
                    <th>검수량</th>
                    <th>합격 수량</th>
                    <th>부적합 수량</th>
                    <th>부적합율 (PPM)</th>
                    <th>불량율</th>
                    <th>대표 유형</th>
                    <th>작업자</th>
                    <th>설비</th>
                    <th>생산LOT</th>
                    <th>상세</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyTopRows.map((row) => (
                    <tr key={row.id}>
                      <td className="smart-compare-daily-product font-medium">
                        <Link
                          to={buildProductDetailHref(
                            row.id,
                            dailyTopDetailFrom,
                            {
                              startDate: dailyTopDay,
                              endDate: dailyTopDay,
                              vina: isVina,
                            },
                          )}
                        >
                          {row.name}
                        </Link>
                      </td>
                      <td className="num">{row.qty.toLocaleString("ko-KR")}</td>
                      <td className="num">
                        {row.pass.toLocaleString("ko-KR")}
                      </td>
                      <td className="num">
                        {row.fail.toLocaleString("ko-KR")}
                      </td>
                      <td className="num">
                        {row.failRate.toLocaleString("ko-KR")}
                      </td>
                      <td className="num smart-compare-daily-rate">
                        {formatPpmAsPercent(row.failRate)}
                      </td>
                      <td>
                        <span className="smart-compare-daily-defect">
                          {row.mainDefect}
                        </span>
                      </td>
                      <td>{row.worker}</td>
                      <td>{row.equipment}</td>
                      <td className="num">{row.lot}</td>
                      <td>
                        <Link
                          className="smart-compare-detail-link"
                          to={buildProductDetailHref(
                            row.id,
                            dailyTopDetailFrom,
                            {
                              startDate: dailyTopDay,
                              endDate: dailyTopDay,
                              vina: isVina,
                            },
                          )}
                        >
                          상세
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
