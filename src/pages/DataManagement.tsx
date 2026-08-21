import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { PageHeader } from '../components/common/PageHeader'
import { Panel } from '../components/common/Panel'
import { useData } from '../context/DataContext'
import { createSampleWorkbook } from '../lib/excel'
import { formatPpm } from '../lib/format'

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
  const result = pending?.uploadResult ?? meta.uploadResult
  const counts = result
    ? {
        ok: result.valid,
        warn: result.warn,
        error: result.error,
        excluded: result.excluded,
      }
    : { ok: 0, warn: 0, error: 0, excluded: 0 }

  const handleFile = async (file: File) => {
    setLocalName(file.name)
    try {
      await uploadExcel(file)
    } catch {
      // uploadError is set in context
    }
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
    <div className="space-y-5">
      <PageHeader
        title="데이터 업로드"
        description="Excel 선택 → 컬럼 확인 → 검증 → 오류 차단 / 경고 확인 / #N/A 분석 제외 → 저장 → Dashboard 갱신"
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadSample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"
            >
              <Download size={14} />
              샘플 엑셀 다운로드
            </button>
            {hasUploadedData && (
              <button
                type="button"
                onClick={resetToSeed}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-canvas"
              >
                <RotateCcw size={14} />
                시드 데이터로 복원
              </button>
            )}
          </div>
        }
      />

      <Panel title="Excel Upload">
        <div
          className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-line bg-canvas/70 px-6 py-14 text-center transition hover:border-accent/40"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files?.[0]
            if (file) void handleFile(file)
          }}
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <Upload size={22} />
          </div>
          <p className="text-sm font-medium">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
          <p className="mt-1 text-xs text-muted">
            .xlsx, .xls · 작업구분은 사상작업 또는 검사작업만 허용 · 헤더 자동 인식
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

        {(localName || uploading || meta.fileName) && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-line px-3 py-2.5">
            <FileSpreadsheet size={18} className="text-accent" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{localName ?? meta.fileName ?? '파일'}</p>
              <p className="text-xs text-muted">
                {uploading
                  ? '파일 구조 검증 · 컬럼 매핑 · 중복/누락/타입 검사 중…'
                  : pending
                    ? pending.uploadResult.blocked
                      ? '오류로 업로드 차단됨'
                      : pending.uploadResult.warn > 0
                        ? '경고 DATA 확인 후 저장하세요'
                        : '검증 완료'
                    : hasUploadedData
                      ? `업로드 완료 · 분석 레코드 ${analytics.summary.recordCount.toLocaleString()}건 반영`
                      : '대기 중'}
              </p>
            </div>
            {!uploading && hasUploadedData && !pending && <CheckCircle2 size={18} className="text-ok" />}
            {!uploading && pending?.uploadResult.blocked && (
              <AlertTriangle size={18} className="text-danger" />
            )}
          </div>
        )}

        {uploadError && (
          <p className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-danger">
            {uploadError}
          </p>
        )}

        {pending && (
          <div className="mt-4 flex flex-wrap gap-2">
            {!pending.uploadResult.blocked && pending.uploadResult.warn > 0 && (
              <button
                type="button"
                onClick={confirmUpload}
                className="rounded-lg bg-ink px-4 py-2 text-sm text-white"
              >
                경고 확인 후 업로드
              </button>
            )}
            {pending.uploadResult.blocked && (
              <button
                type="button"
                onClick={confirmExcludeErrors}
                className="rounded-lg bg-ink px-4 py-2 text-sm text-white"
              >
                오류 행 제외하고 반영
              </button>
            )}
            <button
              type="button"
              onClick={discardPending}
              className="rounded-lg border border-line px-4 py-2 text-sm hover:bg-canvas"
            >
              취소
            </button>
          </div>
        )}
      </Panel>

      {result && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['정상', counts.ok, 'text-ok'],
              ['경고', counts.warn, 'text-warn'],
              ['오류', counts.error, 'text-danger'],
              ['분석 제외 (#N/A)', counts.excluded, 'text-muted'],
            ].map(([label, value, color]) => (
              <div key={String(label)} className="rounded-xl border border-line bg-surface px-4 py-3">
                <p className="text-xs text-muted">{label}</p>
                <p className={`num mt-1 text-xl font-semibold ${color}`}>
                  {Number(value).toLocaleString()}건
                </p>
              </div>
            ))}
          </div>

          <Panel title={`데이터 품질 검사 결과 · Score ${result.score}%`} description="문제 데이터 건수">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {result.qualityChecks.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-line px-3 py-2.5 text-sm"
                >
                  <span>{item.label}</span>
                  <span className={`num font-medium ${item.count > 0 ? 'text-danger' : 'text-ok'}`}>
                    {item.count}건
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          {!pending && hasUploadedData && (
            <Panel
              title="분석 반영 완료"
              description="업로드한 엑셀 기준으로 KPI · 차트 · 상세 분석이 재계산되었습니다. #N/A는 분석에서 제외됩니다."
              actions={
                <Link to="/" className="text-sm font-medium text-accent hover:underline">
                  Dashboard 보기
                </Link>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 text-sm">
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs text-muted">분석 건수</p>
                  <p className="num mt-1 font-semibold">
                    {analytics.summary.recordCount.toLocaleString()}건
                  </p>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs text-muted">검수량</p>
                  <p className="num mt-1 font-semibold">
                    {analytics.summary.totalQty.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs text-muted">부적합률</p>
                  <p className="num mt-1 font-semibold">{formatPpm(analytics.summary.failRate)}</p>
                </div>
                <div className="rounded-lg border border-line px-3 py-2">
                  <p className="text-xs text-muted">분석 제외</p>
                  <p className="num mt-1 font-semibold">
                    {analytics.summary.excludedCount.toLocaleString()}건
                  </p>
                </div>
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  )
}
