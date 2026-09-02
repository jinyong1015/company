const STORAGE_KEY = 'weekly-report-production-period-labels'

export function productionPeriodLabelKey(startDate: string, endDate: string) {
  return `custom:${startDate}:${endDate}`
}

export function loadProductionPeriodLabel(key: string): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const all = JSON.parse(raw) as Record<string, string>
    const label = all[key]
    return typeof label === 'string' && label.trim() ? label.trim() : null
  } catch {
    return null
  }
}

export function saveProductionPeriodLabel(key: string, label: string) {
  try {
    const trimmed = label.trim()
    if (!trimmed) return
    const raw = localStorage.getItem(STORAGE_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    all[key] = trimmed
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

export function formatProductionQueryPeriodTitle(
  startDate: string,
  endDate: string,
) {
  return startDate === endDate ? startDate : `${startDate} ~ ${endDate}`
}
