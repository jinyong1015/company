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
    <article className="card px-5 py-4">
      <p className="text-[13px] text-muted">{item.label}</p>
      <p className="num mt-2 text-[28px] font-semibold tracking-tight text-ink">{item.value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className={`num font-medium ${toneClass[item.tone]}`}>{item.delta}</span>
        <span className="text-muted">{item.deltaLabel}</span>
      </div>
    </article>
  )
}
