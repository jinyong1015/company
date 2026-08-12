import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { analyzeRecords, emptyAnalytics } from '../lib/analyze'
import { parseInspectionExcel } from '../lib/excel'
import { seedRecords } from '../data/seedData'
import type { Analytics, InspectionRecord, UploadResult } from '../types'
import { useFilters } from './FilterContext'

export interface PendingUpload {
  fileName: string
  records: InspectionRecord[]
  uploadResult: UploadResult
}

const STORAGE_KEY = 'inspection-analytics-records'
const META_KEY = 'inspection-analytics-meta'

interface DataMeta {
  fileName: string | null
  lastUpdated: string
  source: 'seed' | 'upload'
  uploadResult: UploadResult | null
}

interface DataContextValue {
  records: InspectionRecord[]
  analytics: Analytics
  meta: DataMeta
  hasUploadedData: boolean
  uploading: boolean
  uploadError: string | null
  pending: PendingUpload | null
  uploadExcel: (file: File) => Promise<void>
  confirmUpload: () => void
  confirmExcludeErrors: () => void
  discardPending: () => void
  resetToSeed: () => void
}

const DataContext = createContext<DataContextValue | null>(null)

function loadStoredRecords(): InspectionRecord[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as InspectionRecord[]
    if (!Array.isArray(parsed)) return null
    return parsed.map((r) => {
      const defects =
        r.defects && Object.keys(r.defects).length > 0
          ? r.defects
          : r.fail > 0
            ? { [r.mainDefect || '기타']: r.fail }
            : {}
      return {
        ...r,
        defects,
        rowClass: r.rowClass ?? 'ok',
        issues: r.issues ?? [],
      }
    })
  } catch {
    return null
  }
}

function loadMeta(): DataMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) {
      return {
        fileName: null,
        lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
        source: 'seed',
        uploadResult: null,
      }
    }
    return JSON.parse(raw) as DataMeta
  } catch {
    return {
      fileName: null,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
      source: 'seed',
      uploadResult: null,
    }
  }
}

function persist(records: InspectionRecord[], meta: DataMeta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta))
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    try {
      localStorage.setItem(META_KEY, JSON.stringify(meta))
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 대용량 엑셀은 브라우저 저장 용량을 초과할 수 있음. 메모리에는 유지.
    }
  }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { filters } = useFilters()
  const [records, setRecords] = useState<InspectionRecord[]>(() => loadStoredRecords() ?? seedRecords)
  const [meta, setMeta] = useState<DataMeta>(() => {
    const stored = loadStoredRecords()
    return stored ? loadMeta() : {
      fileName: null,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
      source: 'seed',
      uploadResult: null,
    }
  })
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingUpload | null>(null)

  const analytics = useMemo(() => {
    if (!records.length) return emptyAnalytics()
    return analyzeRecords(records, filters)
  }, [records, filters])

  const commitRecords = useCallback((parsed: InspectionRecord[], fileName: string, uploadResult: UploadResult) => {
    const nextMeta: DataMeta = {
      fileName,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
      source: 'upload',
      uploadResult,
    }
    setRecords(parsed)
    setMeta(nextMeta)
    persist(parsed, nextMeta)
    setPending(null)
    setUploadError(null)
  }, [])

  const uploadExcel = useCallback(async (file: File) => {
    setUploading(true)
    setUploadError(null)
    try {
      const { records: parsed, uploadResult } = await parseInspectionExcel(file)
      if (!parsed.length) {
        throw new Error('유효한 검사 데이터가 없습니다.')
      }

      const nextPending: PendingUpload = {
        fileName: file.name,
        records: parsed,
        uploadResult,
      }
      setPending(nextPending)

      if (uploadResult.blocked) {
        setUploadError(
          `오류 DATA ${uploadResult.error.toLocaleString()}건이 있어 업로드가 차단되었습니다. 원본을 수정하거나 오류 행을 제외하고 반영하세요.`,
        )
        return
      }

      if (uploadResult.warn > 0) {
        setUploadError(null)
        return
      }

      commitRecords(parsed, file.name, uploadResult)
    } catch (error) {
      const message = error instanceof Error ? error.message : '업로드에 실패했습니다.'
      setUploadError(message)
      setPending(null)
      throw error
    } finally {
      setUploading(false)
    }
  }, [commitRecords])

  const confirmUpload = useCallback(() => {
    if (!pending || pending.uploadResult.blocked) return
    commitRecords(pending.records, pending.fileName, pending.uploadResult)
  }, [pending, commitRecords])

  const confirmExcludeErrors = useCallback(() => {
    if (!pending) return
    const kept = pending.records.filter((r) => r.rowClass !== 'error')
    if (!kept.length) {
      setUploadError('오류를 제외하면 반영할 데이터가 없습니다.')
      return
    }
    const uploadResult: UploadResult = {
      ...pending.uploadResult,
      total: kept.length,
      error: 0,
      blocked: false,
      valid: kept.filter((r) => r.rowClass === 'ok').length,
      warn: kept.filter((r) => r.rowClass === 'warn').length,
      excluded: kept.filter((r) => r.rowClass === 'excluded').length,
    }
    commitRecords(kept, pending.fileName, uploadResult)
  }, [pending, commitRecords])

  const discardPending = useCallback(() => {
    setPending(null)
    setUploadError(null)
  }, [])

  const resetToSeed = useCallback(() => {
    const nextMeta: DataMeta = {
      fileName: null,
      lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
      source: 'seed',
      uploadResult: null,
    }
    setRecords(seedRecords)
    setMeta(nextMeta)
    persist(seedRecords, nextMeta)
    setUploadError(null)
    setPending(null)
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({
      records,
      analytics,
      meta,
      hasUploadedData: meta.source === 'upload',
      uploading,
      uploadError,
      pending,
      uploadExcel,
      confirmUpload,
      confirmExcludeErrors,
      discardPending,
      resetToSeed,
    }),
    [
      records,
      analytics,
      meta,
      uploading,
      uploadError,
      pending,
      uploadExcel,
      confirmUpload,
      confirmExcludeErrors,
      discardPending,
      resetToSeed,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
