const PAGE_VIEW_PREFIX = 'inspection-analytics-page:'

export function loadPageViewState<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(PAGE_VIEW_PREFIX + key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export function savePageViewState<T>(key: string, value: T) {
  try {
    sessionStorage.setItem(PAGE_VIEW_PREFIX + key, JSON.stringify(value))
  } catch {
    // ignore
  }
}

/** 데이터 초기화·재업로드 시 분석 화면 로컬 조회상태도 함께 비운다. */
export function clearAllPageViewState() {
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key?.startsWith(PAGE_VIEW_PREFIX)) keys.push(key)
    }
    for (const key of keys) sessionStorage.removeItem(key)
  } catch {
    // ignore
  }
}
