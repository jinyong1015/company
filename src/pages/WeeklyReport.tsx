import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { MonthlyTrendSection } from '../components/weekly-report/MonthlyTrendSection'
import { WeeklyIssuePanel } from '../components/weekly-report/WeeklyIssuePanel'
import { WeeklyProductionTable } from '../components/weekly-report/WeeklyProductionTable'
import { Worst5Card } from '../components/weekly-report/Worst5Card'
import { useData } from '../context/DataContext'
import {
  buildAutoWeeklyIssues,
  buildMonthlyReportView,
  buildWeeklyReportDetail,
  findDefaultWeek,
  listWeeksInMonth,
  periodKeyOf,
  saveWeeklyIssues,
  WEEKLY_REPORT_ORGS,
} from '../lib/weeklyReport'
import type { WeeklyReportMetric } from '../types'

function parseMonthKey(monthKey: string) {
  const [y, m] = monthKey.split('-').map(Number)
  return { year: y, month: m }
}

function defaultMonthKey(records: { date: string }[], anchor: Date) {
  if (records.length) {
    const latest = [...records].sort((a, b) => b.date.localeCompare(a.date))[0]
    return latest.date.slice(0, 7)
  }
  return `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`
}

export function WeeklyReport() {
  const { records } = useData()
  const anchor = new Date()
  const [metric, setMetric] = useState<WeeklyReportMetric>('failRate')
  const [selectedMonthKey, setSelectedMonthKey] = useState(() =>
    defaultMonthKey(records, anchor),
  )
  const [week, setWeek] = useState(1)

  const monthlyView = useMemo(
    () => buildMonthlyReportView(records, metric, anchor),
    [records, metric, anchor],
  )

  const { year, month } = useMemo(
    () => parseMonthKey(selectedMonthKey),
    [selectedMonthKey],
  )

  const weeksInMonth = useMemo(
    () => listWeeksInMonth(records, year, month),
    [records, year, month],
  )

  useEffect(() => {
    setWeek(findDefaultWeek(records, year, month))
  }, [selectedMonthKey, records, year, month])

  const weeklyDetail = useMemo(
    () => buildWeeklyReportDetail(records, year, month, week),
    [records, year, month, week],
  )

  const [issues, setIssues] = useState(weeklyDetail.issues)

  useEffect(() => {
    setIssues(weeklyDetail.issues)
  }, [weeklyDetail])

  const handleMonthSelect = useCallback((monthKey: string) => {
    setSelectedMonthKey(monthKey)
  }, [])

  const handleSaveIssues = useCallback(
    (next: typeof issues) => {
      const key = periodKeyOf(year, month, week)
      saveWeeklyIssues(key, next)
      setIssues(next)
    },
    [year, month, week],
  )

  const handleAiGenerateIssues = useCallback(() => {
    return buildAutoWeeklyIssues(weeklyDetail)
  }, [weeklyDetail])

  if (!records.length) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="주간업무 보고"
          description="관리자용 주간 품질·부적합 보고 대시보드"
        />
        <Panel title="데이터 없음">
          <p className="text-sm text-muted">
            검사 DATA를 업로드하면 월별 추세와 주간 상세 현황을 확인할 수 있습니다.
          </p>
          <Link to="/manage" className="mt-3 inline-block text-sm font-medium text-accent">
            데이터 업로드 →
          </Link>
        </Panel>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="주간업무 보고"
        description="월별 품질·부적합 추세와 주차별 상세 현황을 한 화면에서 확인합니다."
      />

      <MonthlyTrendSection
        view={monthlyView}
        metric={metric}
        onMetricChange={setMetric}
        selectedMonthKey={selectedMonthKey}
        onMonthSelect={handleMonthSelect}
      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white px-5 py-4">
          <div>
            <p className="text-lg font-semibold text-ink">
              ◆ {weeklyDetail.title}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {weeklyDetail.period.startDate} ~ {weeklyDetail.period.endDate}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedMonthKey}
              onChange={(e) => handleMonthSelect(e.target.value)}
              className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink"
            >
              {monthlyView.months.map((m) => (
                <option key={m.monthKey} value={m.monthKey}>
                  {m.monthLabel}
                </option>
              ))}
            </select>
            <div className="flex flex-wrap gap-1">
              {weeksInMonth.map((w) => (
                <button
                  key={w.weekOfMonth}
                  type="button"
                  onClick={() => setWeek(w.weekOfMonth)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    week === w.weekOfMonth
                      ? 'bg-accent text-white'
                      : w.hasData
                        ? 'bg-canvas text-muted hover:text-ink'
                        : 'bg-canvas/50 text-muted/50'
                  }`}
                >
                  {w.weekOfMonth}주
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="space-y-5">
            <Panel title="주간 생산/검사 실적" description="전주 대비 주차별 실적 비교">
              <WeeklyProductionTable rows={weeklyDetail.productionRows} />
            </Panel>
            <WeeklyIssuePanel
              issues={issues}
              onSave={handleSaveIssues}
              onAiGenerate={handleAiGenerateIssues}
            />
          </div>

          <div className="space-y-4">
            <p className="text-sm font-semibold text-ink">부적합 WORST 5</p>
            {WEEKLY_REPORT_ORGS.map((org) => (
              <Worst5Card
                key={org.id}
                title={org.label}
                color={org.color}
                minQty={org.worstMinQty}
                items={weeklyDetail.worst5[org.id]}
                periodStart={weeklyDetail.period.startDate}
                periodEnd={weeklyDetail.period.endDate}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
