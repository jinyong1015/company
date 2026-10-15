import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, PencilLine, X } from 'lucide-react'
import { useAdmin, AdminAuthError } from '../../context/AdminContext'
import { useData } from '../../context/DataContext'
import { useToast } from '../../context/ToastContext'
import { authorizeInspectionUpdate } from '../../lib/admin/clientUpdate'
import { KNOWN_DEFECT_TYPES } from '../../lib/excel'
import { recomputeInspectionRecord } from '../../lib/recomputeInspection'
import { formatPpm } from '../../lib/format'
import type { InspectionRecord } from '../../types'

const FIELD_GROUPS: Array<{
  title: string
  fields: Array<{
    key: keyof InspectionRecord
    label: string
    type?: 'text' | 'number'
  }>
}> = [
  {
    title: '기본 정보',
    fields: [
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
    ],
  },
  {
    title: '시간 · 수량',
    fields: [
      { key: 'start', label: '시작시간' },
      { key: 'end', label: '종료시간' },
      { key: 'duration', label: '소요시간' },
      { key: 'hours', label: '검사시간(시간)', type: 'number' },
      { key: 'qty', label: '검수량', type: 'number' },
      { key: 'pass', label: '합격수', type: 'number' },
      { key: 'fail', label: '부적합수', type: 'number' },
      { key: 'scrapCost', label: '폐기금액', type: 'number' },
      { key: 'mainDefect', label: '주요 불량' },
    ],
  },
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

  const isErrorRecord = record.rowClass === 'error'
  const modalTitle = isErrorRecord ? '오류 DATA 수정' : '검사 DATA 수정'

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
        isErrorRecord
          ? '오류 DATA가 수정되었습니다. 변경 내용이 반영되었습니다.'
          : '검사 DATA가 수정되었습니다. 변경 내용이 전체 분석 메뉴에 반영되었습니다.',
        'success',
      )
      if (after.rowClass === 'error' || after.rowClass === 'excluded') {
        pushToast('재검증 결과 분석 제외/오류로 분류되었습니다.', 'info')
      } else if (isErrorRecord && (after.rowClass === 'ok' || after.rowClass === 'warn')) {
        pushToast('정상·경고로 바뀌어 검사 DATA로 이동합니다.', 'info')
      }
      onClose()
    } catch (err) {
      if (err instanceof AdminAuthError) {
        markSessionExpired()
        pushToast(err.message, 'error')
        openLogin('admin')
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
        className={`util-modal util-modal-wide edit-modal${isErrorRecord ? ' edit-modal--error' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={modalTitle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="edit-modal-header">
          <div className="edit-modal-title-row">
            <div className="edit-modal-icon" aria-hidden="true">
              {isErrorRecord ? (
                <AlertTriangle size={20} strokeWidth={2.25} />
              ) : (
                <PencilLine size={20} strokeWidth={2.25} />
              )}
            </div>
            <div className="min-w-0">
              <div className="edit-modal-title-line">
                <h2 className="edit-modal-title">{modalTitle}</h2>
                <span
                  className="edit-modal-status-chip"
                  data-status={preview.rowClass}
                >
                  {classLabel[preview.rowClass]}
                </span>
              </div>
              <p className="edit-modal-sub">
                <span className="edit-modal-sub-product">{record.product}</span>
                <span className="edit-modal-sub-sep" aria-hidden>
                  ·
                </span>
                <span className="edit-modal-sub-id">{record.id}</span>
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
            {isErrorRecord
              ? '오류 DATA 항목을 수정할 수 있습니다. 저장 시 부적합률·상태가 자동 재계산되며, 정상·경고로 바뀌면 검사 DATA로 이동합니다.'
              : '검사 DATA 화면에 표시되는 항목을 모두 수정할 수 있습니다. 부적합률·상태는 저장 시 자동 재계산됩니다.'}
          </p>

          <div className="edit-modal-stack">
            {FIELD_GROUPS.map((group) => (
              <section key={group.title} className="edit-modal-section">
                <p className="edit-modal-section-title">{group.title}</p>
                <div className="edit-modal-grid">
                  {group.fields.map((field) => (
                    <label key={field.key} className="edit-modal-field">
                      <span className="edit-modal-field-label">{field.label}</span>
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={String(draft[field.key] ?? '')}
                        onChange={(e) => setField(field.key, e.target.value)}
                        className={field.type === 'number' ? 'num' : undefined}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}

            <section className="edit-modal-section edit-modal-computed">
              <p className="edit-modal-section-title">자동 계산 (읽기 전용)</p>
              <div className="edit-modal-computed-grid">
                <div className="edit-modal-computed-card">
                  <span className="edit-modal-field-label">부적합률</span>
                  <p className="num edit-modal-computed-value">
                    {formatPpm(preview.failRate)}
                  </p>
                </div>
                <div className="edit-modal-computed-card">
                  <span className="edit-modal-field-label">상태</span>
                  <p className="edit-modal-computed-value">
                    <span
                      className="edit-modal-status-chip"
                      data-status={preview.rowClass}
                    >
                      {classLabel[preview.rowClass]}
                    </span>
                  </p>
                </div>
                {preview.issues.length > 0 ? (
                  <p className="edit-modal-issues">
                    이슈: {preview.issues.join(', ')}
                  </p>
                ) : null}
              </div>
            </section>

            <section className="edit-modal-section">
              <p className="edit-modal-section-title">불량 유형별 수량</p>
              <div className="edit-modal-grid edit-modal-grid-3">
                {defectKeys.map((key) => (
                  <label key={key} className="edit-modal-field">
                    <span className="edit-modal-field-label">{key}</span>
                    <input
                      type="number"
                      min={0}
                      value={draft.defects?.[key] ?? 0}
                      onChange={(e) => setDefect(key, e.target.value)}
                      className="num"
                    />
                  </label>
                ))}
              </div>
            </section>

            <section className="edit-modal-section">
              <div className="edit-modal-section-head">
                <p className="edit-modal-section-title mb-0">
                  추가 열 (비고·테이블·순번 등)
                </p>
                <button type="button" className="btn text-xs" onClick={addExtraField}>
                  열 추가
                </button>
              </div>
              {extraKeys.length === 0 ? (
                <p className="edit-modal-empty">
                  추가 열이 없습니다. 필요하면 「열 추가」로 입력하세요.
                </p>
              ) : (
                <div className="edit-modal-grid">
                  {extraKeys.map((key) => (
                    <label key={key} className="edit-modal-field">
                      <span className="edit-modal-field-label">{key}</span>
                      <input
                        type="text"
                        value={draft.extras?.[key] ?? ''}
                        onChange={(e) => setExtra(key, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="edit-modal-footer">
          <label className="edit-modal-reason">
            <span className="edit-modal-reason-label">
              수정 사유
              <span className="edit-modal-required">필수</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="예: 검수량 오기입 정정"
              data-invalid={error ? 'true' : undefined}
            />
            {error ? (
              <p className="edit-modal-error" role="alert">
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
