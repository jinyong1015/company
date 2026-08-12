import type { InspectionRecord } from '../types'

export type AnalysisGroupId = 'all' | 'seal' | 'hydraulic' | 'plant2'

export const ANALYSIS_GROUPS: { id: AnalysisGroupId; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'seal', label: '본사(SEAL)' },
  { id: 'hydraulic', label: '본사(유압+그로멧)' },
  { id: 'plant2', label: '2공장' },
]

export function isAnalyzable(record: InspectionRecord) {
  return record.rowClass !== 'excluded' && record.rowClass !== 'error'
}

function isHq(team: string) {
  return team.includes('본사')
}

function isPlant2(team: string) {
  return team.includes('2공장')
}

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
