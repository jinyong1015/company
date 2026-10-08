import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RotateCcw,
  Upload,
} from 'lucide-react'
import { VinaNotice } from '../../components/vina/VinaNotice'
import { VinaSubNav } from '../../components/vina/VinaSubNav'
import { useVinaData } from '../../context/VinaDataContext'
import { createVinaSampleWorkbook } from '../../lib/vinaExcel'
import { VINA_ITEM_UNMAPPED_ISSUE } from '../../lib/vinaItemNormalize'
import type { QualityCheckItem } from '../../types'

function checkSeverity(item: QualityCheckItem): 'error' | 'warn' {
  return item.severity ?? 'error'
}

function isUnmappedQualityLabel(label: string) {
  return (
    label === VINA_ITEM_UNMAPPED_ISSUE ||
    label.replace(/\s+/g, '') === '품번변환확인필요'
  )
}

export function VinaManage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    meta,
    records,
    analytics,
    uploading,
    uploadError,
    uploadExcel,
    clearVinaData,
    hasUploadedData,
    pending,
    confirmUpload,
    confirmExcludeErrors,
    discardPending,
  } = useVinaData()
  const [localName, setLocalName] = useState<string | null>(meta.fileName)
  const [dragging, setDragging] = useState(false)

  const sourceRecords = pending?.records ?? records
  const resultBase = pending?.uploadResult ?? meta.uploadResult

  const result = useMemo(() => {
    if (!resultBase) return null
    const ok = sourceRecords.filter((r) => r.rowClass === 'ok').length
    const warn = sourceRecords.filter((r) => r.rowClass === 'warn').length
    const error = sourceRecords.filter((r) => r.rowClass === 'error').length
    const excluded = sourceRecords.filter((r) => r.rowClass === 'excluded').length
    return {
      ...resultBase,
      valid: sourceRecords.length ? ok : resultBase.valid,
      warn: sourceRecords.length ? warn : resultBase.warn,
      error: sourceRecords.length ? error : resultBase.error,
      excluded: sourceRecords.length ? excluded : resultBase.excluded,
      qualityChecks: (resultBase.qualityChecks ?? []).filter(
        (item) => !isUnmappedQualityLabel(item.label),
      ),
    }
  }, [resultBase, sourceRecords])

  const counts = result
    ? {
        ok: result.valid,
        warn: result.warn,
        error: result.error,
        excluded: result.excluded,
      }
    : { ok: 0, warn: 0, error: 0, excluded: 0 }
  const displayName = localName ?? meta.fileName
  const showFileStatus = Boolean(displayName || uploading || pending)

  const handleFile = async (file: File) => {
    setLocalName(file.name)
    try {
      await uploadExcel(file)
    } catch {
      // uploadError set in context
    }
  }

  const handleResetToSeed = () => {
    clearVinaData()
    setLocalName(null)
  }

  const downloadSample = () => {
    const blob = createVinaSampleWorkbook()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'VINA_DATA_샘플.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="manage-page space-y-4">
      <VinaSubNav />

      <header className="manage-page-header">
        <div className="min-w-0">
          <h1 className="manage-page-title">VINA 데이터 업로드</h1>
        </div>
        <div className="manage-page-actions">
          <button type="button" onClick={downloadSample} className="manage-action-btn">
            <Download size={15} aria-hidden />
            샘플 엑셀
          </button>
          {hasUploadedData ? (
            <button
              type="button"
              onClick={handleResetToSeed}
              className="manage-action-btn"
              title="업로드된 VINA 데이터를 삭제하고 초기 상태로 되돌립니다"
            >
              <RotateCcw size={15} aria-hidden />
              시드 복원
            </button>
          ) : null}
        </div>
      </header>

      <VinaNotice />

      <section className="manage-panel">
        <div className="manage-panel-head">
          <div>
            <h2 className="manage-panel-title">Excel Upload</h2>
            <p className="manage-panel-sub">
              .xlsx / .xls · Work Day · ITEM · 사원명 · 설비 · 검사수량 · NG수량 등
            </p>
          </div>
        </div>
        <div className="manage-panel-body">
          <div
            role="button"
            tabIndex={0}
            className={`manage-dropzone${dragging ? ' is-dragging' : ''}${uploading ? ' is-busy' : ''}`}
            onClick={() => {
              if (!uploading) inputRef.current?.click()
            }}
            onKeyDown={(e) => {
              if (uploading) return
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              const file = e.dataTransfer.files?.[0]
              if (file) void handleFile(file)
            }}
          >
            <div className="manage-dropzone-icon" aria-hidden>
              {uploading ? (
                <Upload size={22} className="animate-pulse" />
              ) : (
                <Upload size={22} />
              )}
            </div>
            <p className="manage-dropzone-title">
              {uploading
                ? 'VINA 엑셀 분석 중…'
                : 'VINA 검사 엑셀을 드래그하거나 클릭하여 업로드'}
            </p>
            <p className="manage-dropzone-hint">
              Work Day · ITEM · 사원명 · 설비 · 검사수량 · NG수량 · 검사금액 등
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />
          </div>

          {showFileStatus ? (
            <div className="manage-file-card">
              <FileSpreadsheet size={18} style={{ color: 'var(--accent)' }} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-semibold"
                  style={{ color: 'var(--text)' }}
                >
                  {displayName ?? '파일'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {uploading
                    ? '파일 구조 검증 · 컬럼 매핑 · 중복/누락/타입 검사 중…'
                    : pending
                      ? pending.uploadResult.blocked
                        ? '오류 행 포함 · 전체 저장 후 VINA 오류 DATA에서 확인'
                        : pending.uploadResult.warn > 0
                          ? '경고 DATA 확인 후 저장하세요'
                          : '검증 완료'
                      : hasUploadedData
                        ? `업로드 완료 · 분석 레코드 ${analytics.summary.recordCount.toLocaleString()}건 반영`
                        : '대기 중'}
                </p>
              </div>
              {!uploading && !pending && hasUploadedData ? (
                <CheckCircle2 size={18} style={{ color: 'var(--success)' }} />
              ) : null}
              {!uploading && pending?.uploadResult.blocked ? (
                <AlertTriangle size={18} style={{ color: 'var(--error)' }} />
              ) : null}
            </div>
          ) : null}

          {uploadError ? <p className="manage-error-banner">{uploadError}</p> : null}

          {pending ? (
            <div className="manage-page-actions" style={{ marginTop: 14 }}>
              {!pending.uploadResult.blocked && pending.uploadResult.warn > 0 ? (
                <button type="button" onClick={confirmUpload} className="manage-action-btn">
                  경고 확인 후 업로드
                </button>
              ) : null}
              {pending.uploadResult.blocked ? (
                <button
                  type="button"
                  onClick={confirmExcludeErrors}
                  className="manage-action-btn"
                >
                  전체 저장 (오류는 분석 제외)
                </button>
              ) : null}
              <button type="button" onClick={discardPending} className="manage-action-btn">
                취소
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {result ? (
        <>
          <div className="manage-kpi-grid">
            {[
              {
                label: '정상',
                value: counts.ok,
                tone: 'ok' as const,
                hint: '경고 없는 분석 대상',
              },
              {
                label: '경고',
                value: counts.warn,
                tone: 'warn' as const,
                hint: '분석 포함',
              },
              {
                label: '오류',
                value: counts.error,
                tone: 'danger' as const,
                hint: '분석 제외',
              },
              {
                label: '품질 Score',
                value: result.score,
                tone: 'accent' as const,
                hint: `전체 ${result.total.toLocaleString()}건`,
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

          <section className="manage-panel">
            <div className="manage-panel-head">
              <div>
                <h2 className="manage-panel-title">
                  VINA 데이터 품질 검사 · Score {result.score}%
                </h2>
                <p className="manage-panel-sub">
                  오류는 VINA 분석에서 제외되고, 경고는 분석에 포함됩니다.
                </p>
              </div>
              <div className="manage-panel-links">
                <Link to="/vina" className="manage-inline-link">
                  VINA 분석
                  <ArrowRight size={14} aria-hidden />
                </Link>
                <Link to="/vina/data" className="manage-inline-link">
                  검사 DATA
                  <ArrowRight size={14} aria-hidden />
                </Link>
                <Link to="/vina/error-data" className="manage-inline-link">
                  오류 DATA
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </div>
            <div className="manage-panel-body manage-quality-split">
              <div className="manage-quality-col manage-quality-col-error">
                <div className="manage-quality-col-head">
                  <div>
                    <h3>오류 조건</h3>
                    <p>해당 시 분석 제외</p>
                  </div>
                </div>
                <div className="manage-quality-list">
                  {result.qualityChecks
                    .filter((item) => checkSeverity(item) === 'error')
                    .map((item) => (
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
                  <div>
                    <h3>경고 조건</h3>
                    <p>분석에는 포함</p>
                  </div>
                </div>
                <div className="manage-quality-list">
                  {result.qualityChecks
                    .filter((item) => checkSeverity(item) === 'warn')
                    .map((item) => (
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
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
