import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { useData } from "../context/DataContext";

export function DataQuality() {
  const { records, meta, analytics } = useData();
  const result = meta.uploadResult;
  const counts = {
    ok: records.filter((r) => r.rowClass === "ok").length,
    warn: records.filter((r) => r.rowClass === "warn").length,
    error: records.filter((r) => r.rowClass === "error").length,
    excluded: records.filter((r) => r.rowClass === "excluded").length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="데이터 품질"
        description="오류는 업로드 차단, 경고는 확인 후 저장, #N/A는 분석에서만 제외합니다."
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["정상", counts.ok, "text-ok"],
          ["경고", counts.warn, "text-warn"],
          ["오류", counts.error, "text-danger"],
          ["분석 제외 (#N/A)", counts.excluded, "text-muted"],
        ].map(([label, value, color]) => (
          <div
            key={String(label)}
            className="rounded-xl border border-line bg-surface px-4 py-3"
          >
            <p className="text-xs text-muted">{label}</p>
            <p className={`num mt-1 text-xl font-semibold ${color}`}>
              {Number(value).toLocaleString()}건
            </p>
          </div>
        ))}
      </div>
      {result && (
        <Panel
          title={`Data Quality ${result.score}%`}
          description="업로드 검증 항목"
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {result.qualityChecks.map((item) => (
              <div
                key={item.label}
                className="flex justify-between rounded-lg border border-line px-3 py-2.5 text-sm"
              >
                <span>{item.label}</span>
                <span
                  className={`num ${item.count > 0 ? "text-danger" : "text-ok"}`}
                >
                  {item.count}건
                </span>
              </div>
            ))}
          </div>
        </Panel>
      )}
      <Panel title="분석 반영 현황">
        <p className="text-sm text-muted">
          분석 건수 {analytics.summary.recordCount.toLocaleString()}건 · 검수량{" "}
          {analytics.summary.totalQty.toLocaleString()} · 부적합률{" "}
          {analytics.summary.failRate.toFixed(2)}% · 제외{" "}
          {analytics.summary.excludedCount.toLocaleString()}건
        </p>
      </Panel>
      <Panel
        title="이슈 행 미리보기"
        description="오류는 업로드 차단, 경고는 확인 후 저장, #N/A는 분석 제외"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-2 py-2">상태</th>
                <th className="px-2 py-2">날짜</th>
                <th className="px-2 py-2">검사원</th>
                <th className="px-2 py-2">품번</th>
                <th className="px-2 py-2">이슈</th>
              </tr>
            </thead>
            <tbody>
              {records
                .filter((r) => r.rowClass !== "ok")
                .slice(0, 20)
                .map((r) => (
                  <tr key={r.id} className="border-b border-line/70">
                    <td className="px-2 py-2.5">{r.rowClass}</td>
                    <td className="num px-2 py-2.5">{r.date}</td>
                    <td className="px-2 py-2.5">{r.inspector}</td>
                    <td className="px-2 py-2.5">{r.product}</td>
                    <td className="px-2 py-2.5 text-muted">
                      {r.issues.join(", ") || "-"}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
