import type { KpiItem } from '../../types'

const toneClass: Record<KpiItem['tone'], string> = {
  'up-bad': 'text-danger',
  'down-bad': 'text-danger',
  'up-good': 'text-ok',
  'down-good': 'text-ok',
  neutral: 'text-muted',
}

function Spark({ tone }: { tone: KpiItem['tone'] }) {
  const color = tone.includes('bad') ? '#ef4444' : tone.includes('good') ? '#10b981' : '#3b82f6'
  return (
    <svg viewBox="0 0 88 28" className="mt-3 h-8 w-full">
      <path
        d="M1 20 C 10 18, 16 8, 24 12 S 40 24, 48 16 64 4, 72 10 82 18, 87 12"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function KpiCard({ item }: { item: KpiItem }) {
  return (
    <article className="card px-5 py-4">
      <p className="text-[13px] text-muted">{item.label}</p>
      <p className="num mt-2 text-[28px] font-semibold tracking-tight text-ink">{item.value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={`num font-medium ${toneClass[item.tone]}`}>{item.delta}</span>
        <span className="text-muted">{item.deltaLabel}</span>
      </div>
      <Spark tone={item.tone} />
    </article>
  )
}
