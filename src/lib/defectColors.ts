/** 대시보드 원형 / 품질분석 막대 / 품번 상세 공통 불량 유형 색상 */
export const DEFECT_TYPE_COLORS = [
  "#3b82f6",
  "#0ea5e9",
  "#14b8a6",
  "#22c55e",
  "#84cc16",
  "#eab308",
  "#f59e0b",
  "#f97316",
  "#ef4444",
  "#a855f7",
] as const;

export const DEFECT_ALL_COLOR = "#64748b";

export function defectTypeColor(index: number): string {
  return DEFECT_TYPE_COLORS[index % DEFECT_TYPE_COLORS.length] ?? DEFECT_TYPE_COLORS[0]
}

/** 불량 유형명 기준 고정 색 — GROMMET/SEAL 등 차트 간 동일 유형은 같은 색 */
export function defectNameColor(name: string, fallbackIndex = 0): string {
  const key = name.trim()
  if (!key) return defectTypeColor(fallbackIndex)
  let hash = 0
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  }
  return DEFECT_TYPE_COLORS[hash % DEFECT_TYPE_COLORS.length] ?? defectTypeColor(fallbackIndex)
}

/**
 * 품질분석 불량유형 TOP10과 동일: 발생량 순위 index → DEFECT_TYPE_COLORS.
 * names는 이미 비중/건수 내림차순이어야 한다.
 */
export function defectColorByRankName(
  names: string[],
): Record<string, string> {
  const map: Record<string, string> = {}
  names.forEach((name, index) => {
    const key = name.trim()
    if (!key || map[key]) return
    map[key] = defectTypeColor(index)
  })
  return map
}

