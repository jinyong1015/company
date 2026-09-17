import { useEffect, useState } from 'react'

type ChangeItem = {
  id: string
  recordId: string
  fields: string[]
  reason: string
  changedAt: string
  sessionId: string
  statusBefore: { isAnalysisEligible: boolean; errorCodes: string[] }
  statusAfter: { isAnalysisEligible: boolean; errorCodes: string[] }
}

export function ChangeHistoryModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<ChangeItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/inspection-data/changes?limit=50', {
          credentials: 'include',
        })
        const data = (await res.json()) as {
          ok?: boolean
          items?: ChangeItem[]
          message?: string
        }
        if (!res.ok || !data.ok) {
          throw new Error(data.message ?? '변경 이력을 불러오지 못했습니다.')
        }
        if (!cancelled) setItems(data.items ?? [])
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '불러오기 실패')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="util-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="util-modal util-modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="변경 이력"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">변경 이력</h2>
            <p className="text-sm text-muted">관리자 검사 DATA 수정 기록</p>
          </div>
          <button type="button" className="btn" onClick={onClose}>
            닫기
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">불러오는 중…</p>
        ) : error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted">아직 변경 이력이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  <th className="px-2 py-2 font-medium">수정 일시</th>
                  <th className="px-2 py-2 font-medium">데이터 ID</th>
                  <th className="px-2 py-2 font-medium">수정 필드</th>
                  <th className="px-2 py-2 font-medium">수정 사유</th>
                  <th className="px-2 py-2 font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-line/70">
                    <td className="px-2 py-2">
                      {new Date(item.changedAt).toLocaleString('ko-KR')}
                    </td>
                    <td className="num px-2 py-2 text-xs">{item.recordId}</td>
                    <td className="px-2 py-2">{item.fields.join(', ') || '-'}</td>
                    <td className="px-2 py-2">{item.reason}</td>
                    <td className="px-2 py-2">
                      {item.statusBefore.isAnalysisEligible ? '정상' : '오류'}
                      {' → '}
                      {item.statusAfter.isAnalysisEligible ? '정상' : '오류'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
