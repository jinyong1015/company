/** 부적합률(ppm) = 부적합 수량 ÷ 검수량 × 1,000,000 */
export function failRatePpm(fail: number, qty: number) {
  return qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
}

export function formatPpm(n: number | undefined | null) {
  return `${Math.round(Number(n) || 0).toLocaleString()} ppm`
}

export function formatPpmDelta(diff: number) {
  const sign = diff > 0 ? '+' : diff < 0 ? '' : ''
  return `${sign}${Math.round(diff).toLocaleString()} ppm`
}

/** 위험 ≥ 20,000 ppm (2%), 주의 ≥ 13,000 ppm (1.3%) */
export function statusByPpm(rate: number) {
  if (rate >= 20_000) return '위험' as const
  if (rate >= 13_000) return '주의' as const
  return '정상' as const
}
