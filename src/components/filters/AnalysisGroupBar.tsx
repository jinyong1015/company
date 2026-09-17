import { ANALYSIS_GROUPS } from '../../lib/groups'
import { useFilters } from '../../context/FilterContext'

/** @deprecated Prefer GlobalFilterSection — kept for isolated reuse */
export function AnalysisGroupBar() {
  const { filters, setAnalysisGroup } = useFilters()

  return (
    <div className="filter-pills" role="radiogroup" aria-label="분석 그룹">
      {ANALYSIS_GROUPS.map((g) => (
        <button
          key={g.id}
          type="button"
          role="radio"
          aria-checked={filters.analysisGroup === g.id}
          onClick={() => setAnalysisGroup(g.id)}
          className="filter-pill"
          data-active={filters.analysisGroup === g.id}
        >
          {g.label}
        </button>
      ))}
    </div>
  )
}
