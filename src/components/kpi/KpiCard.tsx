import type { KpiItem } from '../../types'

const toneClass: Record<KpiItem['tone'], string> = {
  'up-bad': 'text-danger',
  'down-bad': 'text-danger',
  'up-good': 'text-ok',
  'down-good': 'text-ok',
  neutral: 'text-muted',
}

export function KpiCard({ item }: { item: KpiItem }) {
  return (
    <article className="rounded-xl border border-line bg-surface px-4 py-4 transition-colors hover:border-accent/30">
      <p className="text-[13px] text-muted">{item.label}</p>
      <p className="num mt-2 text-2xl font-semibold tracking-tight text-ink">
        {item.value}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className={`num font-medium ${toneClass[item.tone]}`}>
          {item.delta}
        </span>
        <span className="text-muted">{item.deltaLabel}</span>
      </div>
    </article>
  )
}
