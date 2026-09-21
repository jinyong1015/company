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

