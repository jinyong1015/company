import { useEffect, useState } from 'react'
import { useData } from '../context/DataContext'
import type { InspectionRecord } from '../types'
import { loadWeeklySnapshotDetailRecords } from '../lib/weeklySnapshotDetailCache'

export type SnapshotRecordsStatus =
  | 'live'
  | 'loading'
  | 'ready'
  | 'missing'
  | 'error'

/**
 * snapshotId가 있으면 스냅샷에 저장된 원본 행을 쓰고,
 * 없으면 현재 업로드 DATA를 쓴다.
 */
export function useWeeklySnapshotSourceRecords(snapshotId: string | null) {
  const { records: liveRecords } = useData()
  const [snapRecords, setSnapRecords] = useState<InspectionRecord[] | null>(
    null,
  )
  const [status, setStatus] = useState<SnapshotRecordsStatus>(
    snapshotId ? 'loading' : 'live',
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!snapshotId) {
      setSnapRecords(null)
      setStatus('live')
      setError(null)
      return
    }

    let cancelled = false
    setStatus('loading')
    setError(null)

    void loadWeeklySnapshotDetailRecords(snapshotId).then((result) => {
      if (cancelled) return
      if (!result.ok) {
        setSnapRecords([])
        setStatus('error')
        setError(result.error ?? '스냅샷 DATA를 불러오지 못했습니다.')
        return
      }
      setSnapRecords(result.records)
      setStatus(result.missingDetail ? 'missing' : 'ready')
    })

    return () => {
      cancelled = true
    }
  }, [snapshotId])

  const usingSnapshot = Boolean(snapshotId)

  return {
    records: usingSnapshot ? (snapRecords ?? []) : liveRecords,
    usingSnapshot,
    status,
    error,
    ready: !usingSnapshot || status === 'ready' || status === 'missing',
  }
}
