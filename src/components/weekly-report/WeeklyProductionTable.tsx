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

function MetricBlock({
  metric,
  rows,
}: {
  metric: (typeof METRICS)[number]
  rows: WeeklyProductionRow[]
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
              <td className="border-t border-line/40 px-3 py-3">
                <span
                  className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-ink"
                  title={customPeriodTitle(period.periodKey)}
                >
                  <span className="num">{period.periodLabel}</span>
                  {period.isCurrent ? (
                    <span className="text-[10px] font-bold text-accent">현재</span>
                  ) : null}
                </span>
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

export function WeeklyProductionTable({ rows }: { rows: WeeklyProductionRow[] }) {
  return (
    <div className="space-y-4">
      {METRICS.map((metric) => (
        <MetricBlock key={metric.key} metric={metric} rows={rows} />
      ))}
    </div>
  )
}
