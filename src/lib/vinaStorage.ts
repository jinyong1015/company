import type { InspectionRecord, UploadResult } from '../types'

/**
 * VINA 대용량 데이터 저장.
 * localStorage(~5MB)로는 수 만 건이 저장되지 않아 새로고침 시 유실되므로 IndexedDB를 사용한다.
 */

const DB_NAME = 'vina-analytics-db'
const DB_VERSION = 1
const STORE = 'payload'
const RECORD_KEY = 'records'
const LEGACY_LS_RECORDS = 'vina-analytics-records'
const META_KEY = 'vina-analytics-meta'

export interface VinaDataMeta {
  fileName: string | null
  lastUpdated: string
  source: 'empty' | 'upload'
  uploadResult: UploadResult | null
  storageLimited?: boolean
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB를 사용할 수 없습니다.'))
      return
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open 실패'))
  })
}

function normalizeRecords(parsed: InspectionRecord[]): InspectionRecord[] {
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
}

function idbGet<T>(key: string): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).get(key)
        req.onsuccess = () => resolve(req.result as T | undefined)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB get 실패'))
        tx.oncomplete = () => db.close()
      }),
  )
}

function idbPut(key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(value, key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB put 실패'))
        }
      }),
  )
}

function idbDelete(key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(key)
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('IndexedDB delete 실패'))
        }
      }),
  )
}

/** 구버전 localStorage → IndexedDB 이전 */
function migrateLegacyLocalStorage(): InspectionRecord[] | null {
  try {
    const raw = localStorage.getItem(LEGACY_LS_RECORDS)
    if (!raw) return null
    const parsed = JSON.parse(raw) as InspectionRecord[]
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return normalizeRecords(parsed)
  } catch {
    return null
  }
}

function clearLegacyLocalStorage() {
  try {
    localStorage.removeItem(LEGACY_LS_RECORDS)
  } catch {
    // ignore
  }
}

export function loadVinaMeta(): VinaDataMeta {
  try {
    const raw = localStorage.getItem(META_KEY)
    if (!raw) {
      return {
        fileName: null,
        lastUpdated: '',
        source: 'empty',
        uploadResult: null,
      }
    }
    return JSON.parse(raw) as VinaDataMeta
  } catch {
    return {
      fileName: null,
      lastUpdated: '',
      source: 'empty',
      uploadResult: null,
    }
  }
}

export function saveVinaMeta(meta: VinaDataMeta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta))
}

export async function loadVinaRecords(): Promise<InspectionRecord[]> {
  try {
    const fromIdb = await idbGet<InspectionRecord[]>(RECORD_KEY)
    if (Array.isArray(fromIdb) && fromIdb.length > 0) {
      return normalizeRecords(fromIdb)
    }
  } catch {
    // IndexedDB 실패 시 legacy 폴백
  }

  const legacy = migrateLegacyLocalStorage()
  if (legacy?.length) {
    try {
      await idbPut(RECORD_KEY, legacy)
      clearLegacyLocalStorage()
    } catch {
      // IDB 저장 실패해도 이번 세션은 legacy로 사용
    }
    return legacy
  }

  return []
}

export async function saveVinaRecords(
  records: InspectionRecord[],
  meta: VinaDataMeta,
): Promise<{ ok: boolean; storageLimited: boolean; error?: string }> {
  try {
    saveVinaMeta({ ...meta, storageLimited: false })
  } catch {
    // meta는 작아서 거의 실패하지 않음
  }

  try {
    await idbPut(RECORD_KEY, records)
    clearLegacyLocalStorage()
    return { ok: true, storageLimited: false }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'VINA 데이터 저장에 실패했습니다.'

    // 최후 수단: localStorage 시도 (소량일 때만 성공)
    try {
      localStorage.setItem(LEGACY_LS_RECORDS, JSON.stringify(records))
      saveVinaMeta({ ...meta, storageLimited: false })
      return { ok: true, storageLimited: false }
    } catch {
      try {
        saveVinaMeta({ ...meta, storageLimited: true })
      } catch {
        // ignore
      }
      return { ok: false, storageLimited: true, error: message }
    }
  }
}

export async function clearVinaRecords(): Promise<void> {
  try {
    await idbDelete(RECORD_KEY)
  } catch {
    // ignore
  }
  clearLegacyLocalStorage()
}
