import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useLocation } from 'react-router-dom'
import { analyzeRecords, emptyAnalytics } from '../lib/analyze'
import { parseVinaExcel } from '../lib/vinaExcel'
import {
  clearVinaRecords,
  loadVinaMeta,
  loadVinaRecords,
  saveVinaMeta,
  saveVinaRecords,
  type VinaDataMeta,
} from '../lib/vinaStorage'
import type { Analytics, InspectionRecord, UploadResult } from '../types'
import {
  reconcileVinaMappedItems,
  syncVinaUploadResultItemUnmapped,
  vinaRecordsNeedItemReconcile,
  VINA_ITEM_MAP_REVISION,
} from '../lib/vinaItemNormalize'
import { useFilters, type FilterState } from './FilterContext'

/**
 * VINA 전용 데이터 영역.
 * - 대용량 records: IndexedDB (새로고침 유지)
 * - meta: localStorage
 * - /vina* 진입 시에만 로드·집계
 * - 품번 변환 규칙이 추가되면 저장된 데이터에도 즉시 재적용
 */

export interface VinaPendingUpload {
  fileName: string
  records: InspectionRecord[]
  uploadResult: UploadResult
}

interface VinaDataContextValue {
  records: InspectionRecord[]
  analytics: Analytics
  meta: VinaDataMeta
  hasUploadedData: boolean
  loading: boolean
  uploading: boolean
  uploadError: string | null
  pending: VinaPendingUpload | null
  uploadExcel: (file: File) => Promise<void>
  confirmUpload: () => void
  confirmExcludeErrors: () => void
  discardPending: () => void
  clearVinaData: () => void
  updateRecord: (next: InspectionRecord) => void
}

const VinaDataContext = createContext<VinaDataContextValue | null>(null)

function nowStamp() {
  return new Date().toISOString().slice(0, 16).replace('T', ' ')
}

function vinaFilters(filters: FilterState): FilterState {
  return { ...filters, analysisGroup: 'all' }
}

function isVinaPath(pathname: string) {
  return pathname === '/vina' || pathname.startsWith('/vina/')
}

export function VinaDataProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const onVinaRoute = isVinaPath(pathname)
  const { filters } = useFilters()

  const [meta, setMeta] = useState<VinaDataMeta>(() => loadVinaMeta())
  /** IndexedDB에서 읽은 원본(규칙 재적용 전) */
  const [rawRecords, setRawRecords] = useState<InspectionRecord[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [pending, setPending] = useState<VinaPendingUpload | null>(null)
  const persistGen = useRef(0)

  // 최신 변환 규칙으로 항상 재적용 (규칙 추가 시 MAP_REVISION 변경 → 재계산)
  const records = useMemo(
    () => reconcileVinaMappedItems(rawRecords),
    [rawRecords, VINA_ITEM_MAP_REVISION],
  )

  const displayMeta = useMemo<VinaDataMeta>(() => {
    const synced = syncVinaUploadResultItemUnmapped(meta.uploadResult, records)
    if (!synced || synced === meta.uploadResult) return meta
    return { ...meta, uploadResult: synced }
  }, [meta, records])

  useEffect(() => {
    if (!onVinaRoute || hydrated) return
    let cancelled = false
    void (async () => {
      try {
        const loaded = await loadVinaRecords()
        if (cancelled) return
        startTransition(() => {
          setRawRecords(loaded)
          setHydrated(true)
          if (loaded.length === 0 && loadVinaMeta().storageLimited) {
            setUploadError(
              '이전에 브라우저 저장 용량 부족으로 VINA 데이터가 유실되었을 수 있습니다. 다시 업로드해 주세요.',
            )
          }
        })
      } catch {
        if (cancelled) return
        setHydrated(true)
        setUploadError('VINA 저장 데이터를 불러오지 못했습니다. 다시 업로드해 주세요.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [onVinaRoute, hydrated])

  // 규칙 반영으로 바뀐 내용을 IndexedDB·meta에 저장 (새로고침 후에도 경고 제거 유지)
  useEffect(() => {
    if (!hydrated || !onVinaRoute) return
    const needsRecords = vinaRecordsNeedItemReconcile(rawRecords, records)
    const synced = syncVinaUploadResultItemUnmapped(meta.uploadResult, records)
    const hadUnmappedCheck = (meta.uploadResult?.qualityChecks ?? []).some(
      (c) =>
        c.label === '품번 변환 확인 필요' ||
        c.label.replace(/\s+/g, '') === '품번변환확인필요',
    )
    const needsMeta =
      Boolean(synced) &&
      (hadUnmappedCheck ||
        synced!.warn !== meta.uploadResult?.warn ||
        synced!.valid !== meta.uploadResult?.valid)

    if (!needsRecords && !needsMeta) return

    const nextMeta: VinaDataMeta = {
      ...meta,
      lastUpdated: needsRecords ? nowStamp() : meta.lastUpdated,
      uploadResult: synced ?? meta.uploadResult,
    }
    const gen = ++persistGen.current
    if (needsRecords) {
      setRawRecords(records)
      setMeta(nextMeta)
      void saveVinaRecords(records, nextMeta).then(() => {
        if (gen !== persistGen.current) return
      })
    } else {
      setMeta(nextMeta)
      try {
        saveVinaMeta(nextMeta)
      } catch {
        // ignore
      }
    }
  }, [
    hydrated,
    onVinaRoute,
    rawRecords,
    records,
    meta,
    VINA_ITEM_MAP_REVISION,
  ])

  const analytics = useMemo(() => {
    if (!onVinaRoute || !records.length) return emptyAnalytics()
    return analyzeRecords(records, vinaFilters(filters))
  }, [onVinaRoute, records, filters])

  const commitRecords = useCallback(
    async (
      parsed: InspectionRecord[],
      fileName: string,
      uploadResult: UploadResult,
    ) => {
      const reconciled = reconcileVinaMappedItems(parsed)
      const syncedResult =
        syncVinaUploadResultItemUnmapped(uploadResult, reconciled) ??
        uploadResult
      const nextMeta: VinaDataMeta = {
        fileName,
        lastUpdated: nowStamp(),
        source: 'upload',
        uploadResult: syncedResult,
      }

      const saved = await saveVinaRecords(reconciled, nextMeta)
      startTransition(() => {
        setRawRecords(reconciled)
        setMeta(
          saved.storageLimited
            ? { ...nextMeta, storageLimited: true }
            : nextMeta,
        )
        setHydrated(true)
        setPending(null)
        if (!saved.ok) {
          setUploadError(
            `화면에는 반영되었지만 브라우저 저장에 실패했습니다. 새로고침 시 데이터가 사라질 수 있습니다. (${saved.error ?? '저장 실패'})`,
          )
        } else {
          setUploadError(null)
        }
      })
    },
    [],
  )

  const uploadExcel = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadError(null)
      try {
        const { records: parsed, uploadResult } = await parseVinaExcel(file)
        if (!parsed.length) {
          throw new Error('유효한 VINA 데이터가 없습니다.')
        }

        const reconciled = reconcileVinaMappedItems(parsed)
        const syncedResult =
          syncVinaUploadResultItemUnmapped(uploadResult, reconciled) ??
          uploadResult

        const nextPending: VinaPendingUpload = {
          fileName: file.name,
          records: reconciled,
          uploadResult: syncedResult,
        }
        setPending(nextPending)
        setHydrated(true)

        if (syncedResult.blocked) {
          setUploadError(
            `오류 DATA ${syncedResult.error.toLocaleString()}건이 있습니다. 전체 저장 시 오류 행은 분석에서 제외됩니다.`,
          )
          return
        }

        if (syncedResult.warn > 0) {
          setUploadError(null)
          return
        }

        await commitRecords(reconciled, file.name, syncedResult)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'VINA 업로드에 실패했습니다.'
        setUploadError(message)
        setPending(null)
        throw error
      } finally {
        setUploading(false)
      }
    },
    [commitRecords],
  )

  const confirmUpload = useCallback(() => {
    if (!pending || pending.uploadResult.blocked) return
    void commitRecords(pending.records, pending.fileName, pending.uploadResult)
  }, [pending, commitRecords])

  const confirmExcludeErrors = useCallback(() => {
    if (!pending) return
    void commitRecords(pending.records, pending.fileName, {
      ...pending.uploadResult,
      blocked: false,
    })
  }, [pending, commitRecords])

  const discardPending = useCallback(() => {
    setPending(null)
    setUploadError(null)
  }, [])

  const clearVinaData = useCallback(() => {
    const nextMeta: VinaDataMeta = {
      fileName: null,
      lastUpdated: nowStamp(),
      source: 'empty',
      uploadResult: null,
    }
    setRawRecords([])
    setMeta(nextMeta)
    setHydrated(true)
    setPending(null)
    setUploadError(null)
    try {
      saveVinaMeta(nextMeta)
    } catch {
      // ignore
    }
    void clearVinaRecords()
  }, [])

  const updateRecord = useCallback((next: InspectionRecord) => {
    setRawRecords((prev) => {
      const updated = prev.map((r) => (r.id === next.id ? next : r))
      setMeta((prevMeta) => {
        const nextMeta: VinaDataMeta = {
          ...prevMeta,
          lastUpdated: nowStamp(),
        }
        void saveVinaRecords(updated, nextMeta)
        return nextMeta
      })
      return updated
    })
  }, [])

  // pending 미리보기도 최신 규칙 반영
  const displayPending = useMemo(() => {
    if (!pending) return null
    const reconciled = reconcileVinaMappedItems(pending.records)
    const synced =
      syncVinaUploadResultItemUnmapped(pending.uploadResult, reconciled) ??
      pending.uploadResult
    return {
      ...pending,
      records: reconciled,
      uploadResult: synced,
    }
  }, [pending, VINA_ITEM_MAP_REVISION])

  const value = useMemo<VinaDataContextValue>(
    () => ({
      records,
      analytics,
      meta: displayMeta,
      hasUploadedData:
        displayMeta.source === 'upload' &&
        (records.length > 0 ||
          (hydrated === false && Boolean(displayMeta.uploadResult?.total))),
      loading: onVinaRoute && !hydrated,
      uploading,
      uploadError,
      pending: displayPending,
      uploadExcel,
      confirmUpload,
      confirmExcludeErrors,
      discardPending,
      clearVinaData,
      updateRecord,
    }),
    [
      records,
      analytics,
      displayMeta,
      hydrated,
      onVinaRoute,
      uploading,
      uploadError,
      displayPending,
      uploadExcel,
      confirmUpload,
      confirmExcludeErrors,
      discardPending,
      clearVinaData,
      updateRecord,
    ],
  )

  return (
    <VinaDataContext.Provider value={value}>{children}</VinaDataContext.Provider>
  )
}

export function useVinaData() {
  const ctx = useContext(VinaDataContext)
  if (!ctx) throw new Error('useVinaData must be used within VinaDataProvider')
  return ctx
}
