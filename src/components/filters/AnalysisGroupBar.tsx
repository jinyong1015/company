import { ANALYSIS_GROUPS } from '../../lib/groups'
import { useFilters } from '../../context/FilterContext'

export function AnalysisGroupBar() {
  const { filters, setAnalysisGroup } = useFilters()

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ANALYSIS_GROUPS.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => setAnalysisGroup(g.id)}
          className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
            filters.analysisGroup === g.id
              ? 'bg-ink text-white'
              : 'bg-canvas text-muted hover:text-ink'
          }`}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}
