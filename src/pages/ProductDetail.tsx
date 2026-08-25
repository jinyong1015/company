import { Link, useParams } from "react-router-dom";
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
import { useMemo } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { StatusBadge } from "../components/common/StatusBadge";
import { useData } from "../context/DataContext";
import { useFilters } from "../context/FilterContext";
import { filterRecords } from "../lib/analyze";
import { fromEntityId, toEntityId } from "../lib/entityId";
import { failRatePpm, formatPpm, statusByPpm } from "../lib/format";

export function ProductDetail() {
  const { id } = useParams();
  const { analytics, records } = useData();
  const { filters } = useFilters();
  const name = fromEntityId(id, "prd");

  const product =
    analytics.products.find(
      (p) => p.id === id || p.id === toEntityId("prd", name) || p.name === name,
    ) ?? null;

  const scoped = useMemo(
    () =>
      filterRecords(records, filters, true).filter((r) => r.product === name),
    [records, filters, name],
  );

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
        <PageHeader
          title={name}
          description="선택한 기간/분석 그룹에 이 품번의 DATA가 없습니다."
          actions={
            <Link
              to="/products"
              className="text-sm text-accent hover:underline"
            >
              ← 목록으로
            </Link>
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

  const workerUph = analytics.workerProductUph.filter(
    (w) => w.product === name,
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={name}
        description={`${type} · 선택한 기간/분석 그룹 기준`}
        actions={
          <div className="flex items-center gap-3">
            <StatusBadge status={status} />
            <Link
              to="/products"
              className="text-sm text-accent hover:underline"
            >
              ← 목록으로
            </Link>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["검사량", qty.toLocaleString()],
          ["합격수량", pass.toLocaleString()],
          ["부적합수량", fail.toLocaleString()],
          ["부적합 합계", failTotal.toLocaleString()],
          ["폐기비용", `₩${scrapCost.toLocaleString()}`],
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

      <Panel title="불량 내역 상세">
        <div className="overflow-x-auto">
          <table className="min-w-[520px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2 font-medium">불량 유형</th>
                <th className="px-2 py-2 font-medium">발생 수량</th>
                <th className="px-2 py-2 font-medium">비중</th>
              </tr>
            </thead>
            <tbody>
              {defects.map((d) => (
                <tr key={d.name} className="border-b border-line/70">
                  <td className="px-2 py-2.5 font-medium">{d.name}</td>
                  <td className="num px-2 py-2.5">
                    {d.count.toLocaleString()}
                  </td>
                  <td className="num px-2 py-2.5">{d.share.toFixed(1)}%</td>
                </tr>
              ))}
              {!defects.length && (
                <tr>
                  <td colSpan={3} className="px-2 py-4 text-sm text-muted">
                    이 기간에 불량 상세가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["금형", [...new Set(scoped.map((r) => r.moldNo))]],
          ["설비", [...new Set(scoped.map((r) => r.equipment))]],
          ["검사자", [...new Set(scoped.map((r) => r.inspector))]],
          ["LOT", [...new Set(scoped.map((r) => r.lot))]],
        ].map(([title, items]) => (
          <Panel key={String(title)} title={String(title)}>
            <ul className="space-y-1.5 text-sm">
              {(items as string[]).slice(0, 8).map((item) => (
                <li key={item} className="border-b border-line/60 py-1.5">
                  {item}
                </li>
              ))}
              {!(items as string[]).length && (
                <li className="text-muted">없음</li>
              )}
            </ul>
          </Panel>
        ))}
      </div>

      <Panel
        title="작업자별 품번 UPH"
        description={`${name}를 담당한 작업자 효율`}
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
    </div>
  );
}
