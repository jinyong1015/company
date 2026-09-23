import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Megaphone,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Upload,
} from 'lucide-react'
import { useData } from '../context/DataContext'
import { createSampleWorkbook } from '../lib/excel'
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

export function DataManagement() {
  const inputRef = useRef<HTMLInputElement>(null)
  const {
    meta,
    uploading,
    uploadError,
    uploadExcel,
    resetToSeed,
    analytics,
    hasUploadedData,
    pending,
    confirmUpload,
    confirmExcludeErrors,
    discardPending,
  } = useData()
  const [localName, setLocalName] = useState<string | null>(meta.fileName)
  const [dragging, setDragging] = useState(false)
  const result = pending?.uploadResult ?? meta.uploadResult
  const counts = result
    ? {
        ok: result.valid,
        warn: result.warn,
        error: result.error,
        excluded: result.excluded,
      }
    : { ok: 0, warn: 0, error: 0, excluded: 0 }
  const displayName =
    localName ?? meta.fileName ?? (meta.source === 'seed' ? '시드 데이터' : null)
  const showFileStatus = Boolean(displayName || uploading || pending)

  const handleFile = async (file: File) => {
    setLocalName(file.name)
    try {
      await uploadExcel(file)
    } catch {
      // uploadError is set in context
    }
  }

  const handleResetToSeed = () => {
    resetToSeed()
    setLocalName(null)
  }

  const downloadSample = () => {
    const blob = createSampleWorkbook()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '검사DATA_샘플.xlsx'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="manage-page">
      <header className="manage-page-header">
        <div className="min-w-0">
          <p className="manage-page-kicker">DATA MANAGEMENT</p>
          <h1 className="manage-page-title">데이터 업로드</h1>
          <p className="manage-page-desc">
            MES 최종검사일지현황 엑셀을 업로드하면 검증·집계 후 전체 분석 메뉴에 반영됩니다.
          </p>
        </div>
        <div className="manage-page-actions">
          <button type="button" onClick={downloadSample} className="manage-action-btn">
            <Download size={14} />
            샘플 엑셀
          </button>
          {hasUploadedData ? (
            <button type="button" onClick={handleResetToSeed} className="manage-action-btn">
              <RotateCcw size={14} />
              시드 복원
            </button>
          ) : null}
        </div>
      </header>

      <div className="manage-notice" role="note">
        <Megaphone size={18} className="manage-notice-icon" aria-hidden />
        <div className="min-w-0">
          <p className="manage-notice-title">공지사항</p>
          <p className="manage-notice-body">
            MES 최종검사일지현황 데이터를 업로드하시면 됩니다. 오류 행은 분석에서 제외되고, 경고
            행은 분석에 포함됩니다.
          </p>
        </div>
      </div>

      <section className="manage-panel">
        <div className="manage-panel-head">
          <div>
            <h2 className="manage-panel-title">Excel Upload</h2>
            <p className="manage-panel-sub">
              .xlsx / .xls · 헤더 자동 인식 · 작업구분은 검사작업만 허용
            </p>
          </div>
        </div>
        <div className="manage-panel-body">
          <div
            role="button"
            tabIndex={0}
            className={`manage-dropzone${dragging ? ' is-dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
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
            <div className="manage-dropzone-icon">
              <Upload size={22} />
            </div>
            <p className="manage-dropzone-title">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
            <p className="manage-dropzone-hint">
              .xlsx, .xls · 컬럼명 변형도 자동 매핑됩니다
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
                <p className="truncate text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {displayName ?? '파일'}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {uploading
                    ? '파일 구조 검증 · 컬럼 매핑 · 중복/누락/타입 검사 중…'
                    : pending
                      ? pending.uploadResult.blocked
                        ? '오류 행 포함 · 전체 저장 후 오류 DATA에서 확인'
                        : pending.uploadResult.warn > 0
                          ? '경고 DATA 확인 후 저장하세요'
                          : '검증 완료'
                      : hasUploadedData
                        ? `업로드 완료 · 분석 레코드 ${analytics.summary.recordCount.toLocaleString()}건 반영`
                        : meta.source === 'seed'
                          ? `시드 데이터 사용 중 · 분석 레코드 ${analytics.summary.recordCount.toLocaleString()}건`
                          : '대기 중'}
                </p>
              </div>
              {!uploading && !pending && (hasUploadedData || meta.source === 'seed') ? (
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
                <button type="button" onClick={confirmExcludeErrors} className="manage-action-btn">
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
                hint: '분석 포함 · 품질 주의',
              },
              {
                label: '오류 (#N/A 포함)',
                value: counts.error,
                tone: 'danger' as const,
                hint: '분석 제외',
              },
              {
                label: '품질 Score',
                value: result.score,
                tone: 'accent' as const,
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
                {(meta.uploadResult?.error ?? 0) > 0 || counts.error > 0 ? (
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
                  <ShieldCheck size={16} aria-hidden />
                  <div>
                    <h3>경고 조건</h3>
                    <p>분석에는 포함 · 검사 DATA에서 경고로 표시</p>
                  </div>
                </div>
                <div className="manage-quality-list">
                  {result.qualityChecks
                    .filter((item) => checkSeverity(item) === 'warn')
                    .map((item) => (
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

          {!pending && hasUploadedData ? (
            <section className="manage-panel">
              <div className="manage-panel-head">
                <div>
                  <h2 className="manage-panel-title">분석 반영 완료</h2>
                  <p className="manage-panel-sub">
                    엑셀 전체 행이 저장됩니다. 정상·경고는 검사 DATA, 오류는 오류 DATA에서 확인하며
                    분석 KPI에서는 오류 행이 제외됩니다.
                  </p>
                </div>
                <div className="manage-panel-links">
                  <Link to="/" className="manage-inline-link">
                    Dashboard
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                </div>
              </div>
              <div className="manage-panel-body">
                <div className="manage-result-grid">
                  <div className="manage-result-tile">
                    <p>분석 건수</p>
                    <strong className="num">
                      {analytics.summary.recordCount.toLocaleString()}건
                    </strong>
                  </div>
                  <div className="manage-result-tile">
                    <p>검수량</p>
                    <strong className="num">{analytics.summary.totalQty.toLocaleString()}</strong>
                  </div>
                  <div className="manage-result-tile">
                    <p>부적합률</p>
                    <strong className="num">{formatPpm(analytics.summary.failRate)}</strong>
                  </div>
                  <div className="manage-result-tile">
                    <p>분석 제외</p>
                    <strong className="num">
                      {analytics.summary.excludedCount.toLocaleString()}건
                    </strong>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
