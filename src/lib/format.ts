/**
 * 부적합률(ppm) = 부적합 수량 ÷ 검수량 × 1,000,000
 * (집계 시 합산 fail ÷ 합산 qty — 행별 률 평균 금지)
 * 검수량 0이면 나누지 않고 0 반환(순위에서는 별도 제외).
 */
export function failRatePpm(fail: number, qty: number) {
  if (!(qty > 0) || !Number.isFinite(qty) || !Number.isFinite(fail)) return 0
  return Math.round((fail / qty) * 1_000_000)
}

export function formatPpm(n: number | undefined | null) {
  return `${Math.round(Number(n) || 0).toLocaleString()} ppm`
}

/** 비중·비율 등 % 표기 (불필요한 끝자리 0 제거) */
export function formatPercent(n: number | undefined | null) {
  const v = Number(n) || 0
  return `${parseFloat(v.toFixed(2))}%`
}

/** ppm → % (10,000 ppm = 1%) — 막대 상단 라벨 등 */
export function formatPpmAsPercent(n: number | undefined | null) {
  return formatPercent((Number(n) || 0) / 10_000)
}

export function formatPpmDelta(diff: number) {
  const sign = diff > 0 ? '+' : diff < 0 ? '' : ''
  return `${sign}${Math.round(diff).toLocaleString()} ppm`
}

/** ppm 차이 → 퍼센트포인트 (%p). 부적합률 비교 시 %와 구분 */
export function formatPpmDeltaPp(diff: number) {
  const pp = (Number(diff) || 0) / 10_000
  const sign = pp > 0 ? '+' : pp < 0 ? '' : ''
  return `${sign}${parseFloat(pp.toFixed(2))}%p`
}

/** 증감률 (%). prev=0이면 N/A */
export function formatGrowthPercent(prev: number, cur: number) {
  if (!Number.isFinite(prev) || !Number.isFinite(cur)) return '-'
  if (prev === 0) return cur === 0 ? '0%' : 'N/A'
  const pct = ((cur - prev) / Math.abs(prev)) * 100
  const sign = pct > 0 ? '+' : ''
  return `${sign}${parseFloat(pct.toFixed(1))}%`
}

/** 폐기비용(원) — 소수점 없이 정수 표기 */
export function roundWon(n: number | undefined | null) {
  return Math.round(Number(n) || 0)
}

export function formatWon(n: number | undefined | null) {
  return `₩${roundWon(n).toLocaleString('ko-KR')}`
}

/** KPI 등: ₩ 없이 '원' 접미사 */
export function formatWonSuffix(n: number | undefined | null) {
  return `${roundWon(n).toLocaleString('ko-KR')}원`
}

/** 위험 ≥ 20,000 ppm (2%), 주의 ≥ 13,000 ppm (1.3%) */
export function statusByPpm(rate: number) {
  if (rate >= 20_000) return '위험' as const
  if (rate >= 13_000) return '주의' as const
  return '정상' as const
}

const KO_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** YYYY-MM-DD → 2026-09-22(화) */
export function formatYmdWithWeekday(ymd: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim())
  if (!m) return ymd
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(y, mo - 1, d)
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== mo - 1 ||
    date.getDate() !== d
  ) {
    return ymd
  }
  return `${ymd}(${KO_WEEKDAYS[date.getDay()]})`
}

/** 조회기간 표시: 2026-09-22(화) ~ 2026-09-28(월) */
export function formatDateRangeWithWeekday(start: string, end: string) {
  return `${formatYmdWithWeekday(start)} ~ ${formatYmdWithWeekday(end)}`
}
