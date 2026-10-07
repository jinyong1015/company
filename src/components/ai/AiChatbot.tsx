import {
  Bot,
  ChevronDown,
  RotateCcw,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useData } from '../../context/DataContext'
import {
  answerQuestion,
  type AiAnswer,
  type AiConversationContext,
} from '../../lib/aiAsk'
import { openAiChatbotPopup } from '../../lib/aiChatbotPopup'
import { loadVinaRecords } from '../../lib/vinaStorage'
import { AiAnswerBlocks } from './AiAnswerCharts'

type ChatMessage = {
  id: number
  question: string
  answer: AiAnswer
  time: string
}

type StoredChat = {
  messages: ChatMessage[]
  context: AiConversationContext | null
}

const CHAT_STORAGE_KEY = 'qualitics-ai-chatbot-conversation'

const quickQuestions = [
  '이번 주 부적합률 TOP5 보여줘',
  '지난주랑 이번 주 부적합률 비교해줘',
  '2공장 검수량 1000개 이상 · 부적합률 5% 넘는 품번',
  'VINA 품번 중 부적합률 TOP5 알려줘',
  'VINA와 기존 데이터의 부적합률 비교해줘',
]

function messageTime() {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date())
}

function loadStoredChat(): StoredChat {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return { messages: [], context: null }
    const parsed = JSON.parse(raw) as Partial<StoredChat>
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      context: parsed.context ?? null,
    }
  } catch {
    return { messages: [], context: null }
  }
}

export function AiChatbot({ popupMode = false }: { popupMode?: boolean }) {
  const { records, analytics } = useData()
  const storedChat = useRef(loadStoredChat())
  const [open, setOpen] = useState(popupMode)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>(
    storedChat.current.messages,
  )
  const [context, setContext] = useState<AiConversationContext | null>(
    storedChat.current.context,
  )
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const messageId = useRef(
    storedChat.current.messages.reduce(
      (max, message) => Math.max(max, message.id),
      0,
    ),
  )

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, open])

  useEffect(() => {
    if (!popupMode) return
    try {
      localStorage.setItem(
        CHAT_STORAGE_KEY,
        JSON.stringify({ messages, context } satisfies StoredChat),
      )
    } catch {
      // 저장 공간을 사용할 수 없어도 현재 창의 대화는 계속 유지합니다.
    }
  }, [messages, context, popupMode])

  const ask = (question: string) => {
    const text = question.trim()
    if (!text) return

    void (async () => {
      // VINA/VN/베트남 키워드가 있을 때만 엔진이 사용. 없으면 로드해도 무시됨.
      let vinaRecords: typeof records = []
      try {
        vinaRecords = await loadVinaRecords()
      } catch {
        vinaRecords = []
      }
      const answer = answerQuestion(text, analytics, records, context, {
        vinaRecords,
      })
      messageId.current += 1
      setMessages((current) => [
        ...current,
        {
          id: messageId.current,
          question: text,
          answer,
          time: messageTime(),
        },
      ])
      if (answer.context) setContext(answer.context)
      setInput('')
    })()
  }

  const resetChat = () => {
    setMessages([])
    setContext(null)
    setInput('')
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }

  const closeChatbot = () => {
    if (popupMode) {
      if (window.opener) {
        window.close()
      } else {
        window.location.assign('/')
      }
      return
    }
    setOpen(false)
  }

  if (!popupMode) {
    return (
      <button
        type="button"
        onClick={openAiChatbotPopup}
        aria-label="AI 챗봇 새 창으로 열기"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-[22px] bg-accent text-white shadow-[0_10px_30px_rgba(59,130,246,0.32)] transition hover:-translate-y-0.5 hover:bg-blue-600 sm:bottom-6 sm:right-6"
      >
        <Bot size={29} strokeWidth={2} />
        <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-accent bg-white text-accent">
          <Sparkles size={8} strokeWidth={2.5} />
        </span>
      </button>
    )
  }

  return (
    <>
      {!popupMode && open ? (
        <button
          type="button"
          aria-label="AI 챗봇 닫기"
          className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] sm:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <section
        role="dialog"
        aria-modal={open}
        aria-label="Qualitics AI 챗봇"
        className={`ai-chat-surface fixed z-50 flex flex-col overflow-hidden transition-all duration-200 ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-95 opacity-0'
        } ${
          popupMode
            ? 'inset-0 h-dvh w-full'
            : 'inset-x-3 bottom-3 top-3 rounded-3xl border border-black/10 shadow-[0_24px_70px_rgba(15,23,42,0.28)] sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(700px,calc(100vh-120px))] sm:w-[420px]'
        }`}
      >
        <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 text-ink">
          <div className="flex h-10 w-10 items-center justify-center rounded-[15px] bg-accent text-white shadow-sm">
            <Bot size={21} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="truncate text-[15px] font-bold">Qualitics AI</h2>
              <Sparkles className="text-accent" size={13} />
            </div>
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-[#22a06b]" />
              품질 데이터를 바로 분석해 드려요
            </p>
          </div>
          {messages.length > 0 ? (
            <button
              type="button"
              onClick={resetChat}
              className="rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
              aria-label="대화 초기화"
              title="대화 초기화"
            >
              <RotateCcw size={17} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={closeChatbot}
            className="rounded-full p-2 text-muted transition hover:bg-canvas hover:text-ink"
            aria-label="챗봇 닫기"
          >
            <ChevronDown className="hidden sm:block" size={21} />
            <X className="sm:hidden" size={20} />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3.5 py-5 sm:px-4"
        >
          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Bot size={17} />
            </div>
            <div className="max-w-[84%]">
              <p className="mb-1 text-[11px] text-muted">Qualitics AI</p>
              <div className="rounded-2xl rounded-tl-sm bg-surface px-3.5 py-3 text-[13px] leading-5 text-ink shadow-sm">
                안녕하세요! Qualitics AI입니다.
                <br />
                기본은 업로드된 검사 DATA입니다. VINA DATA는 질문에{' '}
                <span className="font-semibold">VINA / VN / 베트남</span>을
                명시한 경우에만 사용합니다.
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
              <Bot size={17} />
            </div>
            <div className="max-w-[88%]">
              <p className="mb-1 text-[11px] text-muted">Qualitics AI · 질문 팁</p>
              <div className="rounded-2xl rounded-tl-sm bg-surface px-3.5 py-3 text-[12px] leading-relaxed text-ink shadow-sm">
                <p className="mb-2 text-[13px] font-semibold">이렇게 물으면 더 정확해요</p>
                <ul className="space-y-1.5 text-muted">
                  <li>
                    <span className="font-medium text-ink">기간</span>
                    {' — '}이번 주 / 지난주 / 이번 달 / 최근 8주 / 8월 1일~10일
                  </li>
                  <li>
                    <span className="font-medium text-ink">범위</span>
                    {' — '}본사·1공장, 2공장(구지), SEAL, 유압·GROMMET
                  </li>
                  <li>
                    <span className="font-medium text-ink">VINA</span>
                    {' — '}질문에 VINA / VN / 베트남이 있을 때만 VINA DATA
                    <br />
                    <span className="text-[11px]">
                      ※ 해외·현지·공장만으로는 VINA를 추측하지 않습니다
                    </span>
                    <br />
                    <span className="text-[11px]">
                      ※ VINA는 ITEM·사원명·검사수량·NG수량·Work Day 등 실제
                      컬럼 기준으로만 분석합니다 (없는 값은 추측하지 않음)
                    </span>
                  </li>
                  <li>
                    <span className="font-medium text-ink">지표</span>
                    {' — '}부적합률 · 부적합수량 · 검수량 · 폐기비용
                    <br />
                    <span className="text-[11px]">
                      ※ “검사 많이”=검수량 · “불량 많이 발생”=부적합수량 ·
                      “불량 심한/불량률”=부적합률
                    </span>
                    <br />
                    <span className="text-[11px]">
                      ※ %p(포인트 차이)와 %(상대 증감률)은 다르게 답합니다
                    </span>
                  </li>
                  <li>
                    <span className="font-medium text-ink">형식</span>
                    {' — '}TOP5 / WORST5 / 표+막대 / 선그래프 / 원그래프
                  </li>
                  <li>
                    <span className="font-medium text-ink">이어서</span>
                    {' — '}「TOP10으로」「2공장만」「1위 자세히」「막대로 바꿔줘」
                  </li>
                </ul>
                <p className="mt-2.5 rounded-lg bg-canvas px-2.5 py-2 text-[11px] leading-relaxed text-muted">
                  예: 「이번 주 2공장 부적합률 TOP5 막대로」
                  <br />
                  예: 「지난주 대비 부적합률이 몇 %p 올랐어?」
                </p>
              </div>
            </div>
          </div>

          {messages.length === 0 ? (
            <div className="ml-10 space-y-2">
              <p className="text-[11px] font-medium text-muted">이런 질문은 어때요?</p>
              {quickQuestions.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => ask(question)}
                  className="block max-w-full rounded-full border border-line bg-surface/80 px-3 py-2 text-left text-xs text-ink shadow-sm transition hover:bg-surface"
                >
                  {question}
                </button>
              ))}
            </div>
          ) : null}

          {messages.map((message) => (
            <div key={message.id} className="space-y-3">
              <div className="flex items-end justify-end gap-1.5">
                <span className="pb-1 text-[9px] text-muted">{message.time}</span>
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-accent px-3.5 py-2.5 text-[13px] leading-5 text-white shadow-sm">
                  {message.question}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
                  <Bot size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[11px] text-muted">Qualitics AI</p>
                  <div className="overflow-hidden rounded-2xl rounded-tl-sm bg-surface p-3 text-ink shadow-sm [&_.mt-3]:mt-0 [&_.rounded-xl]:rounded-xl">
                    <AiAnswerBlocks blocks={message.answer.blocks} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <form
          className="shrink-0 border-t border-line bg-surface px-3 py-3"
          onSubmit={(event) => {
            event.preventDefault()
            ask(input)
          }}
        >
          <div className="flex items-end gap-2 rounded-2xl bg-canvas p-1.5 pl-3">
            <textarea
              ref={inputRef}
              value={input}
              rows={1}
              maxLength={500}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  ask(input)
                }
              }}
              placeholder=""
              className="max-h-24 min-h-9 flex-1 resize-none bg-transparent py-2 text-[13px] leading-5 outline-none placeholder:text-[#999]"
            />
            <button
              type="submit"
              disabled={!input.trim()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white transition hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
              aria-label="질문 보내기"
            >
              <Send size={17} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[9px] text-[#999]">
            Enter 전송 · Shift + Enter 줄바꿈
          </p>
        </form>
      </section>

    </>
  )
}
