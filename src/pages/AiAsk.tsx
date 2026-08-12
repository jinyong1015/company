import { useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { useData } from "../context/DataContext";
import { analyzeRecords } from "../lib/analyze";
import { answerQuestion } from "../lib/aiAsk";

const samples = [
  "부적합률이 높은 품번 TOP 5를 알려줘.",
  "SEAL 제품 중 부적합률이 높은 품번 TOP 5를 알려줘.",
  "본사(SEAL)과 본사(유압+그로멧)의 부적합률을 비교해줘.",
  "2공장의 폐기비용이 높은 품번을 알려줘.",
  "가장 많은 품번을 검사한 검사자는 누구야?",
  "지난달과 비교해서 부적합률이 가장 많이 증가한 품번은?",
];

export function AiAsk() {
  const { records } = useData();
  const analytics = useMemo(
    () =>
      analyzeRecords(records, {
        analysisGroup: "all",
        period: "year",
        startDate: "",
        endDate: "",
        teams: [],
        inspectors: [],
        workTypes: [],
        productTypes: [],
        products: [],
        molds: [],
        equipment: [],
        workers: [],
        lots: [],
      }),
    [records],
  );
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ q: string; a: string[] }[]>([]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { q: text, a: answerQuestion(text, analytics) },
    ]);
    setInput("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI에게 질문하기"
        description="질문에서 제품유형·소속·지표를 읽어 분석합니다. "
      />
      <Panel>
        <div className="mb-4 flex flex-wrap gap-2">
          {samples.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => ask(s)}
              className="rounded-lg border border-line px-3 py-1.5 text-left text-xs text-muted hover:bg-canvas hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {messages.map((m, i) => (
            <div
              key={`${m.q}-${i}`}
              className="rounded-xl border border-line p-3"
            >
              <p className="text-sm font-medium">Q. {m.q}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {m.a.map((line, idx) => (
                  <li key={`${i}-${idx}`}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            ask(input);
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="예: SEAL 제품 중 부적합률이 높은 품번 TOP 5"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            className="rounded-lg bg-ink px-4 py-2 text-sm text-white"
          >
            질문
          </button>
        </form>
      </Panel>
    </div>
  );
}
