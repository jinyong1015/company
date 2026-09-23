import { Link } from 'react-router-dom'
import { ArrowRight, ShieldAlert, ShieldCheck } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { useData } from '../context/DataContext'
import { formatPpm } from '../lib/format'
import type { QualityCheckItem } from '../types'

const WARN_LABELS = new Set([
  '합격+부적합 ≠ 검수량',
  '설비 누락',
  '금형번호 누락',
  'LOT 누락',
])

function checkSeverity(item: QualityCheckItem): 'error' | 'warn' {
  return item.severity ?? (WARN_LABELS.has(item.label) ? 'warn' : 'error')
}

const statusBadgeClass = {
  ok: 'pd-status-badge pd-status-badge-ok',
  warn: 'pd-status-badge pd-status-badge-warn',
  error: 'pd-status-badge pd-status-badge-error',
  excluded: 'pd-status-badge pd-status-badge-excluded',
} as const

const statusLabel = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '분석 제외',
} as const

export function DataQuality() {
  const { records, meta, analytics } = useData()
  const result = meta.uploadResult
  const counts = {
    ok: records.filter((r) => r.rowClass === 'ok').length,
    warn: records.filter((r) => r.rowClass === 'warn').length,
    error: records.filter((r) => r.rowClass === 'error').length,
    excluded: records.filter((r) => r.rowClass === 'excluded').length,
  }

  const errorChecks = (result?.qualityChecks ?? []).filter(
    (item) => checkSeverity(item) === 'error',
  )
  const warnChecks = (result?.qualityChecks ?? []).filter(
    (item) => checkSeverity(item) === 'warn',
  )

  return (
    <div className="manage-page space-y-5">
      <PageHeader
        title="데이터 품질"
        description="오류는 분석에서 제외되고, 경고는 검사 DATA에 포함됩니다."
      />

      <div className="manage-kpi-grid">
        {[
          { label: '정상', value: counts.ok, tone: 'ok', hint: '경고 없는 분석 대상' },
          { label: '경고', value: counts.warn, tone: 'warn', hint: '분석 포함 · 확인 필요' },
          { label: '오류', value: counts.error, tone: 'danger', hint: '분석 제외' },
          {
            label: '품질 Score',
            value: result?.score ?? 0,
            tone: 'accent',
            hint: `분석 제외 ${counts.excluded.toLocaleString()}건`,
            suffix: '%',
          },
        ].map((item) => (
          <div key={item.label} className={`manage-kpi-card manage-kpi-card-${item.tone}`}>
            <p className="manage-kpi-label">{item.label}</p>
            <p className="manage-kpi-value num">
              {item.value.toLocaleString('ko-KR')}
              {item.suffix ?? '건'}
            </p>
            <p className="manage-kpi-hint">{item.hint}</p>
          </div>
        ))}
      </div>

      {result ? (
        <section className="manage-panel">
          <div className="manage-panel-head">
            <div>
              <h2 className="manage-panel-title">
                데이터 품질 검사 결과 · Score {result.score}%
              </h2>
              <p className="manage-panel-sub">
                오류는 분석에서 제외되고, 경고는 검사 DATA에 포함됩니다.
              </p>
            </div>
            <div className="manage-panel-links">
              {counts.error > 0 ? (
                <Link to="/error-data" className="manage-inline-link">
                  오류 DATA
                  <ArrowRight size={14} aria-hidden />
                </Link>
              ) : null}
              <Link to="/data" className="manage-inline-link">
                검사 DATA
                <ArrowRight size={14} aria-hidden />
              </Link>
            </div>
          </div>
          <div className="manage-panel-body manage-quality-split">
            <div className="manage-quality-col manage-quality-col-error">
              <div className="manage-quality-col-head">
                <ShieldAlert size={16} aria-hidden />
                <div>
                  <h3>오류 조건</h3>
                  <p>해당 시 분석 제외 · 오류 DATA로 분류</p>
                </div>
              </div>
              <div className="manage-quality-list">
                {errorChecks.map((item) => (
                  <div
                    key={item.label}
                    className={`manage-quality-row${item.count > 0 ? ' has-count' : ''}`}
                  >
                    <span title={item.label}>{item.label}</span>
                    <span className="num">{item.count}건</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="manage-quality-col manage-quality-col-warn">
              <div className="manage-quality-col-head">
                <ShieldCheck size={16} aria-hidden />
                <div>
                  <h3>경고 조건</h3>
                  <p>분석에는 포함 · 검사 DATA에서 경고로 표시</p>
                </div>
              </div>
              <div className="manage-quality-list">
                {warnChecks.map((item) => (
                  <div
                    key={item.label}
                    className={`manage-quality-row manage-quality-row-warn${item.count > 0 ? ' has-count' : ''}`}
                  >
                    <span title={item.label}>{item.label}</span>
                    <span className="num">{item.count}건</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="manage-panel">
        <div className="manage-panel-head">
          <div>
            <h2 className="manage-panel-title">분석 반영 현황</h2>
            <p className="manage-panel-sub">
              분석 건수 {analytics.summary.recordCount.toLocaleString()}건 · 검수량{' '}
              {analytics.summary.totalQty.toLocaleString()} · 부적합률{' '}
              {formatPpm(analytics.summary.failRate)} · 제외{' '}
              {analytics.summary.excludedCount.toLocaleString()}건
            </p>
          </div>
        </div>
      </section>

      <section className="manage-panel">
        <div className="manage-panel-head">
          <div>
            <h2 className="manage-panel-title">이슈 행 미리보기</h2>
            <p className="manage-panel-sub">
              오류(#N/A 포함)는 분석 제외, 경고는 검사 DATA에 포함
            </p>
          </div>
        </div>
        <div className="manage-panel-body">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>상태</th>
                  <th>날짜</th>
                  <th>검사원</th>
                  <th>품번</th>
                  <th>이슈</th>
                </tr>
              </thead>
              <tbody>
                {records
                  .filter((r) => r.rowClass !== 'ok')
                  .slice(0, 20)
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <span className={statusBadgeClass[r.rowClass]}>
                          {statusLabel[r.rowClass]}
                        </span>
                      </td>
                      <td className="num">{r.date}</td>
                      <td>{r.inspector}</td>
                      <td>{r.product}</td>
                      <td>{r.issues.join(', ') || '-'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  )
}
