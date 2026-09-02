import { useEffect, useState } from 'react'
import { formatWonSuffix } from '../../lib/format'
import { WEEKLY_REPORT_ORGS } from '../../lib/weeklyReport'
import type { OrgWeeklyStats, WeeklyProductionRow } from '../../types'

type MetricKey = 'qty' | 'fail' | 'scrapCost'

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: 'qty', label: '검수량', unit: 'EA' },
  { key: 'fail', label: '부적합수량', unit: 'EA' },
  { key: 'scrapCost', label: '폐기비용', unit: '원' },
]

const ORG_COLUMNS = [
  ...WEEKLY_REPORT_ORGS.map((o) => ({
    id: o.id as keyof WeeklyProductionRow['columns'],
    label: o.shortLabel,
    fullLabel: o.label,
  })),
  { id: 'total' as const, label: 'TOTAL', fullLabel: 'TOTAL' },
]

export type EditableCustomPeriodLabelProps = {
  label: string
  defaultLabel: string
  queryPeriodTitle: string
  onChange: (value: string) => void
}

function formatValue(key: MetricKey, value: number) {
  if (key === 'scrapCost') return formatWonSuffix(value)
  return value.toLocaleString()
}

function cellValue(
  period: WeeklyProductionRow,
  colId: keyof WeeklyProductionRow['columns'],
  key: MetricKey,
) {
  const stats: OrgWeeklyStats = period.columns[colId]
  return stats[key]
}

function customPeriodTitle(periodKey: string) {
  if (!periodKey.startsWith('custom:')) return undefined
  const [, startDate, endDate] = periodKey.split(':')
  if (!startDate || !endDate) return undefined
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
}

const periodLabelWrapClass =
  'inline-flex items-center gap-1.5 whitespace-nowrap'

const periodLabelCellClass =
  'border-t border-line/40 px-3 py-3 text-xs font-semibold text-ink'

function CurrentBadge() {
  return <span className="text-[10px] font-bold text-accent">현재</span>
}

function EditableCustomPeriodLabel({
  label,
  defaultLabel,
  queryPeriodTitle,
  onChange,
}: EditableCustomPeriodLabelProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(label)

  useEffect(() => {
    if (!editing) setDraft(label)
  }, [label, editing])

  const commit = () => {
    const trimmed = draft.trim()
    onChange(trimmed || defaultLabel)
    setEditing(false)
  }

  if (editing) {
    const inputCh = Math.max(12, draft.length + 2)
    return (
      <span className={periodLabelWrapClass}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') {
              setDraft(label)
              setEditing(false)
            }
          }}
          onBlur={commit}
          onFocus={(e) => e.target.select()}
          style={{ width: `${inputCh}ch` }}
          className="min-w-[10ch] max-w-[24ch] rounded border border-accent bg-white px-1.5 py-0.5 text-inherit focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
          autoFocus
          aria-label="기간 표시 문구"
        />
        <CurrentBadge />
      </span>
    )
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          setEditing(true)
        }
      }}
      className={`${periodLabelWrapClass} cursor-pointer`}
      title={`조회기간: ${queryPeriodTitle}\n클릭하여 표시 문구 수정 (기본: ${defaultLabel})`}
    >
      {label}
      <CurrentBadge />
    </span>
  )
}

function PeriodLabelCell({
  period,
  editableCustomPeriodLabel,
}: {
  period: WeeklyProductionRow
  editableCustomPeriodLabel?: EditableCustomPeriodLabelProps
}) {
  const isEditableCustomCurrent =
    period.isCurrent &&
    period.periodKey.startsWith('custom:') &&
    editableCustomPeriodLabel

  if (isEditableCustomCurrent) {
    return (
      <EditableCustomPeriodLabel
        label={editableCustomPeriodLabel.label}
        defaultLabel={editableCustomPeriodLabel.defaultLabel}
        queryPeriodTitle={editableCustomPeriodLabel.queryPeriodTitle}
        onChange={editableCustomPeriodLabel.onChange}
      />
    )
  }

  return (
    <span
      className={periodLabelWrapClass}
      title={customPeriodTitle(period.periodKey)}
    >
      {period.periodLabel}
      {period.isCurrent ? <CurrentBadge /> : null}
    </span>
  )
}

function MetricBlock({
  metric,
  rows,
  editableCustomPeriodLabel,
}: {
  metric: (typeof METRICS)[number]
  rows: WeeklyProductionRow[]
  editableCustomPeriodLabel?: EditableCustomPeriodLabelProps
}) {
  return (
    <div className="overflow-x-auto rounded-xl border-2 border-ink/90 shadow-sm">
      <table className="w-full min-w-[480px] text-sm">
        <thead>
          <tr className="bg-ink text-white">
            <th className="px-3 py-2.5 text-left text-[13px] font-bold tracking-wide text-amber-400">
              {metric.label}
              <span className="ml-1 text-[11px] font-semibold text-white/80">
                ({metric.unit})
              </span>
            </th>
            {ORG_COLUMNS.map((col) => (
              <th
                key={col.id}
                className={`px-3 py-2.5 text-center text-xs font-semibold ${
                  col.id === 'total' ? 'text-red-400' : ''
                }`}
                title={col.fullLabel}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((period) => (
            <tr
              key={`${metric.key}-${period.periodKey}`}
              className={
                period.isCurrent
                  ? 'bg-blue-50 ring-2 ring-inset ring-accent'
                  : 'bg-white'
              }
            >
              <td className={periodLabelCellClass}>
                <PeriodLabelCell
                  period={period}
                  editableCustomPeriodLabel={editableCustomPeriodLabel}
                />
              </td>
              {ORG_COLUMNS.map((col) => {
                const value = cellValue(period, col.id, metric.key)
                return (
                  <td
                    key={col.id}
                    className={`num border-t border-line/40 px-3 py-3 text-center text-[15px] font-semibold tracking-tight ${
                      col.id === 'total'
                        ? 'text-danger'
                        : period.isCurrent
                          ? 'text-ink'
                          : 'text-ink/85'
                    }`}
                  >
                    {formatValue(metric.key, value)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function WeeklyProductionTable({
  rows,
  editableCustomPeriodLabel,
}: {
  rows: WeeklyProductionRow[]
  editableCustomPeriodLabel?: EditableCustomPeriodLabelProps
}) {
  return (
    <div className="space-y-4">
      {METRICS.map((metric) => (
        <MetricBlock
          key={metric.key}
          metric={metric}
          rows={rows}
          editableCustomPeriodLabel={editableCustomPeriodLabel}
        />
      ))}
    </div>
  )
}
