import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { periodPresets } from '../data/seedData'
import type { AnalysisGroupId } from '../lib/groups'

export type PeriodId = (typeof periodPresets)[number]['id']

export interface FilterState {
  analysisGroup: AnalysisGroupId
  period: PeriodId
  startDate: string
  endDate: string
  teams: string[]
  inspectors: string[]
  workTypes: string[]
  productTypes: string[]
  products: string[]
  molds: string[]
  equipment: string[]
  workers: string[]
  lots: string[]
}

interface FilterContextValue {
  filters: FilterState
  setAnalysisGroup: (group: AnalysisGroupId) => void
  setPeriod: (period: PeriodId) => void
  setDateRange: (start: string, end: string) => void
  toggleMulti: (key: MultiKey, value: string) => void
  clearFilters: () => void
  activeFilterCount: number
}

export type MultiKey =
  | 'teams'
  | 'inspectors'
  | 'workTypes'
  | 'productTypes'
  | 'products'
  | 'molds'
  | 'equipment'
  | 'workers'
  | 'lots'

const initial: FilterState = {
  analysisGroup: 'all',
  period: 'thisMonth',
  startDate: '2026-08-01',
  endDate: '2026-08-11',
  teams: [],
  inspectors: [],
  workTypes: [],
  productTypes: [],
  products: [],
  molds: [],
  equipment: [],
  workers: [],
  lots: [],
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(initial)

  const value = useMemo<FilterContextValue>(() => {
    const multiKeys: MultiKey[] = [
      'teams',
      'inspectors',
      'workTypes',
      'productTypes',
      'products',
      'molds',
      'equipment',
      'workers',
      'lots',
    ]

    return {
      filters,
      setAnalysisGroup: (analysisGroup) =>
        setFilters((prev) => ({ ...prev, analysisGroup })),
      setPeriod: (period) => setFilters((prev) => ({ ...prev, period })),
      setDateRange: (startDate, endDate) =>
        setFilters((prev) => ({ ...prev, startDate, endDate })),
      toggleMulti: (key, value) =>
        setFilters((prev) => {
          const list = prev[key]
          const next = list.includes(value)
            ? list.filter((v) => v !== value)
            : [...list, value]
          return { ...prev, [key]: next }
        }),
      clearFilters: () => setFilters({ ...initial, analysisGroup: filters.analysisGroup }),
      activeFilterCount: multiKeys.reduce((sum, key) => sum + filters[key].length, 0),
    }
  }, [filters])

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}
