import type { ReactNode } from 'react'
import { periodPresets } from '../../data/seedData'
import { useFilters } from '../../context/FilterContext'

/**
 * VINA 전용 조회조건 — 기간만 표시.
 * 기존 분석그룹(전체/본사 SEAL/…) UI는 노출하지 않는다.
 */
function PillGroup({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="filter-pills filter-pills-nowrap" role="radiogroup">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          className="filter-pill"
          data-active={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function CompactFilterCard({
  title,
  children,
  className = '',
}: {
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`filter-card ${className}`}>
      <p className="filter-card-label">{title}</p>
      {children}
    </section>
  )
}

export function VinaFilterSection() {
  const { filters, setPeriod, setDateRange } = useFilters()
  const dateError =
    Boolean(filters.startDate) &&
    Boolean(filters.endDate) &&
    filters.endDate < filters.startDate
  const showCustomDates = filters.period === 'custom' || dateError

  return (
    <div className="filter-bar">
      <CompactFilterCard title="데이터 영역">
        <p className="text-sm font-semibold text-accent">VINA 전용</p>
        <p className="mt-1 text-xs text-muted">
          기존 검사 데이터와 분리된 VINA 데이터만 조회합니다
        </p>
      </CompactFilterCard>
      <CompactFilterCard title="조회기간" className="filter-card-period">
        <PillGroup
          options={periodPresets.map((p) => ({ id: p.id, label: p.label }))}
          value={filters.period}
          onChange={(id) =>
            setPeriod(id as (typeof periodPresets)[number]['id'])
          }
        />
        {showCustomDates ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              type="date"
              className="filter-date-input"
              value={filters.startDate}
              onChange={(e) => setDateRange(e.target.value, filters.endDate)}
              aria-label="시작일"
            />
            <span className="text-xs text-muted">~</span>
            <input
              type="date"
              className="filter-date-input"
              value={filters.endDate}
              onChange={(e) => setDateRange(filters.startDate, e.target.value)}
              aria-label="종료일"
            />
            {dateError ? (
              <p className="w-full text-xs text-danger">
                종료일은 시작일보다 빠를 수 없습니다.
              </p>
            ) : null}
          </div>
        ) : null}
      </CompactFilterCard>
    </div>
  )
}
