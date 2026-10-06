import { useLocation } from 'react-router-dom'
import { useData } from '../context/DataContext'
import { useVinaData } from '../context/VinaDataContext'
import type { Analytics, InspectionRecord } from '../types'

export type DetailDataSource = 'main' | 'vina'

/** `/vina/...` 상세면 VINA, 그 외는 기존 검사 데이터 */
export function useDetailDataSource(): DetailDataSource {
  const { pathname } = useLocation()
  if (pathname === '/vina' || pathname.startsWith('/vina/')) return 'vina'
  return 'main'
}

/**
 * 품번/검사자 상세 공통 데이터 소스.
 * UI는 동일하고 records·analytics만 분리한다.
 */
export function useDetailInspectionData(): {
  source: DetailDataSource
  analytics: Analytics
  records: InspectionRecord[]
  ignoreAnalysisGroup: boolean
} {
  const source = useDetailDataSource()
  const main = useData()
  const vina = useVinaData()

  if (source === 'vina') {
    return {
      source,
      analytics: vina.analytics,
      records: vina.records,
      ignoreAnalysisGroup: true,
    }
  }

  return {
    source,
    analytics: main.analytics,
    records: main.records,
    ignoreAnalysisGroup: false,
  }
}
