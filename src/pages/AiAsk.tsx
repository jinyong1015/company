import { useMemo, useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { AiAnswerBlocks } from "../components/ai/AiAnswerCharts";
import { useData } from "../context/DataContext";
import { analyzeRecords } from "../lib/analyze";
import { answerQuestion, type AiAnswer } from "../lib/aiAsk";

const samples = [
  "부적합률이 높은 품번 TOP 5를 알려줘.",
  "SEAL 제품 중 부적합률이 높은 품번 TOP 5를 알려줘.",
  "NEOR GI000 이물/변형 불량 변동성을 선 그래프로 알려줘.",
  "폐기비용/부적합율/검수량 TOP 10까지 보여주고, TOP5까지는 막대그래프 표현해 주고, 불량유형은 원그래프로, %단위로 표기해줘",
  "본사, 2공장 은 막대그래프로, TOTAL 선 그래프로 총 4개항목, 1월~12월 까지, 월별 부적합율(PPM) / 월별 폐기비용(백만원) / 월별 검수량 각각 한 그래프 만들어줘",
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
  const [messages, setMessages] = useState<{ q: string; a: AiAnswer }[]>([]);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setMessages((prev) => [
      ...prev,
      { q: text, a: answerQuestion(text, analytics, records) },
    ]);
    setInput("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI에게 질문하기"
        description="질문에서 공장·지표·TOP N·그래프 유형을 해석해 표와 차트로 답합니다. (1공장 SEAL=본사(SEAL), 1공장 GROMMET=본사(유압+그로멧))"
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
              <AiAnswerBlocks blocks={m.a.blocks} />
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
            placeholder="예: 1공장 SEAL 불량률 TOP 5 / 1공장 GROMMET·2공장 월별 추이"
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
