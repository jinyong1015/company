import { periodPresets } from '../../data/seedData'
import { useFilters } from '../../context/FilterContext'

export function GlobalFilter() {
  const { filters, setPeriod, setDateRange } = useFilters()

  return (
    <div className="card px-4 py-3">
      <p className="mb-2 text-xs font-medium text-muted">기간</p>
      <div className="flex flex-wrap items-center gap-2">
        {periodPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              filters.period === p.id
                ? 'bg-accent text-white'
                : 'bg-canvas text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>
      {filters.period === 'custom' && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setDateRange(e.target.value, filters.endDate)}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm"
          />
          <span className="text-muted">~</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setDateRange(filters.startDate, e.target.value)}
            className="rounded-full border border-line bg-white px-3 py-1.5 text-sm"
          />
        </div>
      )}
    </div>
  )
}
