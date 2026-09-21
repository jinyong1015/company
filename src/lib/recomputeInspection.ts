import type { InspectionRecord } from '../types'
import { failRatePpm } from './format'
import { normalizeProductType } from './groups'

/** 검사 DATA 수정 후 파생지표·상태를 다시 계산한다. */
export function recomputeInspectionRecord(
  draft: InspectionRecord,
): InspectionRecord {
  const productType = normalizeProductType(draft.productType) || draft.productType
  const qty = Math.max(0, Math.round(Number(draft.qty) || 0))
  const fail = Math.max(0, Math.round(Number(draft.fail) || 0))
  const pass = Math.max(0, Math.round(Number(draft.pass) || Math.max(qty - fail, 0)))
  const scrapCost = Math.max(0, Math.round(Number(draft.scrapCost) || 0))

  let hours = Math.max(0, Number(draft.hours) || 0)
  const durationText = String(draft.duration ?? '').trim()
  const minMatch = durationText.match(/(\d+(?:\.\d+)?)\s*분/)
  const hourMatch = durationText.match(/(\d+(?:\.\d+)?)\s*시간/)
  if (minMatch) hours = Number(minMatch[1]) / 60
  else if (hourMatch) hours = Number(hourMatch[1])

  const failRate = failRatePpm(fail, qty)

  const defects: Record<string, number> = {}
  for (const [k, v] of Object.entries(draft.defects ?? {})) {
    const n = Math.max(0, Math.round(Number(v) || 0))
    if (n > 0) defects[k] = n
  }
  if (Object.keys(defects).length === 0 && fail > 0) {
    defects[draft.mainDefect || '기타'] = fail
  }

  const extras: Record<string, string> = {}
  for (const [k, v] of Object.entries(draft.extras ?? {})) {
    const text = String(v ?? '').trim()
    if (text) extras[k] = text
  }

  const issues: string[] = []
  let rowClass: InspectionRecord['rowClass'] = 'ok'

  if (!productType || productType === '#N/A') {
    issues.push('제품유형 오류')
    rowClass = 'error'
  }
  if (!draft.inspector?.trim()) {
    issues.push('검사원 누락')
    rowClass = 'error'
  }
  if (!draft.product?.trim()) {
    issues.push('품번 누락')
    rowClass = 'error'
  }
  if (pass + fail !== qty && qty > 0) {
    issues.push('합격+부적합 ≠ 검수량')
    if (rowClass === 'ok') rowClass = 'warn'
  }
  if (!draft.equipment?.trim() || draft.equipment === '미지정') {
    issues.push('설비 누락')
    if (rowClass === 'ok') rowClass = 'warn'
  }
  if (!draft.moldNo?.trim() || draft.moldNo === '-') {
    issues.push('금형번호 누락')
    if (rowClass === 'ok') rowClass = 'warn'
  }

  const duration =
    hours > 0 ? `${Math.round(hours * 60)}분` : durationText || '-'

  return {
    ...draft,
    productType,
    start: draft.start ?? '',
    end: draft.end ?? '',
    qty,
    pass,
    fail,
    failRate,
    scrapCost,
    hours,
    duration,
    issues,
    rowClass,
    defects,
    extras: Object.keys(extras).length ? extras : undefined,
  }
}
