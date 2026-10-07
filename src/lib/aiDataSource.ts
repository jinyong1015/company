/**
 * Qualitics AI — VINA DATA 교육 규칙.
 *
 * 1차: 호출 규칙 — VINA / VN / 베트남이 명시된 경우에만 VINA DATA 사용.
 * 2차: 데이터 구조 — 실제 VINA 엑셀 컬럼·의미 기준으로만 해석·집계.
 * 3차: 품번 정규화 — 원본 유지, 검색·연결용 정규화·matchKey, 부분/유사 일치 금지.
 * 4차: 자연어 → 분석 매핑 — 검사량/불량수량/불량률·TOP·대상을 구분, 모호하면 확인.
 * 5차: 기간·날짜 — 구체 범위 우선, 지난달≠최근30일, 지난주≠최근7일, 이번달·올해는 오늘까지.
 * 6차: 지표·TOP — 합산 후 부적합률, 검수량≠검사기록, qty=0 제외, 동률 시 검수량·품번 보조정렬.
 * 7차: 상세페이지·사진 연결 — 분석은 VINA/기존 완전 분리. 품번·검사자 클릭 시 source=VINA
 *     상세로 이동하고 AI 기간을 유지. 사진은 정규화·matchKey 동일 품번만 재사용(부분일치·유사·
 *     AMBIGUOUS 금지). original_item 보존. 사진 연결 ≠ 분석 데이터 합산.
 *
 * 기존 검사 DATA와 컬럼이 비슷해도 동일하다고 단정하지 않는다.
 * 없는 컬럼·지표는 추측·혼용하지 않는다.
 * 품번 정규화가 가능해도 VINA 키워드 없으면 VINA DATA를 쓰지 않는다.
 */

import type { InspectionRecord } from '../types'
import { isAnalyzable } from './groups'

export type AiDataSource = 'main' | 'vina' | 'compare'

/** VINA 엑셀 → 시스템 필드 매핑 (2차 교육용 기준 표) */
export const VINA_COLUMN_MEANINGS = [
  { excel: 'ITEM', meaning: '품번', field: 'product' },
  { excel: '사원명', meaning: '검사자', field: 'inspector' },
  { excel: '설비작업자(NV)', meaning: '설비작업자', field: 'worker' },
  { excel: '설비', meaning: '설비', field: 'equipment' },
  { excel: '종류', meaning: '제품유형', field: 'productType' },
  { excel: 'Work Day', meaning: '검사일(기간 필터)', field: 'date' },
  { excel: '검사수량', meaning: '검수량', field: 'qty' },
  { excel: '합격수량', meaning: '합격수', field: 'pass' },
  { excel: 'NG수량', meaning: '부적합수량', field: 'fail' },
  { excel: 'NG금액', meaning: '폐기·NG금액', field: 'scrapCost' },
  { excel: '단가', meaning: '단가(extras)', field: 'extras.단가' },
  { excel: '검사금액', meaning: '검사금액(extras)', field: 'extras.검사금액' },
  { excel: '불량 컬럼들', meaning: '불량유형·수량', field: 'defects' },
] as const

/** VINA에 없거나 의미 없는 기존 DATA 차원 */
export const VINA_UNSUPPORTED_DIMENSIONS = [
  '금형번호',
  'LOT NO',
  '공장(본사/1공장/2공장) 그룹',
  '소속 팀(MES)',
  '작업구분(주간/잔업 등 MES)',
] as const

/** VINA 호출 허용 키워드만 인정 (대소문자 무시) */
export function hasVinaCallKeyword(raw: string): boolean {
  const t = raw.normalize('NFKC')
  if (/베트남/.test(t)) return true
  // 단어 경계 또는 한글/기호에 붙은 VINA / VN (예: VINA품번, VN 검사)
  if (/(?:^|[^A-Za-z0-9])VINA(?:[^A-Za-z0-9]|$)/i.test(t)) return true
  if (/(?:^|[^A-Za-z0-9])VN(?:[^A-Za-z0-9]|$)/i.test(t)) return true
  return false
}

/** 기존 검사 DATA와 VINA를 함께 비교하는지 */
export function wantsMainVinaCompare(raw: string): boolean {
  if (!hasVinaCallKeyword(raw)) return false
  const t = raw.normalize('NFKC')
  const n = t.toLowerCase().replace(/\s+/g, '')
  const hasCompare =
    n.includes('비교') ||
    n.includes('차이') ||
    n.includes('대비') ||
    n.includes('vs')
  const hasMain =
    n.includes('기존') ||
    n.includes('본사데이터') ||
    n.includes('검사데이터') ||
    n.includes('기존데이터') ||
    /기존\s*(검사\s*)?데이터/.test(t) ||
    /본사\s*데이터/.test(t) ||
    /\bmes\b/i.test(t)
  return hasCompare && hasMain
}

export function detectAiDataSource(raw: string): AiDataSource {
  if (wantsMainVinaCompare(raw)) return 'compare'
  if (hasVinaCallKeyword(raw)) return 'vina'
  return 'main'
}

/**
 * 분석 엔진에 넘기기 전 VINA/비교 문구를 제거한다.
 * (품번 검색 오탐·공장 그룹 오인 방지)
 */
export function stripAiDataSourcePhrases(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/(?:^|[^A-Za-z0-9])VINA(?:[^A-Za-z0-9]|$)/gi, ' ')
    .replace(/(?:^|[^A-Za-z0-9])VN(?:[^A-Za-z0-9]|$)/gi, ' ')
    .replace(/베트남/g, ' ')
    .replace(/기존\s*검사\s*데이터/gi, ' ')
    .replace(/기존\s*데이터/gi, ' ')
    .replace(/본사\s*데이터/gi, ' ')
    .replace(/검사\s*데이터/gi, ' ')
    .replace(/\bMES\b/gi, ' ')
    .replace(/와\s*비교|과\s*비교|비교해\s*줘|비교해줘|비교해|비교/gi, ' ')
    .replace(/차이\s*알려|차이를?|대비/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function aiDataSourceLabel(source: AiDataSource): string {
  if (source === 'vina') return 'VINA DATA'
  if (source === 'compare') return '기존 검사 DATA + VINA DATA'
  return '기존 검사 DATA'
}

/** VINA NG금액·단가 등으로 폐기비용 집계가 가능한지 */
export function vinaHasScrapCostData(records: InspectionRecord[]): boolean {
  for (const r of records) {
    if (!isAnalyzable(r)) continue
    if (r.scrapCost > 0) return true
    const unit = r.extras?.['단가']
    if (unit != null && String(unit).trim() !== '' && Number(unit) > 0) return true
  }
  return false
}

/**
 * VINA 모드에서 지원하지 않는 분석 요청이면 안내 문구를 반환.
 * (기존 DATA 컬럼을 임의로 채우지 않음)
 */
export function vinaUnsupportedRequestMessage(
  compactQuestion: string,
  rawQuestion: string,
): string | null {
  const n = compactQuestion
  const t = rawQuestion.normalize('NFKC')

  // 금형번호 분석 (불량유형명 금형손상/오염은 허용)
  const asksMoldDim =
    includesCompact(n, ['금형별', '금형번호', '금형분석']) ||
    (includesCompact(n, ['금형']) &&
      includesCompact(n, ['부적합', '검수', 'top', '워스트', 'worst', '높은', '낮은', '알려']) &&
      !includesCompact(n, ['금형손상', '금형오염']))
  if (asksMoldDim) {
    return '현재 VINA DATA에는 금형번호 컬럼이 없어 금형별 분석을 할 수 없습니다.'
  }

  // LOT
  if (
    includesCompact(n, ['lot별', '롯트별', '로트별']) ||
    (/\bLOT\b|롯트|로트/.test(t) &&
      includesCompact(n, ['부적합', '검수', 'top', '분석', '알려', '높은']))
  ) {
    return '현재 VINA DATA에는 LOT NO 컬럼이 없어 LOT별 분석을 할 수 없습니다.'
  }

  // 공장/MES 그룹
  if (
    includesCompact(n, ['1공장', '2공장', '본사', '구지', '공장별', '공장비교']) &&
    !includesCompact(n, ['기존', 'mes'])
  ) {
    return 'VINA DATA에는 본사·1공장·2공장 그룹 구분이 없습니다. 공장별 분석은 기존 검사 DATA에서 질문해 주세요.'
  }

  return null
}

function includesCompact(n: string, words: string[]): boolean {
  return words.some((w) => n.includes(w.replace(/\s+/g, '')))
}

/** VINA 답변 상단용 출처·구조 안내 줄 */
export function vinaSourceAttributionLines(periodLabel?: string | null): string[] {
  const lines = [
    `데이터 출처: ${aiDataSourceLabel('vina')}`,
    periodLabel
      ? `조회 기간: ${periodLabel}`
      : '조회 기간: VINA DATA 전체(날짜 필터 없음)',
    '분석 기준: VINA 엑셀 컬럼(ITEM·사원명·검사수량·NG수량·Work Day 등). 기존 검사 DATA와 컬럼을 혼용·추측하지 않습니다.',
  ]
  return lines
}
