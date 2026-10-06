import { useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { VinaNotice } from "../components/vina/VinaNotice";
import { Panel } from "../components/common/Panel";
import { useFilters } from "../context/FilterContext";
import { useDetailInspectionData } from "../hooks/useDetailInspectionData";
import {
  summarizeProductPeriod,
  productsInPeriod,
  summarizeInspectorProductUph,
} from "../lib/analyze";
import { formatPpm, formatPpmDelta, formatWon } from "../lib/format";

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
  const {
    source,
    analytics,
    records,
    ignoreAnalysisGroup,
  } = useDetailInspectionData();
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

  const productMetrics = summaryA && summaryB
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
                <span className="smart-compare-vs smart-compare-vs--sm" aria-hidden>
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
                <p className="smart-compare-rank-title">
                  검사자별 UPH 순위
                </p>
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
                        <tr
                          key={row.id}
                          data-side={side ?? undefined}
                        >
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
    </div>
  );
}
