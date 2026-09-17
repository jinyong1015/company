import { useEffect, useMemo, useState } from 'react'
import { PencilLine, X } from 'lucide-react'
import { useAdmin, AdminAuthError } from '../../context/AdminContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { authorizeInspectionUpdate } from '../../lib/admin/clientUpdate'
import { KNOWN_DEFECT_TYPES } from '../../lib/excel'
import { recomputeInspectionRecord } from '../../lib/recomputeInspection'
import { formatPpm } from '../../lib/format'
import type { InspectionRecord } from '../../types'

const EDITABLE_FIELDS: Array<{
  key: keyof InspectionRecord
  label: string
  type?: 'text' | 'number'
}> = [
  { key: 'date', label: '검사일자' },
  { key: 'inspector', label: '검사작업자' },
  { key: 'team', label: '소속' },
  { key: 'workType', label: '작업구분' },
  { key: 'lot', label: 'LOT NO' },
  { key: 'worker', label: '성형작업자' },
  { key: 'equipment', label: '설비' },
  { key: 'productType', label: '제품유형' },
  { key: 'product', label: '품번' },
  { key: 'moldNo', label: '금형번호' },
  { key: 'start', label: '시작시간' },
  { key: 'end', label: '종료시간' },
  { key: 'duration', label: '소요시간' },
  { key: 'qty', label: '검수량', type: 'number' },
  { key: 'pass', label: '합격수', type: 'number' },
  { key: 'fail', label: '부적합수', type: 'number' },
  { key: 'scrapCost', label: '폐기금액', type: 'number' },
  { key: 'mainDefect', label: '주요 불량' },
  { key: 'hours', label: '검사시간(시간)', type: 'number' },
]

const classLabel = {
  ok: '정상',
  warn: '경고',
  error: '오류',
  excluded: '분석 제외',
} as const

export function EditInspectionRecordModal({
  record,
  onClose,
}: {
  record: InspectionRecord
  onClose: () => void
}) {
  const { updateRecord } = useData()
  const { setHasUnsavedEdits, markSessionExpired, openLogin } = useAdmin()
  const { pushToast } = useToast()
  const [draft, setDraft] = useState<InspectionRecord>(() => ({
    ...record,
    defects: { ...(record.defects ?? {}) },
    extras: { ...(record.extras ?? {}) },
  }))
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const defectKeys = useMemo(() => {
    const keys = new Set<string>([...KNOWN_DEFECT_TYPES])
    Object.keys(draft.defects ?? {}).forEach((k) => keys.add(k))
    return [...keys]
  }, [draft.defects])

  const extraKeys = useMemo(() => Object.keys(draft.extras ?? {}), [draft.extras])

  const preview = useMemo(() => recomputeInspectionRecord(draft), [draft])

  useEffect(() => {
    setHasUnsavedEdits(true)
    return () => setHasUnsavedEdits(false)
  }, [setHasUnsavedEdits])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setField = (key: keyof InspectionRecord, value: string) => {
    setDraft((prev) => {
      const next = { ...prev }
      if (typeof prev[key] === 'number') {
        ;(next as Record<string, unknown>)[key] = Number(value) || 0
      } else {
        ;(next as Record<string, unknown>)[key] = value
      }
      return next
    })
  }

  const setDefect = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      defects: {
        ...(prev.defects ?? {}),
        [key]: Math.max(0, Math.round(Number(value) || 0)),
      },
    }))
  }

  const setExtra = (key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      extras: {
        ...(prev.extras ?? {}),
        [key]: value,
      },
    }))
  }

  const addExtraField = () => {
    const name = window.prompt('추가할 열 이름을 입력하세요')
    if (!name?.trim()) return
    setExtra(name.trim(), '')
  }

  const save = async () => {
    if (!reason.trim()) {
      setError('수정 사유를 입력해 주세요.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const after = recomputeInspectionRecord(draft)
      await authorizeInspectionUpdate({
        id: record.id,
        reason: reason.trim(),
        before: record,
        after,
      })
      updateRecord(after)
      setHasUnsavedEdits(false)
      pushToast(
        '검사 DATA가 수정되었습니다. 변경 내용이 전체 분석 메뉴에 반영되었습니다.',
        'success',
      )
      if (after.rowClass === 'error' || after.rowClass === 'excluded') {
        pushToast('재검증 결과 분석 제외/오류로 분류되었습니다.', 'info')
      }
      onClose()
    } catch (err) {
      if (err instanceof AdminAuthError) {
        markSessionExpired()
        pushToast(err.message, 'error')
        openLogin()
        onClose()
        return
      }
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="util-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="util-modal util-modal-wide edit-modal"
        role="dialog"
        aria-modal="true"
        aria-label="검사 DATA 수정"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edit-modal-header">
          <div className="edit-modal-title-row">
            <div className="edit-modal-icon" aria-hidden="true">
              <PencilLine size={20} strokeWidth={2.25} />
            </div>
            <div>
              <h2 className="edit-modal-title">검사 DATA 수정</h2>
              <p className="edit-modal-sub">
                {record.product} · {record.id}
              </p>
            </div>
          </div>
          <button
            type="button"
            className="edit-modal-close"
            onClick={onClose}
            aria-label="닫기"
          >
            <X size={18} strokeWidth={2.25} />
          </button>
        </div>

        <div className="edit-modal-body">
          <p className="edit-modal-hint">
            검사 DATA 화면에 표시되는 항목을 모두 수정할 수 있습니다. 부적합률·상태는 저장 시 자동
            재계산됩니다.
          </p>

          <div className="edit-modal-grid">
            {EDITABLE_FIELDS.map((field) => (
              <label key={field.key} className="edit-modal-field">
                {field.label}
                <input
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={String(draft[field.key] ?? '')}
                  onChange={(e) => setField(field.key, e.target.value)}
                />
              </label>
            ))}

            <div className="edit-modal-section edit-modal-computed">
              <p className="edit-modal-section-title">자동 계산 (읽기 전용)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="text-xs font-semibold text-muted">부적합률</span>
                  <p className="num mt-1 text-base font-semibold text-ink">
                    {formatPpm(preview.failRate)}
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted">상태</span>
                  <p className="mt-1 text-base font-semibold text-ink">
                    {classLabel[preview.rowClass]}
                  </p>
                </div>
                {preview.issues.length > 0 ? (
                  <p className="text-sm font-medium text-warn sm:col-span-2">
                    이슈: {preview.issues.join(', ')}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="edit-modal-section">
              <p className="edit-modal-section-title">불량 유형별 수량</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {defectKeys.map((key) => (
                  <label key={key} className="edit-modal-field">
                    {key}
                    <input
                      type="number"
                      min={0}
                      value={draft.defects?.[key] ?? 0}
                      onChange={(e) => setDefect(key, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="edit-modal-section">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="edit-modal-section-title mb-0">추가 열 (비고·테이블·순번 등)</p>
                <button type="button" className="btn text-xs" onClick={addExtraField}>
                  열 추가
                </button>
              </div>
              {extraKeys.length === 0 ? (
                <p className="text-xs text-muted">
                  추가 열이 없습니다. 필요하면 「열 추가」로 입력하세요.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {extraKeys.map((key) => (
                    <label key={key} className="edit-modal-field">
                      {key}
                      <input
                        type="text"
                        value={draft.extras?.[key] ?? ''}
                        onChange={(e) => setExtra(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="edit-modal-footer">
          <label className="edit-modal-reason">
            수정 사유 (필수)
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="예: 검수량 오기입 정정"
            />
            {error ? (
              <p className="mt-1 text-sm font-medium text-danger" role="alert">
                {error}
              </p>
            ) : null}
          </label>
          <div className="edit-modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
