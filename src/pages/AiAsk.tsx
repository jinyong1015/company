import { useState } from 'react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { useFilters } from '../context/FilterContext'
import { groupLabel } from '../lib/groups'
import type { Analytics } from '../types'

function answerQuestion(q: string, analytics: Analytics, group: string) {
  const text = q.trim()
  const products = [...analytics.products].sort((a, b) => b.failRate - a.failRate)
  const inspectors = [...analytics.inspectors].sort((a, b) => b.qty - a.qty)
  const costs = [...analytics.products].sort((a, b) => b.scrapCost - a.scrapCost)
  const risen = [...analytics.products].sort((a, b) => b.changeRate - a.changeRate)

  if (!text) return ['질문을 입력하세요.']

  if (text.includes('비교')) {
    const rows = analytics.groupSummaries
    return [
      `${group} 컨텍스트 기준 그룹 비교입니다.`,
      ...rows.map((g) => `${g.label}: 검수량 ${g.qty.toLocaleString()}, 부적합률 ${g.failRate.toFixed(2)}%, 폐기비용 ₩${g.scrapCost.toLocaleString()}`),
    ]
  }
  if (text.includes('폐기') || text.includes('비용')) {
    return [
      `${group}에서 폐기비용이 높은 품번입니다.`,
      ...costs.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} · ₩${p.scrapCost.toLocaleString()} · 부적합 ${p.fail.toLocaleString()} · 주요불량 ${p.mainDefect}`),
    ]
  }
  if (text.includes('검사자') && text.includes('품번')) {
    const top = inspectors[0]
    return top
      ? [
          `${group}에서 검수량이 가장 많은 검사자는 ${top.name}입니다.`,
          ...top.products.slice(0, 5).map((p, i) => `${i + 1}. ${p.product} · ${p.qty.toLocaleString()} EA`),
        ]
      : ['검사자 데이터가 없습니다.']
  }
  if (text.includes('검사자')) {
    return [
      `${group} 검사량 TOP 검사자입니다.`,
      ...inspectors.slice(0, 5).map((i, idx) => `${idx + 1}. ${i.name}(${i.team}) · ${i.qty.toLocaleString()} EA · UPH ${i.uph}`),
    ]
  }
  if (text.includes('증가')) {
    return [
      `${group}에서 이전 기간 대비 부적합률이 가장 많이 증가한 품번입니다.`,
      ...risen.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} · ${p.changeRate > 0 ? '+' : ''}${p.changeRate.toFixed(2)}%p`),
    ]
  }
  if (text.includes('설비')) {
    const eq = [...analytics.equipment].sort((a, b) => b.qty - a.qty)[0]
    return eq
      ? [
          `${group}에서 검사량이 많은 설비는 ${eq.name}입니다.`,
          ...eq.products.slice(0, 5).map((p, i) => `${i + 1}. ${p.product} · ${p.qty.toLocaleString()} EA`),
        ]
      : ['설비 데이터가 없습니다.']
  }

  return [
    `${group} 기준 부적합률이 높은 품번 TOP 5입니다. (#N/A 제외)`,
    ...products.slice(0, 5).map((p, i) => `${i + 1}. ${p.name} · ${p.failRate.toFixed(2)}% · 부적합 ${p.fail.toLocaleString()} · ${p.mainDefect}`),
  ]
}

const samples = [
  '본사(SEAL)과 본사(유압+그로멧)의 부적합률을 비교해줘.',
  '2공장의 폐기비용이 높은 이유를 분석해줘.',
  '부적합률이 높은 품번 TOP 5를 알려줘.',
  '가장 많은 품번을 검사한 검사자는 누구야?',
  '지난달과 비교해서 부적합률이 가장 많이 증가한 품번은?',
]

export function AiAsk() {
  const { analytics } = useData()
  const { filters } = useFilters()
  const group = groupLabel(filters.analysisGroup)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<{ q: string; a: string[] }[]>([])

  const ask = (q: string) => {
    const text = q.trim()
    if (!text) return
    setMessages((prev) => [...prev, { q: text, a: answerQuestion(text, analytics, group) }])
    setInput('')
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI에게 질문하기"
        description={`현재 컨텍스트: ${group} · 선택 기간 DATA만 분석합니다. #N/A는 제외됩니다.`}
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
            <div key={`${m.q}-${i}`} className="rounded-xl border border-line p-3">
              <p className="text-sm font-medium">Q. {m.q}</p>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {m.a.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ask(input)
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="현재 분석 그룹/기간 기준으로 질문하세요"
            className="flex-1 rounded-lg border border-line px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm text-white">
            질문
          </button>
        </form>
      </Panel>
    </div>
  )
}
