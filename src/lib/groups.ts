import type { InspectionRecord } from '../types'

export type AnalysisGroupId = 'all' | 'seal' | 'hydraulic' | 'plant2'

export const ANALYSIS_GROUPS: { id: AnalysisGroupId; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'seal', label: '본사(SEAL)' }, // 동의어: 1공장 SEAL
  { id: 'hydraulic', label: '본사(GROMMET)' }, // 동의어: 1공장 GROMMET, 유압+그로멧
  { id: 'plant2', label: '2공장' },
]

/** 대시보드·AI 질문 공통 그룹 막대 색 */
export const ANALYSIS_GROUP_BAR_COLORS: {
  id: Exclude<AnalysisGroupId, 'all'>
  color: string
}[] = [
  { id: 'seal', color: '#22c55e' },
  { id: 'hydraulic', color: '#38bdf8' },
  { id: 'plant2', color: '#a78bfa' },
]

export const ANALYSIS_GROUP_TOTAL_LINE_COLOR = '#f97316'

export function analysisGroupColor(id: string) {
  return ANALYSIS_GROUP_BAR_COLORS.find((c) => c.id === id)?.color ?? '#94a3b8'
}

export function isAnalyzable(record: InspectionRecord) {
  return record.rowClass !== 'excluded' && record.rowClass !== 'error'
}

/** Excel 소속 등 — 구지공장 → 2공장 */
export function normalizeTeam(team: string): string {
  const t = team.trim()
  if (!t) return ''
  if (t.includes('구지공장')) return '2공장'
  return t
}

function isHq(team: string) {
  return normalizeTeam(team).includes('본사')
}

function isPlant2(team: string) {
  return normalizeTeam(team).includes('2공장')
}

/** 검사자 TOP10 등 — 본사 / 2공장 구분 (그 외 소속은 null) */
export function plantSiteOf(team: string): '본사' | '2공장' | null {
  if (isPlant2(team)) return '2공장'
  if (isHq(team)) return '본사'
  return null
}

export const PLANT_SITE_TABS: { id: '' | '본사' | '2공장'; label: string }[] = [
  { id: '', label: '전체' },
  { id: '본사', label: '본사' },
  { id: '2공장', label: '2공장' },
]

function isSealType(type: string) {
  const t = type.toLowerCase()
  return t.includes('seal') || t.includes('실링') || t.includes('씰')
}

function isHydraulicType(type: string) {
  return type.includes('유압') || type.includes('그로멧') || type.toLowerCase().includes('grommet')
}

export function matchesAnalysisGroup(record: InspectionRecord, group: AnalysisGroupId) {
  if (group === 'all') return true
  if (group === 'plant2') return isPlant2(record.team)
  if (group === 'seal') return isHq(record.team) && isSealType(record.productType)
  if (group === 'hydraulic') return isHq(record.team) && isHydraulicType(record.productType)
  return true
}

export function groupLabel(id: AnalysisGroupId) {
  return ANALYSIS_GROUPS.find((g) => g.id === id)?.label ?? '전체'
}
