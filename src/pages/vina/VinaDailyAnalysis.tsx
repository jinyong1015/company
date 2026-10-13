import { Link } from 'react-router-dom'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { DailyAnalysisPanels } from '../DailyAnalysis'

/** MES 일간현황과 동일 UI · VINA 데이터만 사용 */
export function VinaDailyAnalysis() {
  const { records, hasUploadedData, loading } = useVinaData()

  const emptyState = loading ? (
    <p className="text-sm text-muted">VINA 데이터 불러오는 중…</p>
  ) : !hasUploadedData ? (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
      <p className="text-sm font-semibold text-ink">VINA 데이터가 없습니다</p>
      <p className="mt-1 text-sm text-muted">
        「VINA 데이터 업로드」 후 일간 현황을 이용할 수 있습니다.
      </p>
      <Link
        to="/vina/manage"
        className="mt-4 inline-flex rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white"
      >
        VINA 데이터 업로드
      </Link>
    </div>
  ) : null

  return (
    <DailyAnalysisPanels
      records={records}
      title="VINA 일간 현황"
      viewStateKey="vina-daily-analysis"
      productFrom="vina-daily-analysis"
      vina
      beforeHeader={<VinaSubNav />}
      afterHeader={<VinaNotice />}
      emptyState={emptyState}
    />
  )
}
