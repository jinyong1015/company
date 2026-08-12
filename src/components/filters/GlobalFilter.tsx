import { useState } from 'react'
import { ChevronDown, FilterX, SlidersHorizontal } from 'lucide-react'
import { periodPresets } from '../../data/seedData'
import { useFilters } from '../../context/FilterContext'
import { useData } from '../../context/DataContext'

export function GlobalFilter() {
  const { filters, setPeriod, setDateRange, toggleMulti, clearFilters, activeFilterCount } =
    useFilters()
  const { analytics } = useData()
  const [open, setOpen] = useState(false)

  const multiGroups: {
    key: Parameters<typeof toggleMulti>[0]
    label: string
    options: string[]
  }[] = [
    { key: 'teams', label: '소속', options: analytics.filterOptions.teams },
    { key: 'inspectors', label: '검사원', options: analytics.filterOptions.inspectors },
    { key: 'workTypes', label: '작업 구분', options: analytics.filterOptions.workTypes },
    { key: 'productTypes', label: '제품 유형', options: analytics.filterOptions.productTypes },
    { key: 'products', label: '제품', options: analytics.filterOptions.products },
    { key: 'molds', label: '금형번호', options: analytics.filterOptions.molds },
    { key: 'equipment', label: '설비', options: analytics.filterOptions.equipment },
    { key: 'workers', label: '작업자', options: analytics.filterOptions.workers },
    { key: 'lots', label: '성형 LOT', options: analytics.filterOptions.lots },
  ]

  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted">기간</span>
        {periodPresets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriod(p.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              filters.period === p.id
                ? 'bg-ink text-white'
                : 'bg-canvas text-muted hover:text-ink'
            }`}
          >
            {p.label}
          </button>
        ))}

        {filters.period === 'custom' && (
          <div className="ml-1 flex items-center gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setDateRange(e.target.value, filters.endDate)}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            />
            <span className="text-muted">~</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setDateRange(filters.startDate, e.target.value)}
              className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm text-muted hover:bg-canvas hover:text-ink"
            >
              <FilterX size={14} />
              초기화
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm text-ink hover:bg-canvas"
          >
            <SlidersHorizontal size={14} />
            추가 필터
            {activeFilterCount > 0 && (
              <span className="num rounded-md bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown size={14} className={`transition ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-3 border-t border-line pt-3 md:grid-cols-2 xl:grid-cols-3">
          {multiGroups.map((group) => (
            <div key={group.key} className="rounded-lg border border-line p-3">
              <p className="mb-2 text-xs font-medium text-muted">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.options.length === 0 ? (
                  <span className="text-xs text-muted">데이터 없음</span>
                ) : (
                  group.options.map((opt) => {
                    const selected = filters[group.key].includes(opt)
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => toggleMulti(group.key, opt)}
                        className={`rounded-md px-2 py-1 text-xs transition-colors ${
                          selected
                            ? 'bg-accent text-white'
                            : 'bg-canvas text-muted hover:text-ink'
                        }`}
                      >
                        {opt}
                      </button>
                    )
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
