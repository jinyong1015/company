import { useState } from "react";
import { PageHeader } from "../components/common/PageHeader";
import { Panel } from "../components/common/Panel";
import { AiAnswerBlocks } from "../components/ai/AiAnswerCharts";
import { useData } from "../context/DataContext";
import {
  answerQuestion,
  type AiAnswer,
  type AiConversationContext,
} from "../lib/aiAsk";

const samples = [
  "이번 주 부적합률 TOP5 보여줘.",
  "지난주랑 이번 주 부적합률 비교해줘.",
  "2공장 검수량 1000개 이상 · 부적합률 5% 넘는 품번 TOP10",
  "최근 8주 부적합률 추이 보여줘.",
  "이번 주 품질 이슈를 보고용으로 정리해줘.",
];

export function AiAsk() {
  const { records, analytics } = useData();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ q: string; a: AiAnswer }[]>([]);
  const [context, setContext] = useState<AiConversationContext | null>(null);

  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    const a = answerQuestion(text, analytics, records, context);
    setMessages((prev) => [...prev, { q: text, a }]);
    if (a.context) setContext(a.context);
    setInput("");
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI CHATBOT"
        description="질문에서 공장·지표·TOP N·그래프 유형을 해석해 표와 차트로 답합니다. (1공장 SEAL=본사(SEAL), 1공장 GROMMET=본사(GROMMET))"
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
        {context?.productNames.length ? (
          <p className="mb-3 rounded-lg bg-canvas px-3 py-2 text-xs text-muted">
            이어 질문 가능 · 직전 품번 {context.productNames.length}개
            {context.scopes.length > 1
              ? ` (${context.scopes.map((s) => s.label).join(", ")})`
              : ""}
          </p>
        ) : null}
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
