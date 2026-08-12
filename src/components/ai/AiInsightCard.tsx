import { Link } from 'react-router-dom'
import type { InsightItem } from '../../types'
import { ArrowRight } from 'lucide-react'

const toneMap = {
  warn: {
    border: 'border-amber-200',
    bg: 'bg-amber-50/70',
    badge: 'bg-amber-100 text-amber-800',
    mark: '⚠',
  },
  good: {
    border: 'border-emerald-200',
    bg: 'bg-emerald-50/70',
    badge: 'bg-emerald-100 text-emerald-800',
    mark: '●',
  },
  danger: {
    border: 'border-orange-200',
    bg: 'bg-orange-50/70',
    badge: 'bg-orange-100 text-orange-800',
    mark: '●',
  },
} as const

export function AiInsightCard({ item }: { item: InsightItem }) {
  const tone = toneMap[item.tone]

  return (
    <article className={`rounded-xl border ${tone.border} ${tone.bg} p-4`}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone.badge}`}>
          {tone.mark} {item.title}
        </span>
      </div>
      <ul className="space-y-1.5 text-sm leading-relaxed text-ink/90">
        {item.body.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {item.action && item.to ? (
        <Link
          to={item.to}
          className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline"
        >
          {item.action}
          <ArrowRight size={14} />
        </Link>
      ) : null}
    </article>
  )
}
