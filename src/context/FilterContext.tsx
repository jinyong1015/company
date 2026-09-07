import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { periodPresets } from '../data/seedData'
import type { AnalysisGroupId } from '../lib/groups'
import { clearAllPageViewState } from '../lib/pageViewState'

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
  setCustomDateRange: (start: string, end: string) => void
  toggleMulti: (key: MultiKey, value: string) => void
  clearFilters: () => void
  /** 데이터 재조회·초기화 시 조회기준 전체 초기화 */
  resetFilters: () => void
  replaceFilters: (next: FilterState) => void
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

const FILTER_STORAGE_KEY = 'inspection-analytics-filters'

const PERIOD_IDS = new Set(periodPresets.map((p) => p.id))

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

function isAnalysisGroupId(value: unknown): value is AnalysisGroupId {
  return value === 'all' || value === 'seal' || value === 'hydraulic' || value === 'plant2'
}

function isPeriodId(value: unknown): value is PeriodId {
  return typeof value === 'string' && PERIOD_IDS.has(value as PeriodId)
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function cloneFilterState(state: FilterState): FilterState {
  return {
    analysisGroup: state.analysisGroup,
    period: state.period,
    startDate: state.startDate,
    endDate: state.endDate,
    teams: [...state.teams],
    inspectors: [...state.inspectors],
    workTypes: [...state.workTypes],
    productTypes: [...state.productTypes],
    products: [...state.products],
    molds: [...state.molds],
    equipment: [...state.equipment],
    workers: [...state.workers],
    lots: [...state.lots],
  }
}

function parseStoredFilters(raw: string): FilterState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<FilterState>
    if (!parsed || typeof parsed !== 'object') return null
    if (!isAnalysisGroupId(parsed.analysisGroup) || !isPeriodId(parsed.period)) return null
    if (typeof parsed.startDate !== 'string' || typeof parsed.endDate !== 'string') return null

    return {
      analysisGroup: parsed.analysisGroup,
      period: parsed.period,
      startDate: parsed.startDate,
      endDate: parsed.endDate,
      teams: asStringArray(parsed.teams),
      inspectors: asStringArray(parsed.inspectors),
      workTypes: asStringArray(parsed.workTypes),
      productTypes: asStringArray(parsed.productTypes),
      products: asStringArray(parsed.products),
      molds: asStringArray(parsed.molds),
      equipment: asStringArray(parsed.equipment),
      workers: asStringArray(parsed.workers),
      lots: asStringArray(parsed.lots),
    }
  } catch {
    return null
  }
}

function loadStoredFilters(): FilterState | null {
  try {
    const raw = sessionStorage.getItem(FILTER_STORAGE_KEY)
    if (!raw) return null
    return parseStoredFilters(raw)
  } catch {
    return null
  }
}

function persistFilters(filters: FilterState) {
  try {
    sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters))
  } catch {
    // sessionStorage 용량/접근 실패 시 무시 (메모리 상태는 유지)
  }
}

function clearStoredFilters() {
  try {
    sessionStorage.removeItem(FILTER_STORAGE_KEY)
  } catch {
    // ignore
  }
}

const FilterContext = createContext<FilterContextValue | null>(null)

export function FilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<FilterState>(() => loadStoredFilters() ?? cloneFilterState(initial))

  useEffect(() => {
    persistFilters(filters)
  }, [filters])

  const setAnalysisGroup = useCallback((analysisGroup: AnalysisGroupId) => {
    setFilters((prev) => ({ ...prev, analysisGroup }))
  }, [])

  const setPeriod = useCallback((period: PeriodId) => {
    setFilters((prev) => ({ ...prev, period }))
  }, [])

  const setDateRange = useCallback((startDate: string, endDate: string) => {
    setFilters((prev) => ({ ...prev, startDate, endDate }))
  }, [])

  const setCustomDateRange = useCallback((startDate: string, endDate: string) => {
    setFilters((prev) => {
      if (
        prev.period === 'custom' &&
        prev.startDate === startDate &&
        prev.endDate === endDate
      ) {
        return prev
      }
      return {
        ...prev,
        period: 'custom',
        startDate,
        endDate,
      }
    })
  }, [])

  const toggleMulti = useCallback((key: MultiKey, value: string) => {
    setFilters((prev) => {
      const list = prev[key]
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value]
      return { ...prev, [key]: next }
    })
  }, [])

  const clearFilters = useCallback(() => {
    setFilters((prev) => ({ ...cloneFilterState(initial), analysisGroup: prev.analysisGroup }))
  }, [])

  const resetFilters = useCallback(() => {
    clearStoredFilters()
    clearAllPageViewState()
    setFilters(cloneFilterState(initial))
  }, [])

  const replaceFilters = useCallback((next: FilterState) => {
    setFilters(cloneFilterState(next))
  }, [])

  const value = useMemo<FilterContextValue>(() => {
    return {
      filters,
      setAnalysisGroup,
      setPeriod,
      setDateRange,
      setCustomDateRange,
      toggleMulti,
      clearFilters,
      resetFilters,
      replaceFilters,
      activeFilterCount: multiKeys.reduce((sum, key) => sum + filters[key].length, 0),
    }
  }, [
    filters,
    setAnalysisGroup,
    setPeriod,
    setDateRange,
    setCustomDateRange,
    toggleMulti,
    clearFilters,
    resetFilters,
    replaceFilters,
  ])

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>
}

export function useFilters() {
  const ctx = useContext(FilterContext)
  if (!ctx) throw new Error('useFilters must be used within FilterProvider')
  return ctx
}
