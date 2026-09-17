import { periodPresets } from '../../data/seedData'
import { useFilters } from '../../context/FilterContext'

/** @deprecated Prefer GlobalFilterSection — kept for isolated reuse */
export function GlobalFilter() {
  const { filters, setPeriod, setDateRange } = useFilters()
  const dateError =
    Boolean(filters.startDate) &&
    Boolean(filters.endDate) &&
    filters.endDate < filters.startDate
  const showCustomDates = filters.period === 'custom' || dateError

  return (
    <div className="filter-card">
      <p className="filter-card-label">조회기간</p>
      <div className="filter-pills filter-pills-nowrap" role="radiogroup">
        {periodPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={filters.period === p.id}
            onClick={() => setPeriod(p.id)}
            className="filter-pill"
            data-active={filters.period === p.id}
          >
            {p.label}
          </button>
        ))}
      </div>
      {showCustomDates ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setDateRange(e.target.value, filters.endDate)}
            className="filter-date-input"
            aria-label="시작일"
          />
          <span className="text-xs text-muted">~</span>
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setDateRange(filters.startDate, e.target.value)}
            className="filter-date-input"
            aria-label="종료일"
          />
          {dateError ? (
            <p className="w-full text-xs text-danger">
              종료일은 시작일보다 빠를 수 없습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
