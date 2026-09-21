import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { analyzeRecords, emptyAnalytics } from '../lib/analyze'
import { normalizeProductType } from '../lib/groups'
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
const SEED_VERSION_KEY = 'inspection-analytics-seed-version'
/** 시드 가데이터 갱신 시 올리고, source=seed 사용자만 자동 교체 */
const SEED_VERSION = '2026-09-21-grommet-v1'
const DATA_SYNC_CHANNEL = 'inspection-analytics-data-sync'

interface DataMeta {
  fileName: string | null
  lastUpdated: string
  source: 'seed' | 'upload'
  uploadResult: UploadResult | null
  /** localStorage 용량 부족으로 디스크 저장이 생략된 경우 */
  storageLimited?: boolean
}

type DataSyncMessage =
  | { type: 'request-current-data' }
  | { type: 'sync-current-data'; records: InspectionRecord[]; meta: DataMeta }

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
  updateRecord: (next: InspectionRecord) => void
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
    // 대용량 엑셀은 브라우저 저장 한도를 넘을 수 있음.
    // 기존 저장본을 지우지 않고 메모리 데이터는 유지한다.
    try {
      localStorage.setItem(
        META_KEY,
        JSON.stringify({ ...meta, storageLimited: true }),
      )
    } catch {
      // ignore
    }
  }
}

function readSeedVersion(): string | null {
  try {
    return localStorage.getItem(SEED_VERSION_KEY)
  } catch {
    return null
  }
}

function writeSeedVersion() {
  try {
    localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION)
  } catch {
    // ignore
  }
}

function createSeedMeta(): DataMeta {
  return {
    fileName: null,
    lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
    source: 'seed',
    uploadResult: null,
  }
}

function withNormalizedProductTypes(
  records: InspectionRecord[],
): InspectionRecord[] {
  return records.map((r) => ({
    ...r,
    productType: normalizeProductType(r.productType) || r.productType,
  }))
}

function getInitialData(): { records: InspectionRecord[]; meta: DataMeta } {
  const stored = loadStoredRecords()
  const meta = loadMeta()

  // 저장본 없음 → 시드 가데이터
  if (!stored || stored.length === 0) {
    const nextMeta = createSeedMeta()
    const records = withNormalizedProductTypes(seedRecords)
    persist(records, nextMeta)
    writeSeedVersion()
    return { records, meta: nextMeta }
  }

  // 시드 사용 중이고 시드 버전이 바뀌면 최신 가데이터로 교체 (업로드본은 유지)
  if (meta.source === 'seed' && readSeedVersion() !== SEED_VERSION) {
    const nextMeta = createSeedMeta()
    const records = withNormalizedProductTypes(seedRecords)
    persist(records, nextMeta)
    writeSeedVersion()
    return { records, meta: nextMeta }
  }

  return { records: withNormalizedProductTypes(stored), meta }
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { filters, resetFilters } = useFilters()
  const [initial] = useState(getInitialData)
  const [records, setRecords] = useState<InspectionRecord[]>(() => initial.records)
  const [meta, setMeta] = useState<DataMeta>(() => initial.meta)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingUpload | null>(null)
  const recordsRef = useRef(records)
  const metaRef = useRef(meta)
  recordsRef.current = records
  metaRef.current = meta

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return

    const isPopup = window.location.pathname.includes('/ai-chatbot-popup')
    const channel = new BroadcastChannel(DATA_SYNC_CHANNEL)

    channel.onmessage = (event: MessageEvent<DataSyncMessage>) => {
      const message = event.data
      if (message.type === 'request-current-data' && !isPopup) {
        channel.postMessage({
          type: 'sync-current-data',
          records: recordsRef.current,
          meta: metaRef.current,
        } satisfies DataSyncMessage)
        return
      }

      if (
        message.type === 'sync-current-data' &&
        isPopup &&
        Array.isArray(message.records)
      ) {
        setRecords(message.records)
        setMeta(message.meta)
      }
    }

    if (isPopup) {
      channel.postMessage({ type: 'request-current-data' } satisfies DataSyncMessage)
    }

    return () => channel.close()
  }, [])

  useEffect(() => {
    if (
      typeof BroadcastChannel === 'undefined' ||
      window.location.pathname.includes('/ai-chatbot-popup')
    ) {
      return
    }

    const channel = new BroadcastChannel(DATA_SYNC_CHANNEL)
    channel.postMessage({
      type: 'sync-current-data',
      records,
      meta,
    } satisfies DataSyncMessage)
    channel.close()
  }, [records, meta])

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
    resetFilters()
  }, [resetFilters])

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
          `오류 DATA ${uploadResult.error.toLocaleString()}건이 있습니다. 전체 행을 저장하면 정상·경고는 검사 DATA, 오류는 오류 DATA에서 확인할 수 있으며 분석에서는 오류가 제외됩니다.`,
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
    // 엑셀 전체 행을 저장. 오류 행은 분석(isAnalyzable)에서만 제외되고 검사/오류 DATA에 남는다.
    commitRecords(pending.records, pending.fileName, {
      ...pending.uploadResult,
      blocked: false,
    })
  }, [pending, commitRecords])

  const discardPending = useCallback(() => {
    setPending(null)
    setUploadError(null)
  }, [])

  const resetToSeed = useCallback(() => {
    const nextMeta = createSeedMeta()
    const records = withNormalizedProductTypes(seedRecords)
    setRecords(records)
    setMeta(nextMeta)
    persist(records, nextMeta)
    writeSeedVersion()
    setUploadError(null)
    setPending(null)
    resetFilters()
  }, [resetFilters])

  const updateRecord = useCallback((next: InspectionRecord) => {
    setRecords((prev) => {
      const updated = prev.map((r) => (r.id === next.id ? next : r))
      setMeta((prevMeta) => {
        const nextMeta: DataMeta = {
          ...prevMeta,
          lastUpdated: new Date().toISOString().slice(0, 16).replace('T', ' '),
        }
        persist(updated, nextMeta)
        return nextMeta
      })
      return updated
    })
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
      updateRecord,
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
      updateRecord,
    ],
  )

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
