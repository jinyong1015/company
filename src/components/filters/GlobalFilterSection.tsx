import type { ReactNode } from 'react'
import { ANALYSIS_GROUPS } from '../../lib/groups'
import { periodPresets } from '../../data/seedData'
import { useFilters } from '../../context/FilterContext'

function PillGroup({
  options,
  value,
  onChange,
  nowrap = false,
}: {
  options: { id: string; label: string }[]
  value: string
  onChange: (id: string) => void
  nowrap?: boolean
}) {
  return (
    <div
      className={nowrap ? 'filter-pills filter-pills-nowrap' : 'filter-pills'}
      role="radiogroup"
    >
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

/** 첨부(companysangsan)형 전역 조회조건 — 분석 그룹 + 조회기간 */
export function GlobalFilterSection() {
  const { filters, setAnalysisGroup, setPeriod, setDateRange } = useFilters()
  const dateError =
    Boolean(filters.startDate) &&
    Boolean(filters.endDate) &&
    filters.endDate < filters.startDate
  const showCustomDates = filters.period === 'custom' || dateError

  return (
    <div className="filter-bar">
      <CompactFilterCard title="분석 그룹">
        <PillGroup
          options={ANALYSIS_GROUPS.map((g) => ({ id: g.id, label: g.label }))}
          value={filters.analysisGroup}
          onChange={(id) =>
            setAnalysisGroup(id as (typeof ANALYSIS_GROUPS)[number]['id'])
          }
        />
      </CompactFilterCard>
      <CompactFilterCard title="조회기간" className="filter-card-period">
        <PillGroup
          options={periodPresets.map((p) => ({ id: p.id, label: p.label }))}
          value={filters.period}
          onChange={(id) =>
            setPeriod(id as (typeof periodPresets)[number]['id'])
          }
          nowrap
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
