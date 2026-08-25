import type { FilterState } from '../context/FilterContext'
import type { AnalysisGroupId } from './groups'
import {
  ANALYSIS_GROUPS,
  ANALYSIS_GROUP_BAR_COLORS,
  ANALYSIS_GROUP_TOTAL_LINE_COLOR,
  isAnalyzable,
  groupLabel as officialGroupLabel,
} from './groups'
import { analyzeRecords } from './analyze'
import { KNOWN_DEFECT_TYPES } from './excel'
import {
  formatPercent,
  formatPpm,
  formatPpmAsPercent,
  formatPpmDelta,
  formatWon,
  roundWon,
} from './format'
import type {
  Analytics,
  DailyTrend,
  DefectType,
  InspectionRecord,
  ProductRow,
} from '../types'

export type AiValueFormat =
  | 'ppm'
  | 'percent'
  | 'qty'
  | 'won'
  | 'million'
  | 'count'
  | 'raw'

export type AiChartSeries = {
  key: string
  label: string
  color: string
}

export type AiBlock =
  | { type: 'text'; lines: string[] }
  | {
      type: 'bar'
      title: string
      data: { name: string; value: number }[]
      format: AiValueFormat
      valueLabel?: string
    }
  | {
      type: 'pie'
      title: string
      data: { name: string; value: number; share: number }[]
    }
  | {
      type: 'line'
      title: string
      data: Record<string, string | number>[]
      xKey: string
      series: AiChartSeries[]
      format?: AiValueFormat
    }
  | {
      type: 'multiBar'
      title: string
      data: Record<string, string | number>[]
      xKey: string
      series: AiChartSeries[]
      format?: AiValueFormat
    }
  | {
      type: 'composed'
      title: string
      description?: string
      data: Record<string, string | number>[]
      xKey: string
      bars: AiChartSeries[]
      line?: AiChartSeries
      format: AiValueFormat
    }
  | {
      type: 'table'
      title: string
      headers: string[]
      rows: string[][]
    }

/** 직전 답변의 품번 리스트 등 — 후속 질문("방금 알려준 리스트에서…")용 */
export type AiConversationContext = {
  lastQuestion: string
  productNames: string[]
  scopes: { label: string; productNames: string[] }[]
  /** 직전 답변에서 쓴 지표 (후속 막대그래프 등에 재사용) */
  lastMetric?: 'failRate' | 'qty' | 'scrapCost'
  /** 직전 답변에서 쓴 기간 */
  lastPeriod?: { startDate: string; endDate: string; label: string }
}

export type AiAnswer = {
  blocks: AiBlock[]
  context?: AiConversationContext
}

/**
 * 사용자 표현 → 분석 그룹
 * - 1공장 SEAL = 본사(SEAL)
 * - 1공장 GROMMET = 본사(유압+그로멧)
 * - 1공장 / 본사 (라인 미지정) = 본사(SEAL) + 본사(유압+그로멧)
 * - 2공장 = 2공장
 */
const GROUP_ALIASES: {
  id: Exclude<AnalysisGroupId, 'all'>
  label: string
  words: string[]
}[] = [
  {
    id: 'seal',
    label: '본사(SEAL)',
    words: [
      '1공장seal',
      '본사(seal)',
      '본사seal',
      'seal',
      '실링',
      '씰',
    ],
  },
  {
    id: 'hydraulic',
    label: '본사(유압+그로멧)',
    words: [
      '1공장grommet',
      '1공장그로멧',
      '1공장그로메트',
      '1공장유압',
      '본사(유압',
      '본사유압',
      '본사(그로멧',
      'grommet',
      '그로멧',
      '그로메트',
      '유압',
    ],
  },
  {
    id: 'plant2',
    label: '2공장',
    words: ['2공장', '이공장', 'plant2'],
  },
]

const GROUP_COLORS: Record<string, string> = {
  ...Object.fromEntries(ANALYSIS_GROUP_BAR_COLORS.map((g) => [g.id, g.color])),
  total: ANALYSIS_GROUP_TOTAL_LINE_COLOR,
}

const BAR_COLOR = '#3b82f6'
const LINE_COLORS = ['#ef4444', '#2563eb', '#16a34a', '#f59e0b']

function chartGroupBars(): AiChartSeries[] {
  return ANALYSIS_GROUP_BAR_COLORS.map((g) => ({
    key: g.id,
    label: officialGroupLabel(g.id),
    color: g.color,
  }))
}

type PeriodHint = {
  startDate: string
  endDate: string
  label: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function ymd(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

function lastDayOfMonth(y: number, m: number) {
  return new Date(y, m, 0).getDate()
}

function inferDataYear(records: InspectionRecord[]) {
  const years = records
    .map((r) => Number(r.date?.slice(0, 4)))
    .filter((y) => Number.isFinite(y) && y >= 2000)
  if (!years.length) return new Date().getFullYear()
  const counts = new Map<number, number>()
  for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]![0]
}

/** 질문 문장에서 기간을 읽습니다. 예: 7월 / 7월 22일부터 28일까지 */
export function parsePeriodFromQuestion(
  text: string,
  records: InspectionRecord[],
): PeriodHint | null {
  const yearFromText = text.match(/(20\d{2})\s*년/)
  const year = yearFromText ? Number(yearFromText[1]) : inferDataYear(records)

  // 1월~12월 전체 추이 질문은 연간으로 둠
  if (/1\s*월\s*[~～\-–—부터까지\s]*12\s*월/.test(text) && /월별|월간|그래프/.test(text)) {
    return null
  }

  // 7월 22일부터 28일까지 / 7월22일~7월28일
  const dayRange = text.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:부터|~|-|–|—)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/,
  )
  if (dayRange) {
    const m1 = Number(dayRange[1])
    const d1 = Number(dayRange[2])
    const m2 = Number(dayRange[3] || dayRange[1])
    const d2 = Number(dayRange[4])
    if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12 && d1 >= 1 && d2 >= 1) {
      return {
        startDate: ymd(year, m1, d1),
        endDate: ymd(year, m2, d2),
        label: `${year}년 ${m1}월 ${d1}일 ~ ${m2}월 ${d2}일`,
      }
    }
  }

  // 2026-07-22 ~ 2026-07-28
  const isoRange = text.match(
    /(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\s*(?:부터|~|-|–|—)\s*(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})/,
  )
  if (isoRange) {
    const y1 = Number(isoRange[1])
    const m1 = Number(isoRange[2])
    const d1 = Number(isoRange[3])
    const y2 = Number(isoRange[4] || isoRange[1])
    const m2 = Number(isoRange[5])
    const d2 = Number(isoRange[6])
    return {
      startDate: ymd(y1, m1, d1),
      endDate: ymd(y2, m2, d2),
      label: `${ymd(y1, m1, d1)} ~ ${ymd(y2, m2, d2)}`,
    }
  }

  // 5월부터/에서 7월까지 / 5월~7월 / 5~7월
  const monthRange = text.match(
    /(\d{1,2})\s*월\s*(?:부터|에서|~|-|–|—)\s*(\d{1,2})\s*월/,
  )
  const monthRangeShort = text.match(/(\d{1,2})\s*[~～\-–—]\s*(\d{1,2})\s*월/)
  const monthSpan = monthRange ?? monthRangeShort
  if (monthSpan) {
    const m1 = Number(monthSpan[1])
    const m2 = Number(monthSpan[2])
    // 1월~12월 + 월별 그래프는 연간 추이이므로 제외
    if (!(m1 === 1 && m2 === 12 && /월별|월간/.test(text))) {
      if (m1 >= 1 && m1 <= 12 && m2 >= 1 && m2 <= 12) {
        const startM = Math.min(m1, m2)
        const endM = Math.max(m1, m2)
        return {
          startDate: ymd(year, startM, 1),
          endDate: ymd(year, endM, lastDayOfMonth(year, endM)),
          label: `${year}년 ${startM}월 ~ ${endM}월`,
        }
      }
    }
  }

  // 7월 22일 (단일일)
  const singleDay = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일(?!\s*(?:부터|~|-|–|—))/)
  if (singleDay && !dayRange) {
    const m = Number(singleDay[1])
    const d = Number(singleDay[2])
    if (m >= 1 && m <= 12 && d >= 1) {
      return {
        startDate: ymd(year, m, d),
        endDate: ymd(year, m, d),
        label: `${year}년 ${m}월 ${d}일`,
      }
    }
  }

  // 7월 / 7월에 / 7월달 — 서로 다른 월이 여러 개면(범위 미인식 시) 스킵
  const monthHits = [...text.matchAll(/(\d{1,2})\s*월/g)].map((m) => Number(m[1]))
  const uniqueMonths = [...new Set(monthHits.filter((m) => m >= 1 && m <= 12))]
  if (uniqueMonths.length === 1 && !/(\d{1,2})\s*월\s*\d{1,2}\s*일/.test(text)) {
    const m = uniqueMonths[0]!
    return {
      startDate: ymd(year, m, 1),
      endDate: ymd(year, m, lastDayOfMonth(year, m)),
      label: `${year}년 ${m}월`,
    }
  }

  return null
}

function baseFilters(
  group: AnalysisGroupId = 'all',
  period?: PeriodHint | null,
): FilterState {
  return {
    analysisGroup: group,
    period: period ? 'custom' : 'year',
    startDate: period?.startDate ?? '',
    endDate: period?.endDate ?? '',
    teams: [],
    inspectors: [],
    workTypes: [],
    productTypes: [],
    products: [],
    molds: [],
    equipment: [],
    workers: [],
    lots: [],
  }
}

function compact(text: string) {
  return text.toLowerCase().replace(/\s+/g, '')
}

function topN(text: string, fallback = 5, max = 50) {
  const match = text.match(/top\s*(\d+)|상위\s*(\d+)|(\d+)\s*개|(\d+)\s*까지/i)
  const n = Number(match?.[1] || match?.[2] || match?.[3] || match?.[4] || fallback)
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback
}

/** 키워드 근처의 TOP N (예: TOP10 리스트 / TOP5 막대) */
function topNNear(
  text: string,
  keywords: string[],
  fallback: number,
  max = 50,
): number {
  const lower = text.toLowerCase().replace(/\s+/g, '')
  for (const kw of keywords) {
    const k = kw.toLowerCase().replace(/\s+/g, '')
    const patterns = [
      new RegExp(`top(\\d+)(?:까지는?|까지만)?(?:은|는)?${k}`),
      new RegExp(`${k}(?:로|으로|그래프|표현)?(?:해)?(?:주)?(?:고)?[^\\d]{0,8}top(\\d+)`),
      new RegExp(`상위(\\d+)[^\\d]{0,12}${k}`),
      new RegExp(`(\\d+)까지(?:는?|만)?(?:은|는)?${k}`),
      new RegExp(`${k}[^\\d]{0,12}(\\d+)까지`),
    ]
    for (const re of patterns) {
      const m = lower.match(re)
      if (m?.[1]) {
        const v = Number(m[1])
        if (Number.isFinite(v) && v > 0) return Math.min(v, max)
      }
    }
  }
  return fallback
}

/**
 * 검수량 N EA 이상 — "검수량 10000ea 이상", "검사량 10,000 이상"
 * (부적합률 10,000ppm 와 구분)
 */
function parseQtyMinEa(text: string, n: string): number | null {
  const compactHit =
    n.match(/검(?:수|사)량[^\d]{0,8}([\d,]+)(?:ea|개)?이상/) ??
    (n.includes('검수량') || n.includes('검사량')
      ? n.match(/([\d,]+)(?:ea|개)이상/)
      : null)
  if (compactHit?.[1]) {
    const v = Number(String(compactHit[1]).replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  const fromText = text.match(
    /검\s*[수사]\s*량[^\d]{0,24}([\d,]+)\s*(?:ea|EA|개)?\s*이상/i,
  )
  if (fromText?.[1]) {
    const v = Number(fromText[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
}

/**
 * 부적합률 N ppm 이상 — "10000ppm", "10000pm"(오타), "부적합률이 10000 이상"
 */
function parsePpmMin(text: string, n: string): number | null {
  const compactHit =
    n.match(
      /(?:부적합률|부적합율|불량률|불량율)(?:이|가)?([\d,]+)(?:ppm|pm)?이상/,
    ) ?? n.match(/([\d,]+)(?:ppm|pm)이상/)
  if (compactHit?.[1]) {
    const v = Number(String(compactHit[1]).replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  const fromText = text.match(
    /(?:부적합률|부적합율|불량률|불량율|ppm|pm)[^\d]{0,12}([\d,]+)\s*(?:ppm|pm)?\s*이상/i,
  )
  if (fromText?.[1]) {
    const v = Number(fromText[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
}

/** 부적합률 10,000ppm / 5,000ppm + 상대 고검수량 규칙인지 (검수량 10000ea 와 구분) */
function isPpmThresholdAsk(n: string, text: string): boolean {
  // 검수량 N EA 이상이면 ppm 임계 규칙이 아님
  if (parseQtyMinEa(text, n) != null) return false
  if (parsePpmMin(text, n) != null) return true
  if (includesAny(n, ['상대적으로'])) return true
  if (/10[,.]?000\s*p?pm|5[,.]?000\s*p?pm/i.test(text)) return true
  if (/(?:10000|10,000|5000|5,000)p?pm/.test(n)) return true
  if (
    includesAny(n, ['10000', '10,000', '5000', '5,000']) &&
    (includesAny(n, ['ppm', 'pm']) ||
      includesAny(n, ['부적합률', '부적합율', '불량률', '불량율']))
  ) {
    return true
  }
  return false
}

/** 질문에서 그룹을 안 말하면 전체 1건. 말하면 해당 그룹만. */
function resolveAnswerScopes(
  groups: typeof GROUP_ALIASES,
): { id: AnalysisGroupId; label: string }[] {
  if (groups.length) return groups.map((g) => ({ id: g.id, label: g.label }))
  return [{ id: 'all', label: '전체' }]
}

function includesAny(text: string, words: string[]) {
  return words.some((w) => text.includes(w))
}

function hasExcludeIntent(n: string) {
  return includesAny(n, [
    '제외',
    '제외한',
    '제외하고',
    '제외하면',
    '빼고',
    '빼면',
    '빼고는',
    '말고',
    '말구',
  ])
}

/**
 * "SEAL 제품을 제외한" / "그로멧 빼고" → 제외할 제품유형
 * (포함 필터 typeHint 와 구분)
 */
function excludedTypeHint(n: string): 'seal' | 'grommet' | 'hydraulic' | null {
  if (!hasExcludeIntent(n)) return null
  if (includesAny(n, ['seal', '실링', '씰'])) return 'seal'
  if (includesAny(n, ['grommet', '그로멧', '그로메트'])) return 'grommet'
  if (n.includes('유압')) return 'hydraulic'
  return null
}

function excludeTypeLabel(hint: 'seal' | 'grommet' | 'hydraulic') {
  if (hint === 'seal') return 'SEAL'
  if (hint === 'grommet') return 'GROMMET/그로멧'
  return '유압'
}

function textBlock(...lines: string[]): AiBlock {
  return { type: 'text', lines: lines.filter(Boolean) }
}

function emptyAnswer(msg: string): AiAnswer {
  return { blocks: [textBlock(msg)] }
}

function detectGroups(n: string): {
  groups: typeof GROUP_ALIASES
  /** GROMMET만 말한 종합 질의 → 본사+2공장 각각 + 합계 */
  grommetOverall: boolean
} {
  const hitIds = new Set<Exclude<AnalysisGroupId, 'all'>>()
  let grommetOverall = false

  const has1PlantSeal = includesAny(n, ['1공장seal', '본사seal', '본사(seal)'])
  const has1PlantGrommet = includesAny(n, [
    '1공장grommet',
    '1공장그로멧',
    '1공장그로메트',
    '1공장유압',
    '본사유압',
    '본사(유압',
    '본사(그로멧',
  ])
  const excludeHint = excludedTypeHint(n)
  // "SEAL 제외"는 그룹 포함이 아님
  const hasSealWord =
    includesAny(n, ['seal', '실링', '씰']) && excludeHint !== 'seal'
  const hasGrommetWord =
    includesAny(n, ['grommet', '그로멧', '그로메트', '유압']) &&
    excludeHint !== 'grommet' &&
    excludeHint !== 'hydraulic'
  const hasBare1Plant = n.includes('1공장') || n.includes('일공장')
  const hasBareHqWord = n.includes('본사')
  const hasHq =
    hasBare1Plant ||
    (has1PlantSeal && excludeHint !== 'seal') ||
    (has1PlantGrommet && excludeHint !== 'grommet' && excludeHint !== 'hydraulic') ||
    hasBareHqWord
  const hasPlant2 = includesAny(n, ['2공장', '이공장', 'plant2'])
  /** SEAL/GROMMET 라인을 특정하지 않은 본사·1공장 */
  const hqUnspecified =
    !hasSealWord &&
    !hasGrommetWord &&
    !(has1PlantSeal && excludeHint !== 'seal') &&
    !(has1PlantGrommet && excludeHint !== 'grommet')

  // 2공장(+GROMMET/SEAL)만 물으면 2공장만
  if (hasPlant2 && !hasHq) {
    hitIds.add('plant2')
  } else {
    // 1공장 SEAL / SEAL / 본사(SEAL)
    if (
      excludeHint !== 'seal' &&
      (has1PlantSeal || (hasSealWord && !hasPlant2))
    ) {
      hitIds.add('seal')
    }
    if (hasSealWord && hasHq) hitIds.add('seal')

    // 1공장 GROMMET / 본사(유압+그로멧)
    if (
      excludeHint !== 'grommet' &&
      excludeHint !== 'hydraulic' &&
      (has1PlantGrommet || (hasGrommetWord && hasHq))
    ) {
      hitIds.add('hydraulic')
    }

    // "1공장, SEAL, 2공장" → 나열된 1공장은 GROMMET 라인
    if (
      hasBare1Plant &&
      hasSealWord &&
      !has1PlantSeal &&
      !has1PlantGrommet &&
      !hasGrommetWord
    ) {
      hitIds.add('hydraulic')
    }

    // "1공장" / "본사"만 (라인 미지정) → 본사 전체(SEAL + 유압+그로멧)
    // "1공장, 2공장" / "본사, 2공장"에서 SEAL·본사 누락 방지
    if (hqUnspecified && (hasBare1Plant || hasBareHqWord)) {
      if (excludeHint !== 'seal') hitIds.add('seal')
      if (excludeHint !== 'grommet' && excludeHint !== 'hydraulic') {
        hitIds.add('hydraulic')
      }
    }

    if (hasPlant2) hitIds.add('plant2')
  }

  // GROMMET만 (공장 미지정) → 본사 + 2공장 각각 + 합계
  if (
    hasGrommetWord &&
    !hasPlant2 &&
    !hasHq &&
    !hasSealWord &&
    !has1PlantSeal
  ) {
    hitIds.clear()
    hitIds.add('hydraulic')
    hitIds.add('plant2')
    grommetOverall = true
  }

  // SEAL만 (공장 미지정)은 기존대로 seal만 — 이미 처리됨

  if (hitIds.size) {
    return {
      groups: GROUP_ALIASES.filter((g) => hitIds.has(g.id)),
      grommetOverall,
    }
  }
  if (includesAny(n, ['전체공장', '전체', '각각', '월별', '공장'])) {
    return { groups: GROUP_ALIASES, grommetOverall: false }
  }
  return { groups: [], grommetOverall: false }
}

function isGrommetLikeProduct(p: ProductRow) {
  const type = compact(p.type)
  const name = compact(p.name)
  return (
    includesAny(type, ['grommet', '그로멧', '그로메트', '유압']) ||
    includesAny(name, ['grommet', '그로멧', '그로메트', '유압'])
  )
}

function mergeProductRows(lists: ProductRow[]): ProductRow[] {
  const map = new Map<string, ProductRow>()
  for (const p of lists) {
    const prev = map.get(p.name)
    if (!prev) {
      map.set(p.name, { ...p, defects: [...(p.defects ?? [])] })
      continue
    }
    const qty = prev.qty + p.qty
    const fail = prev.fail + p.fail
    const pass = prev.pass + p.pass
    map.set(p.name, {
      ...prev,
      qty,
      fail,
      pass,
      scrapCost: roundWon(prev.scrapCost + p.scrapCost),
      failRate: qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0,
      failTotal: (prev.failTotal ?? prev.fail) + (p.failTotal ?? p.fail),
      type: prev.type === p.type ? prev.type : `${prev.type}·${p.type}`,
      mainDefect: prev.scrapCost >= p.scrapCost ? prev.mainDefect : p.mainDefect,
    })
  }
  return [...map.values()]
}

function groupLabel(id: string) {
  return GROUP_ALIASES.find((g) => g.id === id)?.label
    ?? ANALYSIS_GROUPS.find((g) => g.id === id)?.label
    ?? id
}

function analyzeGroup(
  records: InspectionRecord[],
  group: AnalysisGroupId,
  period?: PeriodHint | null,
) {
  return analyzeRecords(records, baseFilters(group, period))
}

function formatValue(v: number, format: AiValueFormat) {
  if (format === 'ppm') return formatPpm(v)
  if (format === 'percent') return formatPercent(v)
  if (format === 'qty') return `${Math.round(v).toLocaleString()} EA`
  if (format === 'won') return formatWon(v)
  if (format === 'million')
    return `${Math.round(v).toLocaleString()}백만원`
  if (format === 'count') return `${Math.round(v).toLocaleString()}건`
  return String(v)
}

/** 막대 상단 라벨: 비중(%) · 불량률(ppm→%) */
export function formatAiBarTopLabel(v: number, format: AiValueFormat = 'raw') {
  if (format === 'ppm') return formatPpmAsPercent(v)
  if (format === 'percent') return formatPercent(v)
  return formatValue(v, format)
}

function toMillion(won: number) {
  return Math.round(won / 1_000_000)
}

function productTableRows(rows: ProductRow[]): string[][] {
  return rows.map((p, i) => [
    String(i + 1),
    p.name,
    p.type,
    formatPpm(p.failRate),
    `${p.qty.toLocaleString()} EA`,
    formatWon(p.scrapCost),
    p.mainDefect || '-',
  ])
}

const PRODUCT_HEADERS = ['순위', '품번', '유형', '부적합률', '검수량', '폐기비용', '주요불량']

function barFromProducts(
  title: string,
  rows: ProductRow[],
  metric: 'failRate' | 'qty' | 'scrapCost',
  top = 5,
): AiBlock {
  const format: AiValueFormat =
    metric === 'failRate' ? 'ppm' : metric === 'qty' ? 'qty' : 'won'
  const valueLabel =
    metric === 'failRate' ? '부적합률' : metric === 'qty' ? '검수량' : '폐기비용'
  return {
    type: 'bar',
    title,
    format,
    valueLabel,
    data: rows.slice(0, top).map((p) => ({
      name: p.name,
      value:
        metric === 'scrapCost'
          ? roundWon(p.scrapCost)
          : metric === 'qty'
            ? p.qty
            : p.failRate,
    })),
  }
}

function median(nums: number[]) {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

function findProductName(n: string, products: string[]): string | null {
  const hits = findProductNames(n, products)
  return hits[0] ?? null
}

/** 질문에 언급된 품번을 모두 찾습니다. (긴 품번 우선, 중복·부분일치 제거) */
function findProductNames(n: string, products: string[]): string[] {
  // top10 안의 p10 등 오탐 방지
  let search = n.replace(/top\s*\d+/gi, ' ')
  const sorted = [...products]
    .filter(Boolean)
    .sort((a, b) => compact(b).length - compact(a).length)
  const hits: string[] = []
  const seen = new Set<string>()

  for (const p of sorted) {
    const c = compact(p)
    if (c.length < 3 || !search.includes(c) || seen.has(c)) continue
    hits.push(p)
    seen.add(c)
    // 겹치는 짧은 코드 오탐 방지
    search = search.split(c).join(' ')
  }

  // NEOR GI000처럼 공백 분리 코드 (아직 매칭 안 된 경우)
  if (!hits.length) {
    const codeTokens = (
      n.match(/[a-z]+[0-9][a-z0-9]*|[0-9]+[a-z]+[a-z0-9]*/gi) ?? []
    ).map((t) => t.toLowerCase())
    if (codeTokens.length >= 1) {
      const hit = sorted.find((p) => {
        const c = compact(p)
        return codeTokens.every((t) => c.includes(t))
      })
      if (hit) hits.push(hit)
    }
  }

  return hits
}

/** 질문에 적힌 품번 코드 토큰 (R602514 등) — 데이터 미존재 안내용 */
function extractMentionedProductCodes(text: string): string[] {
  const matches = text.match(/\b[A-Za-z]*\d{4,}[A-Za-z0-9]*\b/g) ?? []
  const seen = new Set<string>()
  const out: string[] = []
  for (const m of matches) {
    const c = compact(m)
    if (c.length < 4 || seen.has(c)) continue
    // top5 / 10000ppm 등 숫자 오탐 제외
    if (/^\d+$/.test(c) && Number(c) < 100_000) continue
    seen.add(c)
    out.push(m)
  }
  return out
}

/**
 * 여러 품번을 나열하고 그중 비교·순위(부적합률 등)를 물을 때
 * 예: "R602514, R600031 … 중 7월 부적합률이 높은 품번순으로"
 */
function tryAnswerNamedProductCompare(
  text: string,
  n: string,
  analytics: Analytics,
  periodNote: string,
): AiBlock[] | null {
  const catalog = [
    ...new Set([
      ...analytics.filterOptions.products,
      ...analytics.products.map((p) => p.name),
    ]),
  ]
  const named = findProductNames(n, catalog)
  const bareCodes = extractMentionedProductCodes(text)

  // 데이터에 없는 코드도 질문에 2개 이상이면 비교 의도로 본다
  const mentionedCount = Math.max(named.length, bareCodes.length)
  if (mentionedCount < 2) return null

  const wantsCompare =
    includesAny(n, [
      '중',
      '비교',
      '대비',
      '순위',
      '순으로',
      '높은순',
      '낮은순',
      '순서',
      'vs',
      '각각',
      '알려',
      '보여',
      '리스트',
    ]) ||
    includesAny(n, ['부적합', '불량', '검수', '폐기', '높은', '낮은', '많은'])

  if (!wantsCompare) return null

  // "SEAL 제품 중 …"처럼 품번 코드 없이 유형만 말한 경우는 제외
  // (named가 2개 미만이고 bareCodes도 2개 미만이면 위에서 이미 return)
  // SEAL/그로멧만으로 findProductNames가 우연히 잡히지 않도록:
  // bareCodes가 2개 이상이거나, named가 2개 이상이어야 함 — 이미 충족

  const metric: 'failRate' | 'qty' | 'scrapCost' = includesAny(n, [
    '폐기',
    '비용',
  ])
    ? 'scrapCost'
    : includesAny(n, ['검수량', '검사량']) && !includesAny(n, ['부적합', '불량'])
      ? 'qty'
      : 'failRate'

  const metricLabel =
    metric === 'qty'
      ? '검수량'
      : metric === 'scrapCost'
        ? '폐기비용'
        : '부적합률'

  const namedSet = new Set(named.map((p) => compact(p)))
  const byCompact = new Map(
    analytics.products.map((p) => [compact(p.name), p] as const),
  )

  // 질문 순서 유지용 키 목록
  const orderKeys: string[] = []
  const orderSeen = new Set<string>()
  for (const p of named) {
    const c = compact(p)
    if (orderSeen.has(c)) continue
    orderSeen.add(c)
    orderKeys.push(c)
  }
  for (const code of bareCodes) {
    const c = compact(code)
    if (orderSeen.has(c)) continue
    // 데이터에 매칭되는 품번이 있으면 그쪽 이름 사용
    const hit = [...byCompact.keys()].find((k) => k.includes(c) || c.includes(k))
    if (hit) {
      orderSeen.add(hit)
      orderKeys.push(hit)
      namedSet.add(hit)
    } else {
      orderSeen.add(c)
      orderKeys.push(c)
    }
  }

  const rows: ProductRow[] = []
  const missing: string[] = []
  for (const key of orderKeys) {
    const hit =
      byCompact.get(key) ??
      [...byCompact.entries()].find(
        ([k]) => k.includes(key) || key.includes(k),
      )?.[1]
    if (hit) {
      rows.push(hit)
    } else {
      missing.push(named.find((p) => compact(p) === key) ?? key.toUpperCase())
    }
  }

  if (!rows.length) {
    return [
      textBlock(
        `지정한 품번(${bareCodes.join(', ') || named.join(', ')})의 데이터가 없습니다. (${periodNote})`,
        missing.length ? `미확인: ${missing.join(', ')}` : '',
      ),
    ]
  }

  const ascending =
    includesAny(n, ['낮은순', '낮은', '적은']) &&
    !includesAny(n, ['높은순', '높은', '많은'])
  const ranked = [...rows].sort((a, b) =>
    ascending ? a[metric] - b[metric] : b[metric] - a[metric],
  )

  const wantBar =
    includesAny(n, ['막대', '그래프', 'bar']) || ranked.length <= 8

  const blocks: AiBlock[] = [
    textBlock(
      `지정한 품번 ${orderKeys.length}개 중 ${metricLabel}${
        ascending ? '이 낮은' : '이 높은'
      } 순입니다. (${periodNote})`,
      missing.length
        ? `해당 기간 데이터 없음: ${missing.join(', ')}`
        : '',
    ),
    {
      type: 'table',
      title: `지정 품번 · ${metricLabel} ${ascending ? '낮은' : '높은'} 순`,
      headers: PRODUCT_HEADERS,
      rows: productTableRows(ranked),
    },
  ]

  if (wantBar) {
    blocks.push(
      barFromProducts(
        `지정 품번 · ${metricLabel} 비교`,
        ranked,
        metric,
        ranked.length,
      ),
    )
  }

  return blocks
}

function defectKeyMatch(defects: Record<string, number>, needle: string) {
  const n = compact(needle)
  return Object.keys(defects).find((k) => {
    const c = compact(k)
    return c.includes(n) || n.includes(c)
  })
}

function monthIndex(ymdStr: string) {
  const y = Number(ymdStr.slice(0, 4))
  const m = Number(ymdStr.slice(5, 7))
  return y * 12 + m
}

/** 시작~종료 포함 개월 수 (예: 5/1~7/31 → 3) */
function inclusiveMonthCount(startDate: string, endDate: string) {
  return Math.max(1, monthIndex(endDate) - monthIndex(startDate) + 1)
}

function monthLabel(ym: string) {
  const m = Number(ym.slice(5, 7))
  return `${m}월`
}

function eachYearMonth(startDate: string, endDate: string) {
  const out: string[] = []
  let y = Number(startDate.slice(0, 4))
  let m = Number(startDate.slice(5, 7))
  const endY = Number(endDate.slice(0, 4))
  const endM = Number(endDate.slice(5, 7))
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${pad2(m)}`)
    m += 1
    if (m > 12) {
      m = 1
      y += 1
    }
  }
  return out
}

function buildDefectDailyTrend(
  records: InspectionRecord[],
  product: string,
  defectNames: string[],
  period?: PeriodHint | null,
): {
  data: Record<string, string | number>[]
  series: AiChartSeries[]
  listRows: string[][]
  grain: 'day' | 'month'
} {
  const scoped = records.filter((r) => {
    if (!isAnalyzable(r) || compact(r.product) !== compact(product)) return false
    if (!period) return true
    return r.date >= period.startDate && r.date <= period.endDate
  })

  const useTotalFail = defectNames.length === 0
  const labels = useTotalFail ? ['부적합수량'] : defectNames
  const series: AiChartSeries[] = labels.map((name, i) => ({
    key: `d${i}`,
    label: name,
    color: LINE_COLORS[i % LINE_COLORS.length]!,
  }))

  const countFor = (list: InspectionRecord[], name: string) => {
    if (useTotalFail) return list.reduce((s, r) => s + r.fail, 0)
    let sum = 0
    for (const r of list) {
      const key = defectKeyMatch(r.defects, name)
      if (key) sum += r.defects[key] ?? 0
    }
    return sum
  }

  const sortedDates = [...scoped.map((r) => r.date)].sort()
  const spanStart = period?.startDate ?? sortedDates[0]
  const spanEnd = period?.endDate ?? sortedDates[sortedDates.length - 1]
  const grain: 'day' | 'month' =
    spanStart && spanEnd && inclusiveMonthCount(spanStart, spanEnd) >= 2
      ? 'month'
      : 'day'

  if (grain === 'month') {
    const byMonth = new Map<string, InspectionRecord[]>()
    for (const r of scoped) {
      const key = r.date.slice(0, 7)
      const list = byMonth.get(key) ?? []
      list.push(r)
      byMonth.set(key, list)
    }
    const months =
      spanStart && spanEnd
        ? eachYearMonth(spanStart, spanEnd)
        : [...byMonth.keys()].sort()

    const data = months.map((ym) => {
      const list = byMonth.get(ym) ?? []
      const row: Record<string, string | number> = { date: monthLabel(ym) }
      labels.forEach((name, i) => {
        row[`d${i}`] = countFor(list, name)
      })
      return row
    })

    const listRows: string[][] = []
    for (const ym of months) {
      const list = byMonth.get(ym) ?? []
      const counts = labels.map((name) => countFor(list, name))
      if (counts.every((c) => c === 0) && list.length === 0) continue
      listRows.push([
        monthLabel(ym),
        ...counts.map((c) => c.toLocaleString()),
        list.reduce((s, r) => s + r.qty, 0).toLocaleString(),
      ])
    }
    return { data, series, listRows, grain }
  }

  const byDate = new Map<string, InspectionRecord[]>()
  for (const r of scoped) {
    const list = byDate.get(r.date) ?? []
    list.push(r)
    byDate.set(r.date, list)
  }
  const dates = [...byDate.keys()].sort()

  const data = dates.map((date) => {
    const list = byDate.get(date) ?? []
    const row: Record<string, string | number> = { date }
    labels.forEach((name, i) => {
      row[`d${i}`] = countFor(list, name)
    })
    return row
  })

  const listRows: string[][] = []
  for (const date of dates) {
    const list = byDate.get(date) ?? []
    const counts = labels.map((name) => countFor(list, name))
    if (counts.every((c) => c === 0)) continue
    listRows.push([
      date,
      ...counts.map((c) => c.toLocaleString()),
      list.reduce((s, r) => s + r.qty, 0).toLocaleString(),
    ])
  }

  return { data, series, listRows, grain }
}

/** 여러 품번의 불량유형 건수를 합산해 비중 TOP N */
function topDefectNamesForProducts(
  records: InspectionRecord[],
  products: string[],
  period: PeriodHint | null,
  topN: number,
): { name: string; count: number; share: number }[] {
  const set = new Set(products.map((p) => compact(p)))
  const counts = new Map<string, number>()
  let total = 0
  for (const r of records) {
    if (!isAnalyzable(r) || !set.has(compact(r.product))) continue
    if (period && (r.date < period.startDate || r.date > period.endDate)) continue
    for (const [k, v] of Object.entries(r.defects ?? {})) {
      const n = Number(v) || 0
      if (n <= 0) continue
      counts.set(k, (counts.get(k) ?? 0) + n)
      total += n
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))
    .slice(0, Math.max(1, topN))
    .map(([name, count]) => ({
      name,
      count,
      share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }))
}

/** 여러 품번 × 지정 불량유형 월별/일별 추이 */
function buildMultiProductDefectTrend(
  records: InspectionRecord[],
  products: string[],
  defectNames: string[],
  period?: PeriodHint | null,
  forceMonth = false,
): {
  data: Record<string, string | number>[]
  series: AiChartSeries[]
  listRows: string[][]
  grain: 'day' | 'month'
} {
  const set = new Set(products.map((p) => compact(p)))
  const scoped = records.filter((r) => {
    if (!isAnalyzable(r) || !set.has(compact(r.product))) return false
    if (!period) return true
    return r.date >= period.startDate && r.date <= period.endDate
  })

  const labels = defectNames.length ? defectNames : ['부적합수량']
  const useTotalFail = defectNames.length === 0
  const series: AiChartSeries[] = labels.map((name, i) => ({
    key: `d${i}`,
    label: name,
    color: LINE_COLORS[i % LINE_COLORS.length]!,
  }))

  const countFor = (list: InspectionRecord[], name: string) => {
    if (useTotalFail) return list.reduce((s, r) => s + r.fail, 0)
    let sum = 0
    for (const r of list) {
      const key = defectKeyMatch(r.defects, name)
      if (key) sum += r.defects[key] ?? 0
    }
    return sum
  }

  const sortedDates = [...scoped.map((r) => r.date)].sort()
  const spanStart = period?.startDate ?? sortedDates[0]
  const spanEnd = period?.endDate ?? sortedDates[sortedDates.length - 1]
  const grain: 'day' | 'month' =
    forceMonth ||
    (spanStart && spanEnd && inclusiveMonthCount(spanStart, spanEnd) >= 2)
      ? 'month'
      : 'day'

  if (grain === 'month') {
    const byMonth = new Map<string, InspectionRecord[]>()
    for (const r of scoped) {
      const key = r.date.slice(0, 7)
      const list = byMonth.get(key) ?? []
      list.push(r)
      byMonth.set(key, list)
    }
    const months =
      spanStart && spanEnd
        ? eachYearMonth(spanStart, spanEnd)
        : [...byMonth.keys()].sort()

    const data = months.map((ym) => {
      const list = byMonth.get(ym) ?? []
      const row: Record<string, string | number> = { date: monthLabel(ym) }
      labels.forEach((name, i) => {
        row[`d${i}`] = countFor(list, name)
      })
      return row
    })

    const listRows: string[][] = []
    for (const ym of months) {
      const list = byMonth.get(ym) ?? []
      const counts = labels.map((name) => countFor(list, name))
      if (counts.every((c) => c === 0) && list.length === 0) continue
      listRows.push([
        monthLabel(ym),
        ...counts.map((c) => c.toLocaleString()),
        list.reduce((s, r) => s + r.qty, 0).toLocaleString(),
      ])
    }
    return { data, series, listRows, grain }
  }

  const byDate = new Map<string, InspectionRecord[]>()
  for (const r of scoped) {
    const list = byDate.get(r.date) ?? []
    list.push(r)
    byDate.set(r.date, list)
  }
  const dates = [...byDate.keys()].sort()
  const data = dates.map((date) => {
    const list = byDate.get(date) ?? []
    const row: Record<string, string | number> = { date }
    labels.forEach((name, i) => {
      row[`d${i}`] = countFor(list, name)
    })
    return row
  })
  const listRows: string[][] = []
  for (const date of dates) {
    const list = byDate.get(date) ?? []
    const counts = labels.map((name) => countFor(list, name))
    if (counts.every((c) => c === 0)) continue
    listRows.push([
      date,
      ...counts.map((c) => c.toLocaleString()),
      list.reduce((s, r) => s + r.qty, 0).toLocaleString(),
    ])
  }
  return { data, series, listRows, grain }
}

function isFollowUpAsk(n: string) {
  if (
    includesAny(n, [
      '방금',
      '방금전',
      '알려준',
      '이어서',
      '추가질문',
      '그리스트',
      '위리스트',
      '해당리스트',
      '그품번',
      '위품번',
      '해당품번',
      '리스트에서',
      '품번에서',
      '앞질문',
      '직전질문',
      '이어서질문',
      '이전리스트',
      '이전답변',
      '직전리스트',
      '그질문',
      '위질문',
      '같은품번',
      '동일품번',
      '그걸로',
      '그거로',
      '그것도',
      '도알려',
      '도보여',
    ])
  ) {
    return true
  }
  // "막대그래프로도" / "원그래프로도"  alone when continuing
  if (
    includesAny(n, ['그래프로도', '막대로도', '표로도', '리스트로도']) ||
    (includesAny(n, ['막대', '원형', '원그래프', '파이']) &&
      includesAny(n, ['도', '다시', '추가로']))
  ) {
    return true
  }
  return (
    includesAny(n, ['이전', '앞서', '직전']) &&
    includesAny(n, ['리스트', '품번', '답변', '결과', '알려', '질문'])
  )
}

/**
 * 직전 품번 컨텍스트가 있을 때, "방금" 없이도 후속으로 볼 짧은 질문
 * 예: "그럼 6월은?", "TOP 3만", "1위 원인", "R600027 자세히"
 */
function isSoftFollowUp(
  text: string,
  n: string,
  prior: AiConversationContext,
  period: PeriodHint | null,
): boolean {
  // 1) 기간만 변경
  if (period) {
    if (
      includesAny(n, [
        '그럼',
        '다시',
        '어때',
        '같은품번',
        '동일품번',
        '월로',
        '월은',
        '로다시',
        '기준으로',
      ])
    ) {
      return true
    }
    // "6월은?" / "5~7월로" 처럼 짧은 기간 질의
    if (text.trim().length <= 24) return true
  }

  // 2) 리스트 좁히기
  if (/(?:top|상위)\s*\d+\s*만|\d+\s*(?:개|위)\s*만/i.test(text)) return true
  if (includesAny(n, ['개만', '위만', '만보여', '만알려', '추려', '좁혀'])) {
    return true
  }
  if (parseQtyMinEa(text, n) != null || parsePpmMin(text, n) != null) return true
  if (
    hasExcludeIntent(n) &&
    findProductNames(n, prior.productNames).length > 0
  ) {
    return true
  }

  // 3) 드릴다운
  if (parseRankPick(text, n) != null) return true
  if (includesAny(n, ['원인', '자세히', '상세', '왜'])) return true
  if (
    findProductNames(n, prior.productNames).length === 1 &&
    includesAny(n, ['원인', '자세히', '상세', '왜', '분석', '알려', '보여'])
  ) {
    return true
  }

  return false
}

/** "1위", "2등", "3번째" → 1-based rank */
function parseRankPick(text: string, n: string): number | null {
  if (
    includesAny(n, [
      '1위',
      '1등',
      '첫번째',
      '1번째',
      '맨위',
      '최고',
      '제일높은',
      '가장높은',
    ])
  ) {
    return 1
  }
  const m = text.match(/(\d+)\s*(?:위|등|번째)/)
  if (m) {
    const v = Number(m[1])
    if (Number.isFinite(v) && v >= 1) return Math.min(v, 50)
  }
  return null
}

/** "TOP 3만", "상위5만", "3개만" */
function parseTopOnlyLimit(text: string, n: string): number | null {
  const m =
    text.match(/(?:top|TOP|상위)\s*(\d+)\s*만/i) ??
    text.match(/(\d+)\s*(?:개|위)\s*만/) ??
    n.match(/top(\d+)만/) ??
    n.match(/상위(\d+)만/)
  if (m?.[1]) {
    const v = Number(m[1])
    if (Number.isFinite(v) && v > 0) return Math.min(v, 50)
  }
  if (includesAny(n, ['개만', '위만', '만보여', '만알려', '추려', '좁혀'])) {
    const t = topN(text, 0)
    return t > 0 ? t : null
  }
  return null
}

function buildProductDrillDown(
  product: ProductRow,
  periodNote: string,
  priorQuestion: string,
  rankLabel?: string,
): AiBlock[] {
  const blocks: AiBlock[] = [
    textBlock(
      rankLabel
        ? `${rankLabel} ${product.name}(${product.type}) 품질 상세입니다. (${periodNote})`
        : `${product.name}(${product.type}) 품질 상세입니다. (${periodNote})`,
      `직전 질문: ${priorQuestion}`,
      `검수량 ${product.qty.toLocaleString()} EA · 부적합 ${product.fail.toLocaleString()} · 부적합률 ${formatPpm(product.failRate)}`,
      `폐기비용 ${formatWon(product.scrapCost)} · 주요 불량 ${product.mainDefect || '-'}`,
      product.defectSummary && product.defectSummary !== '-'
        ? `불량 내역: ${product.defectSummary}`
        : '',
    ),
    {
      type: 'table',
      title: `${product.name} 요약`,
      headers: PRODUCT_HEADERS,
      rows: productTableRows([product]),
    },
  ]
  if (product.defects?.length) {
    blocks.push({
      type: 'pie',
      title: `${product.name} 불량유형 (원인)`,
      data: product.defects.map((d) => ({
        name: d.name,
        value: d.count,
        share: d.share,
      })),
    })
  }
  return blocks
}

function inferMetricFromText(n: string): 'failRate' | 'qty' | 'scrapCost' | null {
  if (includesAny(n, ['폐기', '비용'])) return 'scrapCost'
  // "검수량 10000ea 이상만"은 필터이지 검수량 순 정렬이 아님
  if (
    includesAny(n, ['검수량', '검사량']) &&
    !includesAny(n, ['부적합', '불량']) &&
    !includesAny(n, ['이상'])
  ) {
    return 'qty'
  }
  if (
    includesAny(n, [
      '부적합',
      '불량률',
      '불량율',
      '부적합률',
      '부적합율',
      '불량',
    ])
  ) {
    return 'failRate'
  }
  return null
}

function metricLabelOf(metric: 'failRate' | 'qty' | 'scrapCost') {
  return metric === 'qty'
    ? '검수량'
    : metric === 'scrapCost'
      ? '폐기비용'
      : '부적합률'
}

/** 지정 품번을 기간 집계 후 ProductRow로 반환 (질문 순서 유지) */
function productRowsForNames(
  records: InspectionRecord[],
  productNames: string[],
  period: PeriodHint | null,
): ProductRow[] {
  const ga = analyzeRecords(records, baseFilters('all', period))
  const map = new Map(ga.products.map((p) => [compact(p.name), p] as const))
  const rows: ProductRow[] = []
  for (const name of productNames) {
    const hit = map.get(compact(name))
    if (hit) {
      rows.push(hit)
      continue
    }
    rows.push({
      id: name,
      name,
      type: '-',
      qty: 0,
      pass: 0,
      fail: 0,
      failTotal: 0,
      failRate: 0,
      hours: 0,
      minutes: 0,
      uph: 0,
      mainDefect: '-',
      defects: [],
      defectSummary: '-',
      scrapCost: 0,
      status: '정상',
      changeRate: 0,
    })
  }
  return rows
}

/** 답변 블록(품번 표)에서 후속 질문용 컨텍스트 추출 */
function buildContextFromBlocks(
  question: string,
  blocks: AiBlock[],
): AiConversationContext | null {
  const scopes: { label: string; productNames: string[] }[] = []
  const all = new Set<string>()

  for (const b of blocks) {
    if (b.type !== 'table') continue
    const idx = b.headers.findIndex((h) => h === '품번' || h.includes('품번'))
    if (idx < 0) continue
    if (includesAny(compact(b.title), ['폐기비용높은순', '폐기비용순'])) continue

    const names = b.rows
      .map((r) => String(r[idx] ?? '').trim())
      .filter((name) => name && name !== '-')
    if (!names.length) continue
    for (const name of names) all.add(name)

    const label = b.title.split('·')[0]?.trim() || '전체'
    const existing = scopes.find((s) => s.label === label)
    if (existing) {
      const merged = new Set([...existing.productNames, ...names])
      existing.productNames = [...merged]
    } else {
      scopes.push({ label, productNames: [...names] })
    }
  }

  // 표가 없어도 막대 차트에서 품번 복원
  if (!all.size) {
    for (const b of blocks) {
      if (b.type !== 'bar') continue
      for (const d of b.data) {
        const name = String(d.name ?? '').trim()
        if (name && name !== '-') all.add(name)
      }
    }
    if (all.size) {
      scopes.push({ label: '이전 리스트', productNames: [...all] })
    }
  }

  if (!all.size) return null

  const qn = compact(question)
  const lastMetric = inferMetricFromText(qn) ?? 'failRate'
  // period는 answerQuestion에서 주입할 수 있도록 question만 보관
  return {
    lastQuestion: question,
    productNames: [...all],
    scopes,
    lastMetric,
  }
}

function yearSpanPeriod(records: InspectionRecord[]): PeriodHint {
  const year = inferDataYear(records)
  return {
    startDate: ymd(year, 1, 1),
    endDate: ymd(year, 12, lastDayOfMonth(year, 12)),
    label: `${year}년 1~12월`,
  }
}

/** 질문 문장에서 특정 불량유형명(BURR, 이물 등) 추출 */
function findNamedDefectType(
  n: string,
  records: InspectionRecord[],
  products: string[],
): string | null {
  const names = new Set<string>(KNOWN_DEFECT_TYPES.map(String))
  const productSet = new Set(products.map((p) => compact(p)))
  for (const r of records) {
    if (productSet.size && !productSet.has(compact(r.product))) continue
    for (const k of Object.keys(r.defects ?? {})) {
      if (k.trim()) names.add(k)
    }
  }
  const sorted = [...names].sort(
    (a, b) => compact(b).length - compact(a).length || a.localeCompare(b, 'ko'),
  )
  for (const name of sorted) {
    const c = compact(name)
    if (c.length < 2) continue
    if (n.includes(c)) return name
  }
  return null
}

type ProductDefectShareRow = {
  name: string
  type: string
  qty: number
  fail: number
  failRate: number
  defectCount: number
  /** 해당 유형이 품번 불량 중 차지하는 비중(%) */
  share: number
  scrapCost: number
}

/** 이전 리스트 품번별 특정 불량유형 비중 */
function rankProductsByDefectShare(
  records: InspectionRecord[],
  products: string[],
  defectName: string,
  period: PeriodHint | null,
): ProductDefectShareRow[] {
  const order = new Map(products.map((p, i) => [compact(p), i]))
  const productSet = new Set(order.keys())
  const agg = new Map<
    string,
    {
      name: string
      type: string
      qty: number
      fail: number
      defectCount: number
      defectTotal: number
      scrapCost: number
    }
  >()

  for (const r of records) {
    const key = compact(r.product)
    if (!productSet.has(key) || !isAnalyzable(r)) continue
    if (period && (r.date < period.startDate || r.date > period.endDate)) continue

    const prev = agg.get(key) ?? {
      name: r.product,
      type: r.productType || '-',
      qty: 0,
      fail: 0,
      defectCount: 0,
      defectTotal: 0,
      scrapCost: 0,
    }
    prev.qty += r.qty
    prev.fail += r.fail
    prev.scrapCost += r.scrapCost
    if (r.productType) prev.type = r.productType

    const matched = defectKeyMatch(r.defects ?? {}, defectName)
    if (matched) prev.defectCount += r.defects[matched] ?? 0
    for (const v of Object.values(r.defects ?? {})) {
      prev.defectTotal += Number(v) || 0
    }
    agg.set(key, prev)
  }

  const rows: ProductDefectShareRow[] = []
  for (const p of products) {
    const hit = agg.get(compact(p))
    if (!hit) {
      rows.push({
        name: p,
        type: '-',
        qty: 0,
        fail: 0,
        failRate: 0,
        defectCount: 0,
        share: 0,
        scrapCost: 0,
      })
      continue
    }
    const denom = hit.defectTotal > 0 ? hit.defectTotal : hit.fail
    rows.push({
      name: hit.name,
      type: hit.type,
      qty: hit.qty,
      fail: hit.fail,
      failRate: hit.qty > 0 ? Math.round((hit.fail / hit.qty) * 1_000_000) : 0,
      defectCount: hit.defectCount,
      share: denom > 0 ? Math.round((hit.defectCount / denom) * 1000) / 10 : 0,
      scrapCost: hit.scrapCost,
    })
  }

  return rows.sort(
    (a, b) =>
      b.share - a.share ||
      b.defectCount - a.defectCount ||
      (order.get(compact(a.name)) ?? 0) - (order.get(compact(b.name)) ?? 0),
  )
}

/** 직전 품번 리스트 기준 후속 질문 */
function tryAnswerFollowUp(
  text: string,
  n: string,
  records: InspectionRecord[],
  prior: AiConversationContext,
  period: PeriodHint | null,
  periodNote: string,
  limit: number,
): AiBlock[] | null {
  if (!prior.productNames.length) return null

  // 후속 질문에 기간이 없으면 직전 질문 기간을 이어받음
  const effectivePeriod =
    period ??
    prior.lastPeriod ??
    parsePeriodFromQuestion(prior.lastQuestion, records)
  const effectiveNote = effectivePeriod
    ? `기간: ${effectivePeriod.label}`
    : periodNote
  const periodChanged = Boolean(period)

  const metricFromFollow = inferMetricFromText(n)
  const metric: 'failRate' | 'qty' | 'scrapCost' =
    metricFromFollow ??
    prior.lastMetric ??
    inferMetricFromText(compact(prior.lastQuestion)) ??
    'failRate'
  const metricLabel = metricLabelOf(metric)
  const ascending =
    includesAny(n, ['낮은순', '낮은', '적은']) &&
    !includesAny(n, ['높은순', '높은', '많은'])

  const namedDefect = findNamedDefectType(n, records, prior.productNames)
  const wantsChart =
    includesAny(n, ['선', '그래프', '추이', '변동', '월별', '막대']) &&
    !includesAny(n, ['리스트업', '리스트해', '목록'])
  const wantsNamedDefectList =
    Boolean(namedDefect) &&
    (includesAny(n, [
      '리스트',
      '리스트업',
      '목록',
      '순서대로',
      '순서',
      '순위',
      '높은순',
    ]) ||
      (includesAny(n, ['비중', '높은']) && !wantsChart))

  const scopes =
    prior.scopes.length > 0
      ? prior.scopes
      : [{ label: '이전 리스트', productNames: prior.productNames }]

  // ── 3) 드릴다운: 1위 / N위 / 특정 품번 원인·자세히 ──
  const rankPick = parseRankPick(text, n)
  const namedInPrior = findProductNames(n, prior.productNames)
  const wantsDetailWords = includesAny(n, [
    '원인',
    '자세히',
    '상세',
    '왜',
    '분석',
  ])
  // 불량유형 비중 리스트와 겹치지 않게
  if (
    !wantsNamedDefectList &&
    (rankPick != null ||
      (wantsDetailWords && namedInPrior.length <= 1) ||
      (namedInPrior.length === 1 && wantsDetailWords))
  ) {
    const baseNames =
      scopes.length === 1
        ? scopes[0]!.productNames
        : prior.productNames
    const rows = productRowsForNames(records, baseNames, effectivePeriod)
    const ranked = [...rows].sort((a, b) =>
      ascending ? a[metric] - b[metric] : b[metric] - a[metric],
    )
    let target: ProductRow | null = null
    let rankLabel: string | undefined
    if (namedInPrior.length === 1) {
      const key = compact(namedInPrior[0]!)
      target = ranked.find((r) => compact(r.name) === key) ?? null
    } else if (rankPick != null) {
      target = ranked[rankPick - 1] ?? null
      rankLabel = `${rankPick}위`
    } else if (wantsDetailWords) {
      target = ranked[0] ?? null
      rankLabel = '1위'
    }
    if (!target) {
      return [
        textBlock(
          `이전 리스트에서 해당 품번을 찾지 못했습니다. (${effectiveNote})`,
          `대상: ${prior.productNames.slice(0, 12).join(', ')}${
            prior.productNames.length > 12 ? ' …' : ''
          }`,
        ),
      ]
    }
    return buildProductDrillDown(
      target,
      effectiveNote,
      prior.lastQuestion,
      rankLabel,
    )
  }

  // ── 특정 불량유형(BURR 등) 비중 순 리스트 ──
  if (namedDefect && wantsNamedDefectList) {
    const wantBar =
      includesAny(n, ['막대', '그래프', 'bar']) &&
      !includesAny(n, ['선그래프', '선으로'])
    const blocks: AiBlock[] = [
      textBlock(
        `이전 리스트 품번 중 ${namedDefect} 비중이 높은 순입니다. (${effectiveNote})`,
        `직전 질문: ${prior.lastQuestion}`,
      ),
    ]

    for (const scope of scopes) {
      const ranked = rankProductsByDefectShare(
        records,
        scope.productNames,
        namedDefect,
        effectivePeriod,
      )
      if (!ranked.length) {
        blocks.push(textBlock(`${scope.label}: 대상 품번이 없습니다.`))
        continue
      }
      const withDefect = ranked.filter((r) => r.defectCount > 0)
      blocks.push({
        type: 'table',
        title: `${scope.label} · ${namedDefect} 비중 높은 순 (${ranked.length}개)`,
        headers: [
          '순위',
          '품번',
          '유형',
          `${namedDefect} 건수`,
          `${namedDefect} 비중`,
          '부적합률',
          '검수량',
        ],
        rows: ranked.map((r, i) => [
          String(i + 1),
          r.name,
          r.type,
          r.defectCount.toLocaleString(),
          formatPercent(r.share),
          formatPpm(r.failRate),
          `${r.qty.toLocaleString()} EA`,
        ]),
      })
      if (wantBar) {
        const top = (withDefect.length ? withDefect : ranked).slice(
          0,
          Math.min(limit, Math.max(ranked.length, 5)),
        )
        blocks.push({
          type: 'bar',
          title: `${scope.label} · ${namedDefect} 비중 TOP ${top.length}`,
          format: 'percent',
          valueLabel: `${namedDefect} 비중`,
          data: top.map((r) => ({ name: r.name, value: r.share })),
        })
      }
    }
    return blocks
  }

  const wantsDefectTrend =
    includesAny(n, ['불량유형', '불량종류', '불량']) &&
    (includesAny(n, ['비중', '높은', 'top', '상위', '많은']) ||
      includesAny(n, ['유형'])) &&
    includesAny(n, ['선', '그래프', '추이', '변동', '월별', '막대'])

  if (wantsDefectTrend) {
    const defectTop = topNNear(
      text,
      ['유형', '불량유형', '불량종류', '불량'],
      Math.min(Math.max(limit, 2), 5),
    )
    const forceMonth =
      (/1\s*월/.test(text) && /12\s*월/.test(text)) ||
      includesAny(n, ['월별', '월간', '1월', '12월'])
    const span =
      effectivePeriod ??
      (forceMonth || includesAny(n, ['올해', '연간'])
        ? yearSpanPeriod(records)
        : null)
    const note = span ? `기간: ${span.label}` : effectiveNote
    const useBar =
      includesAny(n, ['막대그래프', '막대']) &&
      !includesAny(n, ['선그래프', '선으로', '선그'])

    const blocks: AiBlock[] = [
      textBlock(
        `이전 답변 리스트 기준으로 불량유형 비중 TOP ${defectTop}의 ${
          forceMonth || span ? '월별' : ''
        } 추이입니다. (${note})`,
        `직전 질문: ${prior.lastQuestion}`,
      ),
    ]

    for (const scope of scopes) {
      const tops = topDefectNamesForProducts(
        records,
        scope.productNames,
        span,
        defectTop,
      )
      if (!tops.length) {
        blocks.push(
          textBlock(
            `${scope.label}: 대상 품번 ${scope.productNames.length}개에서 불량유형 데이터가 없습니다.`,
          ),
        )
        continue
      }
      const names = tops.map((t) => t.name)
      const { data, series, listRows, grain } = buildMultiProductDefectTrend(
        records,
        scope.productNames,
        names,
        span,
        forceMonth || Boolean(span),
      )
      if (!data.length) {
        blocks.push(textBlock(`${scope.label}: 추이 데이터가 없습니다.`))
        continue
      }
      const grainLabel = grain === 'month' ? '월별' : '날짜별'
      blocks.push(
        textBlock(
          `${scope.label} · 품번 ${scope.productNames.length}개 · TOP 유형: ${tops
            .map((t) => `${t.name} ${t.share}%`)
            .join(', ')}`,
        ),
      )
      if (useBar) {
        blocks.push({
          type: 'multiBar',
          title: `${scope.label} · 불량유형 TOP ${names.length} ${grainLabel} 추이`,
          data,
          xKey: 'date',
          series,
          format: 'count',
        })
      } else {
        blocks.push({
          type: 'line',
          title: `${scope.label} · 불량유형 TOP ${names.length} ${grainLabel} 추이 (한 그래프)`,
          data,
          xKey: 'date',
          series,
          format: 'count',
        })
      }
      if (includesAny(n, ['리스트', '표', '상세'])) {
        blocks.push({
          type: 'table',
          title: `${scope.label} · ${names.join('/')} ${grainLabel} 발생`,
          headers: [
            grain === 'month' ? '월' : '날짜',
            ...names.map((d) => `${d}(건)`),
            '검수량',
          ],
          rows: listRows,
        })
      }
    }

    return blocks
  }

  // ── 1·2) 기간 변경 / 리스트 좁히기 / 막대·지표 재표시 ──
  const wantBar =
    includesAny(n, ['막대', 'bar']) ||
    (includesAny(n, ['그래프로도', '그래프로']) &&
      !includesAny(n, ['선그래프', '선으로', '원그래프', '원형', '파이']))
  const wantPie = includesAny(n, ['원형', '원그래프', '파이', '도넛'])
  const topOnly = parseTopOnlyLimit(text, n)
  const qtyMin = parseQtyMinEa(text, n)
  const ppmMin = parsePpmMin(text, n)
  const excludedNames =
    hasExcludeIntent(n) && excludedTypeHint(n) == null
      ? findProductNames(n, prior.productNames)
      : []
  const wantsNarrow =
    topOnly != null ||
    qtyMin != null ||
    ppmMin != null ||
    excludedNames.length > 0

  const wantsRerankOrChart =
    wantBar ||
    wantPie ||
    metricFromFollow != null ||
    periodChanged ||
    wantsNarrow ||
    includesAny(n, [
      '순으로',
      '높은순',
      '낮은순',
      '순위',
      '다시',
      '재정렬',
      '알려',
      '보여',
      '그래프로도',
      '막대로도',
      '표로도',
      '도알려',
      '도보여',
      '그럼',
      '어때',
    ])

  if (wantsRerankOrChart) {
    const filterNotes: string[] = []
    if (excludedNames.length) {
      filterNotes.push(`${excludedNames.join(', ')} 제외`)
    }
    if (qtyMin != null) {
      filterNotes.push(`검수량 ≥ ${qtyMin.toLocaleString()}EA`)
    }
    if (ppmMin != null) {
      filterNotes.push(`부적합률 ≥ ${ppmMin.toLocaleString()}ppm`)
    }
    if (topOnly != null) {
      filterNotes.push(`TOP ${topOnly}만`)
    }

    const head = periodChanged
      ? `이전 리스트를 ${effectivePeriod?.label ?? '해당 기간'} 기준으로 다시 집계했습니다.`
      : `이전 리스트 품번 ${prior.productNames.length}개의 ${metricLabel}${
          ascending ? '이 낮은' : '이 높은'
        } 순입니다.`

    const blocks: AiBlock[] = [
      textBlock(
        `${head}${wantBar ? ' 막대그래프로 표시합니다.' : ''}${
          wantPie ? ' 불량유형 원그래프도 포함합니다.' : ''
        }${filterNotes.length ? ` (${filterNotes.join(' · ')})` : ''} (${effectiveNote})`,
        `직전 질문: ${prior.lastQuestion}`,
      ),
    ]

    for (const scope of scopes) {
      let names = scope.productNames
      if (excludedNames.length) {
        const ex = new Set(excludedNames.map((p) => compact(p)))
        names = names.filter((p) => !ex.has(compact(p)))
      }
      const rows = productRowsForNames(records, names, effectivePeriod)
      let ranked = [...rows].sort((a, b) =>
        ascending ? a[metric] - b[metric] : b[metric] - a[metric],
      )
      if (qtyMin != null) ranked = ranked.filter((p) => p.qty >= qtyMin)
      if (ppmMin != null) ranked = ranked.filter((p) => p.failRate >= ppmMin)
      const withData = ranked.filter((r) => r.qty > 0 || r.fail > 0)
      let show = withData.length ? withData : ranked
      if (topOnly != null) show = show.slice(0, topOnly)

      if (!show.length) {
        blocks.push(
          textBlock(
            `${scope.label}: 조건에 맞는 품번이 없습니다.${
              filterNotes.length ? ` (${filterNotes.join(' · ')})` : ''
            }`,
          ),
        )
        continue
      }

      blocks.push({
        type: 'table',
        title: `${scope.label} · ${metricLabel} ${ascending ? '낮은' : '높은'} 순${
          topOnly != null ? ` TOP ${show.length}` : ''
        }`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(show),
      })
      if (wantBar || periodChanged || wantsNarrow) {
        blocks.push(
          barFromProducts(
            `${scope.label} · ${metricLabel} 비교 (막대)`,
            show,
            metric,
            show.length,
          ),
        )
      }
      if (wantPie) {
        const defectCounts = new Map<string, number>()
        let total = 0
        for (const p of show) {
          for (const d of p.defects ?? []) {
            defectCounts.set(d.name, (defectCounts.get(d.name) ?? 0) + d.count)
            total += d.count
          }
        }
        const pieData = [...defectCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({
            name,
            value: count,
            share: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
          }))
        if (pieData.length) {
          blocks.push({
            type: 'pie',
            title: `${scope.label} · 불량유형 구성(%)`,
            data: pieData,
          })
        }
      }
    }
    return blocks
  }

  // 인식은 됐지만 구체 요청이 애매할 때 — 직전 지표 표+막대
  {
    const blocks: AiBlock[] = [
      textBlock(
        `이전 리스트 품번 ${prior.productNames.length}개를 ${metricLabel} 기준으로 다시 정리했습니다. (${effectiveNote})`,
        `직전 질문: ${prior.lastQuestion}`,
        '이어서 "그럼 6월은?", "TOP 3만", "1위 원인", "막대그래프로", "폐기비용 순으로"처럼 요청할 수 있습니다.',
      ),
    ]
    for (const scope of scopes) {
      const rows = productRowsForNames(
        records,
        scope.productNames,
        effectivePeriod,
      )
      const ranked = [...rows].sort((a, b) => b[metric] - a[metric])
      blocks.push({
        type: 'table',
        title: `${scope.label} · ${metricLabel} 높은 순`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(ranked),
      })
      blocks.push(
        barFromProducts(
          `${scope.label} · ${metricLabel} 비교`,
          ranked,
          metric,
          ranked.length,
        ),
      )
    }
    return blocks
  }
}

function buildGroupedMonthly(
  analytics: Analytics,
  metric: 'failRate' | 'qty' | 'scrapCost',
  asMillion = false,
): Record<string, string | number>[] {
  const totals = analytics.dailyTrends
  const groups = analytics.groupTrends
  return totals.map((t, i) => {
    const rawTotal = t[metric]
    const row: Record<string, string | number> = {
      date: t.date,
      total: asMillion ? toMillion(rawTotal) : rawTotal,
    }
    for (const g of groups) {
      const v = g.trends[i]?.[metric] ?? 0
      row[g.id] = asMillion ? toMillion(v) : v
    }
    return row
  })
}

function splitQueryParts(q: string): string[] {
  const normalized = q
    .replace(/\r\n/g, '\n')
    .replace(/[※*]/g, '\n')
    .replace(/(주로\s*(월간|일간|주간)[^\n]*)/g, '\n')
  const parts = normalized
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 8)
    .filter((s) => !/^(주로|단위로)/.test(s))
  if (parts.length <= 1) return [q.trim()].filter(Boolean)
  return parts
}

function answerOne(
  q: string,
  analytics: Analytics,
  records: InspectionRecord[],
  priorContext?: AiConversationContext | null,
): AiBlock[] {
  const text = q.trim()
  const n = compact(text)
  if (!text) return [textBlock('질문을 입력하세요.')]

  const limit = topN(text)
  const { groups, grommetOverall } = detectGroups(n)
  const period = parsePeriodFromQuestion(text, records)
  const periodNote = period ? `기간: ${period.label}` : '기간: 올해(연간)'
  const scopedAnalytics = period
    ? analyzeRecords(records, baseFilters('all', period))
    : analytics

  // ── 후속 질문 (직전 품번 리스트 이어받기) ──
  if (
    priorContext?.productNames.length &&
    (isFollowUpAsk(n) || isSoftFollowUp(text, n, priorContext, period))
  ) {
    const follow = tryAnswerFollowUp(
      text,
      n,
      records,
      priorContext,
      period,
      periodNote,
      limit,
    )
    if (follow) return follow
  }
  if (isFollowUpAsk(n) && !priorContext?.productNames.length) {
    return [
      textBlock(
        '이어 질문할 이전 품번 리스트가 없습니다. 먼저 품번 TOP 리스트를 질문한 뒤, "방금 알려준 리스트에서…"로 이어서 질문해 주세요.',
      ),
    ]
  }

  // ── 지정 품번 여러 개 비교·순위 (전체 TOP보다 우선) ──
  // 예: "R602514, R600031 … 중 7월 부적합률이 높은 품번순으로"
  {
    const namedCompare = tryAnswerNamedProductCompare(
      text,
      n,
      scopedAnalytics,
      periodNote,
    )
    if (namedCompare) return namedCompare
  }

  // ── 월별 그룹 추이 (막대 3 + TOTAL 선) ──
  const monthlyTrendAsk =
    (includesAny(n, ['월별', '월간']) ||
      (/1\s*월/.test(text) && /12\s*월/.test(text)) ||
      (includesAny(n, ['total', '합계', '선그래프', '선으로']) &&
        includesAny(n, ['막대']) &&
        groups.length >= 2)) &&
    includesAny(n, ['부적합', '폐기', '검수', 'ppm', '그래프', '추이'])
  if (monthlyTrendAsk) {
    const metrics: {
      key: 'failRate' | 'scrapCost' | 'qty'
      title: string
      format: AiValueFormat
      million?: boolean
    }[] = []
    if (includesAny(n, ['부적합', 'ppm'])) {
      metrics.push({
        key: 'failRate',
        title: '월별 부적합율(PPM)',
        format: 'ppm',
      })
    }
    if (includesAny(n, ['폐기', '비용', '백만'])) {
      metrics.push({
        key: 'scrapCost',
        title: '월별 폐기비용(백만원)',
        format: 'million',
        million: true,
      })
    }
    if (includesAny(n, ['검수'])) {
      metrics.push({ key: 'qty', title: '월별 검수량', format: 'qty' })
    }
    if (!metrics.length) {
      metrics.push(
        { key: 'failRate', title: '월별 부적합율(PPM)', format: 'ppm' },
        {
          key: 'scrapCost',
          title: '월별 폐기비용(백만원)',
          format: 'million',
          million: true,
        },
        { key: 'qty', title: '월별 검수량', format: 'qty' },
      )
    }

    const bars = chartGroupBars()
    // 막대만 요청하면 TOTAL 선 제외 (선/TOTAL/합계를 명시한 경우에만 선 추가)
    const wantTotalLine = includesAny(n, [
      '선그래프',
      '선으로',
      'total',
      '합계',
      '총합',
      '합계선',
    ])
    const line: AiChartSeries | undefined = wantTotalLine
      ? {
          key: 'total',
          label: 'TOTAL',
          color: GROUP_COLORS.total!,
        }
      : undefined

    return [
      textBlock(
        wantTotalLine
          ? '본사(SEAL)·본사(유압+그로멧)·2공장은 막대, TOTAL은 선으로 표시한 월별(1~12월) 추이입니다.'
          : '본사(SEAL)·본사(유압+그로멧)·2공장 막대로 표시한 월별(1~12월) 추이입니다.',
      ),
      ...metrics.map((m) => ({
        type: 'composed' as const,
        title: m.title,
        description: wantTotalLine
          ? '막대: 본사(SEAL) / 본사(유압+그로멧) / 2공장 · 선: TOTAL'
          : '막대: 본사(SEAL) / 본사(유압+그로멧) / 2공장',
        data: buildGroupedMonthly(analytics, m.key, m.million),
        xKey: 'date',
        bars,
        line,
        format: m.format,
      })),
    ]
  }

  // ── 특정 품번 불량 유형 추이 ──
  const defectTrendHit =
    includesAny(n, ['이물', '변형', '흠집']) &&
    includesAny(n, ['변동', '추이', '선그래프', '막대그래프', '막대', '날짜별'])
  // 불량유형+원그래프(그룹 TOP)와 구분 — 추이/변동/날짜별이 있을 때만
  if (
    defectTrendHit ||
    (includesAny(n, ['불량유형', '불량']) &&
      includesAny(n, ['추이', '변동', '날짜별', '변동성']) &&
      includesAny(n, ['그래프', '막대', '선']))
  ) {
    const productName =
      findProductName(n, scopedAnalytics.filterOptions.products) ??
      findProductName(n, scopedAnalytics.products.map((p) => p.name))
    if (productName) {
      const wanted: string[] = []
      if (n.includes('이물')) wanted.push('이물')
      if (n.includes('변형')) wanted.push('변형')
      if (n.includes('흠집')) wanted.push('흠집')
      // 유형 미지정 → 전체 부적합수량 추이 (이물로 가정하지 않음)

      const { data, series, listRows, grain } = buildDefectDailyTrend(
        records,
        productName,
        wanted,
        period,
      )
      if (!data.length) {
        return [textBlock(`${productName}의 해당 불량 유형 데이터가 없습니다. (${periodNote})`)]
      }
      const topic = wanted.length ? wanted.join('/') : '전체 부적합'
      const useBar =
        includesAny(n, ['막대그래프', '막대']) && !includesAny(n, ['선그래프', '선으로'])
      const chartLabel = useBar ? '막대' : '선'
      const grainLabel = grain === 'month' ? '월별' : '날짜별'
      const blocks: AiBlock[] = [
        textBlock(
          `${productName} · ${topic} 불량 변동성(${grainLabel}, ${chartLabel}그래프)입니다. (${periodNote})`,
        ),
        useBar
          ? {
              type: 'multiBar',
              title: `${productName} ${topic} 불량 추이 (${grainLabel})`,
              data,
              xKey: 'date',
              series,
              format: 'count',
            }
          : {
              type: 'line',
              title: `${productName} ${topic} 불량 추이 (${grainLabel})`,
              data,
              xKey: 'date',
              series,
              format: 'count',
            },
      ]
      if (n.includes('흠집') || n.includes('리스트') || n.includes('날짜별') || n.includes('월별')) {
        blocks.push({
          type: 'table',
          title: `${productName} · ${topic} ${grainLabel} 발생`,
          headers: [
            grain === 'month' ? '월' : '날짜',
            ...(wanted.length ? wanted.map((d) => `${d}(건)`) : ['부적합수량']),
            '검수량',
          ],
          rows: listRows,
        })
      }
      return blocks
    }
  }

  // ── 검수량 TOP30 중 폐기비용 순 ──
  if (
    includesAny(n, ['검수량']) &&
    includesAny(n, ['top30', '상위30', '30까지', '30개']) &&
    includesAny(n, ['폐기'])
  ) {
    const targets = groups.length ? groups : GROUP_ALIASES
    const blocks: AiBlock[] = [
      textBlock(
        `검수량 TOP 30 품번을 뽑은 뒤, 폐기비용 높은 순으로 정렬했습니다. (${periodNote})`,
      ),
    ]
    const wantBar =
      includesAny(n, ['막대', '그래프']) || includesAny(n, ['top5', '상위5', '5개'])
    const grommetFilter = includesAny(n, ['grommet', '그로멧', '그로메트'])
    for (const g of targets) {
      const ga = analyzeGroup(records, g.id, period)
      let products = [...ga.products]
      if (grommetFilter && g.id === 'plant2') {
        const only = products.filter(isGrommetLikeProduct)
        if (only.length) products = only
      }
      const top30 = products.sort((a, b) => b.qty - a.qty).slice(0, 30)
      const byCost = [...top30].sort((a, b) => b.scrapCost - a.scrapCost)
      blocks.push({
        type: 'table',
        title: `${g.label} · 검수량 TOP 30 중 폐기비용 순 (${period?.label ?? '올해'})`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(byCost),
      })
      if (wantBar) {
        blocks.push(
          barFromProducts(
            `${g.label} · 폐기비용 TOP 5 (검수량 TOP30 내, ${period?.label ?? '올해'})`,
            byCost,
            'scrapCost',
          ),
        )
      }
    }
    return blocks
  }

  // ── 검수량 N EA 이상 + 부적합률 TOP (+ 막대 / 폐기비용 재정렬 리스트) ──
  // "SEAL 검수량 100000EA 이상, 부적합률 TOP10 리스트 · TOP5 막대"
  // "7월 검수량 10000ea 이상, 부적합률 높은 TOP5 막대 + TOP5를 폐기비용 순 리스트"
  const qtyMinEa = parseQtyMinEa(text, n)
  if (
    qtyMinEa != null &&
    includesAny(n, [
      '부적합',
      '불량률',
      '불량율',
      '부적합률',
      '부적합율',
      '불량',
    ])
  ) {
    const listN = topNNear(
      text,
      ['리스트', '리스트업', '목록'],
      topN(text),
    )
    const wantBar = includesAny(n, ['막대', '그래프', 'bar'])
    const barN = wantBar
      ? topNNear(text, ['막대', '막대그래프'], Math.min(listN, 5))
      : 0
    // 폐기비용 재정렬은 "폐기"를 명시한 경우만 (리스트업 ≠ 폐기순)
    const wantScrapList = includesAny(n, ['폐기'])

    const targets = resolveAnswerScopes(groups)

    const blocks: AiBlock[] = [
      textBlock(
        `검수량 ${qtyMinEa.toLocaleString()}EA 이상인 품번 중 부적합률 TOP ${listN}입니다.${
          wantBar ? ` TOP ${barN}은 막대그래프로 표시합니다.` : ''
        }${
          wantScrapList
            ? ' 동일 TOP 품번을 폐기비용 높은 순으로도 정리했습니다.'
            : ''
        } (${periodNote})`,
      ),
    ]

    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const filtered = ga.products
        .filter((p) => p.qty >= qtyMinEa)
        .sort((a, b) => b.failRate - a.failRate)
      const topByFail = filtered.slice(0, listN)

      if (!topByFail.length) {
        blocks.push(
          textBlock(
            `${g.label}: 검수량 ${qtyMinEa.toLocaleString()}EA 이상 품번이 없습니다.`,
          ),
        )
        continue
      }

      blocks.push({
        type: 'table',
        title: `${g.label} · 부적합률 TOP ${topByFail.length} (검수량 ≥ ${qtyMinEa.toLocaleString()}EA)`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(topByFail),
      })
      if (wantBar && barN > 0) {
        blocks.push(
          barFromProducts(
            `${g.label} · 부적합률 TOP ${Math.min(barN, topByFail.length)} (검수량 ≥ ${qtyMinEa.toLocaleString()}EA)`,
            topByFail,
            'failRate',
            barN,
          ),
        )
      }
      if (wantScrapList) {
        const byScrap = [...topByFail].sort((a, b) => b.scrapCost - a.scrapCost)
        blocks.push({
          type: 'table',
          title: `${g.label} · 위 TOP ${byScrap.length} 품번 · 폐기비용 높은 순`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(byScrap),
        })
      }
    }
    return blocks
  }

  // ── PPM 임계값 (10000ppm 이상 등) + TOP / 막대 / 폐기비용 리스트 ──
  // 그룹 미지정 → 전체 (검수량 EA 필터와 동일). 상대·OR 규칙은 별도.
  if (isPpmThresholdAsk(n, text)) {
    const targets = resolveAnswerScopes(groups)
    const ppmMin = parsePpmMin(text, n) ?? 10_000
    const relativeOr =
      includesAny(n, ['상대적으로', '이거나', '또는']) &&
      includesAny(n, ['검수', '중앙'])
    const has5k =
      includesAny(n, ['5000', '5,000', '5000ppm', '5,000ppm', '5000pm']) ||
      /5[,.]?000\s*p?pm/i.test(text)
    const capped =
      /top\s*\d+|상위\s*\d+|\d+\s*개|\d+\s*까지/i.test(text)
    const listN = capped
      ? topNNear(text, ['리스트', '리스트업', '목록'], topN(text))
      : relativeOr
        ? 50
        : limit
    const wantBar =
      includesAny(n, ['막대', '그래프']) || includesAny(n, ['top5', '상위5'])
    const barN = wantBar
      ? topNNear(text, ['막대', '막대그래프'], Math.min(listN, 5))
      : 0
    // 폐기비용 재정렬은 "폐기"를 명시한 경우만
    const wantScrapList = includesAny(n, ['폐기'])
    // "검수량이 높은" → 검수량 순, 그 외 부적합률 순
    const rankByQty =
      includesAny(n, ['검수량높은', '검사량높은', '검수량이높은', '검사량이높은']) ||
      (includesAny(n, ['검수량', '검사량']) &&
        includesAny(n, ['높은', '많은']) &&
        !includesAny(n, ['상대적으로']))

    const blocks: AiBlock[] = []

    if (relativeOr) {
      const ruleText = has5k
        ? `부적합률 ${ppmMin.toLocaleString()}ppm 이상이거나, 검수량이 상대적(중앙값 이상)으로 높으면서 5,000ppm 이상인 품번`
        : `부적합률 ${ppmMin.toLocaleString()}ppm 이상이거나, 검수량이 상대적(중앙값 이상)으로 높은 품번`
      blocks.push(
        textBlock(
          `${ruleText}입니다. ${capped ? `최대 ${listN}개.` : ''} (${periodNote})`,
        ),
      )
    } else {
      const rankLabel = rankByQty ? '검수량' : '부적합률'
      blocks.push(
        textBlock(
          `부적합률 ${ppmMin.toLocaleString()}ppm 이상인 품번 중 ${rankLabel} TOP ${listN}입니다.${
            wantBar ? ` TOP ${barN}은 막대그래프로 표시합니다.` : ''
          }${
            wantScrapList
              ? ' 동일 TOP 품번을 폐기비용 높은 순으로도 정리했습니다.'
              : ''
          } (${periodNote})`,
        ),
      )
    }

    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)

      let hit: ProductRow[]
      if (relativeOr) {
        const med = median(ga.products.map((p) => p.qty))
        hit = ga.products
          .filter(
            (p) =>
              p.failRate >= ppmMin ||
              (p.qty >= med && (has5k ? p.failRate >= 5_000 : true)),
          )
          .sort((a, b) => b.failRate - a.failRate)
      } else {
        hit = ga.products
          .filter((p) => p.failRate >= ppmMin)
          .sort((a, b) =>
            rankByQty ? b.qty - a.qty : b.failRate - a.failRate,
          )
      }

      const rows = hit.slice(0, listN)
      if (!rows.length) {
        blocks.push(
          textBlock(
            `${g.label}: 부적합률 ${ppmMin.toLocaleString()}ppm 이상 품번이 없습니다.`,
          ),
        )
        continue
      }

      const medNote =
        relativeOr && ga.products.length
          ? `, 검수량 중앙값 ${median(ga.products.map((p) => p.qty)).toLocaleString()}EA`
          : ''
      const titleMetric = rankByQty ? '검수량' : '부적합률'
      blocks.push({
        type: 'table',
        title: `${g.label} · ${titleMetric} TOP ${rows.length} (부적합률 ≥ ${ppmMin.toLocaleString()}ppm${medNote})`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      })
      if (wantBar && barN > 0) {
        blocks.push(
          barFromProducts(
            `${g.label} · ${titleMetric} TOP ${Math.min(barN, rows.length)}`,
            rows,
            rankByQty ? 'qty' : 'failRate',
            barN,
          ),
        )
      }
      if (wantScrapList) {
        const byScrap = [...rows].sort((a, b) => b.scrapCost - a.scrapCost)
        blocks.push({
          type: 'table',
          title: `${g.label} · 위 TOP ${byScrap.length} 품번 · 폐기비용 높은 순`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(byScrap),
        })
      }
    }
    return blocks
  }

  // ── 검수량 EA 임계값(3,000 / 30,000) + 불량률 TOP ──
  // "PPM 이상" 문구의 '이상'과 혼동되지 않도록 명시적 EA 수치만 매칭
  if (
    includesAny(n, ['3000', '30,000', '30000', '3,000']) &&
    parseQtyMinEa(text, n) == null
  ) {
    const sealMin = 30_000
    const otherMin = 3_000
    const listLimit = Math.max(limit, 10)
    const candidates: ProductRow[] = []

    for (const g of GROUP_ALIASES) {
      const ga = analyzeGroup(records, g.id, period)
      const minQty = g.id === 'seal' ? sealMin : otherMin
      for (const p of ga.products) {
        if (p.qty >= minQty) {
          candidates.push({ ...p, type: `${g.label}/${p.type}` })
        }
      }
    }
    const ranked = [...candidates]
      .sort((a, b) => b.failRate - a.failRate)
      .slice(0, listLimit)

    if (!ranked.length) {
      return [
        textBlock(
          `조건(1공장·2공장 ≥ ${otherMin.toLocaleString()}EA, SEAL ≥ ${sealMin.toLocaleString()}EA)에 맞는 품번이 없습니다. (${periodNote})`,
        ),
      ]
    }
    return [
      textBlock(
        `검수량 조건(1공장·2공장 ≥ ${otherMin.toLocaleString()}EA, SEAL ≥ ${sealMin.toLocaleString()}EA)을 만족하는 품번 중 불량률 TOP ${ranked.length}입니다. (${periodNote})`,
      ),
      {
        type: 'table',
        title: `불량률 TOP ${ranked.length}`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(ranked),
      },
      barFromProducts('불량률 TOP 5', ranked, 'failRate'),
    ]
  }

  // ── 검사원/검사자 TOP (검수량·부적합률·UPH) + 막대/원형 ──
  // "7월 2공장 검사수량 높은 검사원 top5 막대|원형 비율" — 품번 TOP보다 우선
  if (
    includesAny(n, ['검사원', '검사자']) &&
    !includesAny(n, ['품번']) &&
    (includesAny(n, [
      'top',
      '상위',
      '높은',
      '많은',
      '막대',
      '그래프',
      '원형',
      '파이',
      '비율',
      '누구',
    ]) ||
      includesAny(n, ['검수', '검사수', '부적합', 'uph']))
  ) {
    const targets = resolveAnswerScopes(groups)
    const metric: 'qty' | 'failRate' | 'uph' = n.includes('uph')
      ? 'uph'
      : includesAny(n, ['부적합', '불량률', '불량율', '부적합률', '부적합율'])
        ? 'failRate'
        : 'qty'
    const metricLabel =
      metric === 'uph' ? 'UPH' : metric === 'failRate' ? '부적합률' : '검수량'
    // "원형그래프"에 '그래프'가 포함되므로 원형 요청을 막대보다 우선
    const wantPie =
      includesAny(n, ['원형', '원그래프', '파이그래프', '파이', '도넛']) ||
      (includesAny(n, ['비율', '%', '퍼센트']) &&
        includesAny(n, ['그래프', '차트']))
    const wantBar =
      !wantPie &&
      (includesAny(n, ['막대', 'bar']) ||
        (n.includes('그래프') && !includesAny(n, ['선그래프', '선으로'])))
    const listLimit = limit
    const scopeText = targets.map((t) => t.label).join(', ')
    const chartNote = wantPie
      ? ' 원형 그래프(비율 %)'
      : wantBar
        ? ' 막대 그래프'
        : ''
    const blocks: AiBlock[] = [
      textBlock(
        `${scopeText} 기준 ${metricLabel}이 높은 검사원 TOP ${listLimit}입니다.${chartNote}. (${periodNote})`,
      ),
    ]

    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const ranked = [...ga.inspectors].sort((a, b) =>
        metric === 'uph'
          ? b.uph - a.uph
          : metric === 'failRate'
            ? b.failRate - a.failRate
            : b.qty - a.qty,
      )
      const rows = ranked.slice(0, listLimit)
      if (!rows.length) {
        blocks.push(textBlock(`${g.label}: 검사원 데이터가 없습니다.`))
        continue
      }
      blocks.push({
        type: 'table',
        title: `${g.label} · 검사원 ${metricLabel} TOP ${rows.length}`,
        headers: ['순위', '검사원', '소속', '검수량', '부적합률', 'UPH'],
        rows: rows.map((i, idx) => [
          String(idx + 1),
          i.name,
          i.team,
          `${i.qty.toLocaleString()} EA`,
          formatPpm(i.failRate),
          String(i.uph),
        ]),
      })
      const values = rows.map((i) =>
        metric === 'uph'
          ? i.uph
          : metric === 'failRate'
            ? i.failRate
            : i.qty,
      )
      if (wantPie) {
        const total = values.reduce((s, v) => s + v, 0) || 1
        blocks.push({
          type: 'pie',
          title: `${g.label} · 검사원 ${metricLabel} TOP ${rows.length} 비율(%)`,
          data: rows.map((i, idx) => {
            const value = values[idx]!
            return {
              name: i.name,
              value,
              share: Math.round((value / total) * 1000) / 10,
            }
          }),
        })
      } else if (wantBar) {
        blocks.push({
          type: 'bar',
          title: `${g.label} · 검사원 ${metricLabel} TOP ${rows.length}`,
          format:
            metric === 'failRate' ? 'ppm' : metric === 'uph' ? 'raw' : 'qty',
          valueLabel: metricLabel,
          data: rows.map((i, idx) => ({
            name: i.name,
            value: values[idx]!,
          })),
        })
      }
    }
    return blocks
  }

  // ── 품번 TOP + 막대 + 불량유형 원그래프 (그룹 지정 시 각각, 없으면 전체) ──
  {
    const looksLikeProductTop =
      includesAny(n, ['top', '상위', '리스트', '폐기', '부적합', '불량', '검수', '불량유형']) &&
      (includesAny(n, ['각각', '1공장', 'seal', '2공장', 'grommet', '그로멧', '원그래프', '막대']) ||
        includesAny(n, ['top10', '상위10', '10까지'])) &&
      (includesAny(n, ['폐기', '부적합', '검수', '리스트', '막대']) ||
        includesAny(n, ['각각', '1공장', 'seal', '2공장'])) &&
      !includesAny(n, ['10000', '10,000', '5000', '5,000', '상대적으로']) &&
      !includesAny(n, ['검사원', '검사자'])

    if (looksLikeProductTop) {
      const wantScrap = includesAny(n, ['폐기', '비용']) || includesAny(n, ['각각'])
      const wantFail =
        includesAny(n, ['부적합', '불량률', '불량율', '부적합률', '부적합율']) ||
        (includesAny(n, ['불량']) && !includesAny(n, ['불량유형'])) ||
        includesAny(n, ['각각'])
      const qtyIsFilterOnly =
        includesAny(n, ['이상']) && includesAny(n, ['검수량', '검사량'])
      const wantQty =
        !qtyIsFilterOnly &&
        (includesAny(n, ['각각']) ||
          (includesAny(n, ['검수량', '검사량']) &&
            includesAny(n, ['top', '상위', '많은', '높은', '리스트', '까지'])))
      const wantPie =
        includesAny(n, ['불량유형', '원그래프', '원형', '파이', '도넛']) ||
        includesAny(n, ['각각'])
      const wantBar =
        includesAny(n, ['막대', 'bar']) ||
        (includesAny(n, ['그래프', '차트']) &&
          !wantPie &&
          !includesAny(n, ['선그래프', '선으로']))

      const metrics: ('scrapCost' | 'failRate' | 'qty')[] = []
      if (wantScrap) metrics.push('scrapCost')
      if (wantFail) metrics.push('failRate')
      if (wantQty) metrics.push('qty')

      // 품번 지표(폐기/부적합/검수) 요청이 있을 때만 처리. 불량유형만이면 legacy로.
      if (metrics.length) {
        const excludeHint = excludedTypeHint(n)
        const listN = topNNear(
          text,
          ['리스트', '리스트업', '목록'],
          topN(text),
        )
        const barN = wantBar
          ? topNNear(text, ['막대', '막대그래프'], Math.min(listN, 5))
          : 0
        const grommetFilter =
          includesAny(n, ['grommet', '그로멧', '그로메트']) &&
          excludeHint !== 'grommet'
        const targets = resolveAnswerScopes(groups)
        const isPlant1Ask =
          (n.includes('1공장') || n.includes('일공장')) &&
          !includesAny(n, ['2공장', '이공장', 'plant2'])
        const plant1Scoped =
          isPlant1Ask &&
          groups.length > 0 &&
          groups.every((g) => g.id === 'seal' || g.id === 'hydraulic')
        const baseScope = grommetOverall
          ? 'GROMMET 종합(본사·2공장 각각 + 합계)'
          : plant1Scoped
            ? '1공장'
            : groups.length > 1
              ? `${groups.map((g) => g.label).join(', ')} 각각`
              : groups.length === 1
                ? groups[0]!.label
                : '전체'
        const scopeText = excludeHint
          ? `${baseScope} · ${excludeTypeLabel(excludeHint)} 제외`
          : baseScope
        const metricText = metrics
          .map((m) =>
            m === 'scrapCost' ? '폐기비용' : m === 'qty' ? '검수량' : '부적합율',
          )
          .join('/')

        const blocks: AiBlock[] = [
          textBlock(
            `${scopeText} · ${metricText} TOP ${listN} 리스트` +
              `${wantBar ? ` · TOP ${barN} 막대` : ''}` +
              `${wantPie ? ' · 불량유형 원그래프(%)' : ''}` +
              `입니다. (${periodNote})`,
          ),
        ]

        const collectedForTotal: ProductRow[] = []

        for (const g of targets) {
          const ga =
            g.id === 'all'
              ? scopedAnalytics
              : analyzeGroup(records, g.id, period)
          let products = [...ga.products]
          if (excludeHint) {
            products = products.filter((p) => !matchesType(p, excludeHint))
          }
          if (grommetFilter && g.id === 'plant2') {
            const only = products.filter(isGrommetLikeProduct)
            if (only.length) products = only
          }
          for (const metric of metrics) {
            const rows = [...products]
              .sort((a, b) => b[metric] - a[metric])
              .slice(0, listN)
            if (grommetOverall && metric === metrics[0] && g.id !== 'all') {
              collectedForTotal.push(...products)
            }
            const label =
              metric === 'scrapCost'
                ? '폐기비용'
                : metric === 'qty'
                  ? '검수량'
                  : '부적합율'
            const titleScope = excludeHint
              ? `${plant1Scoped ? '1공장' : g.label} · ${excludeTypeLabel(excludeHint)} 제외`
              : plant1Scoped
                ? `1공장 · ${g.label}`
                : g.label
            blocks.push({
              type: 'table',
              title: `${titleScope} · ${label} TOP ${rows.length}`,
              headers: PRODUCT_HEADERS,
              rows: productTableRows(rows),
            })
            if (wantBar && barN > 0) {
              blocks.push(
                barFromProducts(
                  `${titleScope} · ${label} TOP ${Math.min(barN, rows.length)}`,
                  rows,
                  metric,
                  barN,
                ),
              )
            }
          }
          if (wantPie) {
            const defects = ga.defectTypes.slice(0, 10)
            blocks.push({
              type: 'pie',
              title: `${g.label} · 불량유형 구성(%)`,
              data: defects.map((d) => ({
                name: d.name,
                value: d.count,
                share: d.share,
              })),
            })
          }
        }

        if (grommetOverall && collectedForTotal.length) {
          const merged = mergeProductRows(collectedForTotal)
          for (const metric of metrics) {
            const rows = [...merged]
              .sort((a, b) => b[metric] - a[metric])
              .slice(0, listN)
            const label =
              metric === 'scrapCost'
                ? '폐기비용'
                : metric === 'qty'
                  ? '검수량'
                  : '부적합율'
            blocks.push({
              type: 'table',
              title: `GROMMET 합계(본사+2공장) · ${label} TOP ${rows.length}`,
              headers: PRODUCT_HEADERS,
              rows: productTableRows(rows),
            })
            if (wantBar && barN > 0) {
              blocks.push(
                barFromProducts(
                  `GROMMET 합계 · ${label} TOP ${Math.min(barN, rows.length)}`,
                  rows,
                  metric,
                  barN,
                ),
              )
            }
          }
        }

        return blocks
      }
    }
  }

  // ── 기존 규칙 기반 (차트 포함) ──
  return legacyAnswer(text, n, limit, scopedAnalytics, records, periodNote)
}

function typeHint(text: string, types: string[]) {
  const n = compact(text)
  // "SEAL 제외"는 포함 힌트가 아님
  if (excludedTypeHint(n)) return null
  if (includesAny(n, ['seal', '실링', '씰'])) return 'seal'
  if (includesAny(n, ['그로멧', 'grommet'])) return 'grommet'
  if (n.includes('유압')) return 'hydraulic'
  const found = types.find((t) => t && n.includes(compact(t)))
  return found ?? null
}

function matchesType(product: ProductRow, hint: string) {
  const type = compact(product.type)
  const name = compact(product.name)
  if (hint === 'seal') {
    return (
      includesAny(type, ['seal', '실링', '씰']) ||
      includesAny(name, ['seal', 'oring', 'o-ring', '실링'])
    )
  }
  if (hint === 'grommet') {
    return includesAny(type, ['그로멧', 'grommet']) || includesAny(name, ['grommet', '그로멧'])
  }
  if (hint === 'hydraulic') {
    return type.includes('유압') || includesAny(name, ['hyd', '유압'])
  }
  return type.includes(compact(hint)) || name.includes(compact(hint))
}

function scopeLabel(hint: string | null, team: string | null) {
  const parts = [
    team,
    hint === 'seal'
      ? 'SEAL'
      : hint === 'grommet'
        ? '그로멧'
        : hint === 'hydraulic'
          ? '유압'
          : hint,
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : '전체'
}

function formatProduct(
  p: ProductRow,
  i: number,
  metric: 'failRate' | 'qty' | 'scrapCost' | 'changeRate',
) {
  if (metric === 'scrapCost') {
    return `${i + 1}. ${p.name}(${p.type}) · ${formatWon(p.scrapCost)} · 부적합률 ${formatPpm(p.failRate)} · ${p.mainDefect}`
  }
  if (metric === 'qty') {
    return `${i + 1}. ${p.name}(${p.type}) · 검수량 ${p.qty.toLocaleString()} · 부적합률 ${formatPpm(p.failRate)}`
  }
  if (metric === 'changeRate') {
    return `${i + 1}. ${p.name}(${p.type}) · ${formatPpmDelta(p.changeRate)} · 부적합률 ${formatPpm(p.failRate)}`
  }
  return `${i + 1}. ${p.name}(${p.type}) · ${formatPpm(p.failRate)} · 부적합 ${p.fail.toLocaleString()} · ${p.mainDefect}`
}

function legacyAnswer(
  text: string,
  n: string,
  limit: number,
  analytics: Analytics,
  _records: InspectionRecord[],
  periodNote = '기간: 올해(연간)',
): AiBlock[] {
  const hint = typeHint(text, analytics.filterOptions.productTypes)
  const excludeHint = excludedTypeHint(n)
  const teamLabel = n.includes('2공장')
    ? '2공장'
    : n.includes('1공장') || n.includes('일공장')
      ? '1공장'
      : n.includes('본사')
        ? '본사'
        : null
  const inspectorHit = analytics.inspectors.find((i) => n.includes(compact(i.name)))
  const equipmentHit = analytics.equipment.find((e) => e.name && n.includes(compact(e.name)))
  const productHit = analytics.products.find((p) => n.includes(compact(p.name)))
  const scope = excludeHint
    ? `${teamLabel ?? '전체'} · ${excludeTypeLabel(excludeHint)} 제외`
    : scopeLabel(hint, teamLabel === '1공장' ? '본사' : teamLabel)

  let products = [...analytics.products]
  if (hint) products = products.filter((p) => matchesType(p, hint))
  if (excludeHint) products = products.filter((p) => !matchesType(p, excludeHint))
  if (teamLabel) {
    const teamKey = teamLabel === '1공장' ? '본사' : teamLabel
    const inspectorNames = new Set(
      analytics.inspectors.filter((i) => i.team.includes(teamKey)).map((i) => i.name),
    )
    if (inspectorNames.size) {
      products = products.filter((p) =>
        analytics.inspectors.some(
          (i) => inspectorNames.has(i.name) && i.products.some((x) => x.product === p.name),
        ),
      )
    }
  }

  // 품번을 여러 개 나열한 비교는 answerOne의 tryAnswerNamedProductCompare에서 처리
  if (
    n.includes('비교') &&
    findProductNames(n, analytics.filterOptions.products).length < 2 &&
    extractMentionedProductCodes(text).length < 2
  ) {
    const rows = analytics.groupSummaries
    return [
      textBlock(`분석 그룹별 비교입니다. (#N/A 제외) (${periodNote})`),
      {
        type: 'table',
        title: '분석 그룹 비교',
        headers: ['그룹', '검수량', '부적합률', '부적합', '폐기비용'],
        rows: rows.map((g) => [
          g.label,
          g.qty.toLocaleString(),
          formatPpm(g.failRate),
          g.fail.toLocaleString(),
          formatWon(g.scrapCost),
        ]),
      },
    ]
  }

  if (inspectorHit && (n.includes('품번') || n.includes('무엇') || n.includes('많이'))) {
    const rows = [...inspectorHit.products].sort((a, b) => b.qty - a.qty).slice(0, limit)
    return [
      textBlock(`${inspectorHit.name}(${inspectorHit.team})이 검사한 품번 TOP ${rows.length}입니다.`),
      {
        type: 'table',
        title: `${inspectorHit.name} 검사 품번`,
        headers: ['순위', '품번', '검수량', '부적합률'],
        rows: rows.map((p, i) => [
          String(i + 1),
          p.product,
          `${p.qty.toLocaleString()} EA`,
          formatPpm(p.failRate),
        ]),
      },
    ]
  }

  if (equipmentHit) {
    const rows = [...equipmentHit.products]
      .sort((a, b) => (n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty))
      .slice(0, limit)
    return [
      textBlock(
        `${equipmentHit.name}에서 검사한 품번입니다. 부적합률 ${formatPpm(equipmentHit.failRate)}`,
      ),
      {
        type: 'table',
        title: `${equipmentHit.name} 품번`,
        headers: ['순위', '품번', '검수량', '부적합률'],
        rows: rows.map((p, i) => [
          String(i + 1),
          p.product,
          `${p.qty.toLocaleString()} EA`,
          formatPpm(p.failRate),
        ]),
      },
    ]
  }

  if (productHit && (n.includes('왜') || n.includes('원인') || n.includes('분석'))) {
    return [
      textBlock(
        `${productHit.name}(${productHit.type}) 품질 요약입니다.`,
        `검수량 ${productHit.qty.toLocaleString()} · 부적합 ${productHit.fail.toLocaleString()} · 부적합률 ${formatPpm(productHit.failRate)}`,
        `폐기비용 ${formatWon(productHit.scrapCost)} · UPH ${productHit.uph} · 주요 불량 ${productHit.mainDefect}`,
        productHit.defectSummary ? `불량 내역: ${productHit.defectSummary}` : '불량 상세가 없습니다.',
      ),
      {
        type: 'pie',
        title: `${productHit.name} 불량유형`,
        data: productHit.defects.map((d: DefectType) => ({
          name: d.name,
          value: d.count,
          share: d.share,
        })),
      },
    ]
  }

  if (
    includesAny(n, ['불량유형', '어떤불량', '불량top', '불량종류']) &&
    !n.includes('품번') &&
    !includesAny(n, ['폐기', '검수량', '검사량', '부적합율', '부적합률', '리스트업'])
  ) {
    const rows = analytics.defectTypes.slice(0, limit)
    return [
      textBlock(`${scope} 기준 불량 유형 TOP ${rows.length}입니다.`),
      {
        type: 'pie',
        title: '불량유형 구성(%)',
        data: rows.map((d) => ({ name: d.name, value: d.count, share: d.share })),
      },
      {
        type: 'bar',
        title: '불량유형 TOP (비중 %)',
        format: 'percent',
        valueLabel: '비중',
        data: rows.map((d) => ({ name: d.name, value: d.share })),
      },
    ]
  }

  if (includesAny(n, ['폐기', '비용']) && !n.includes('부적합률') && !n.includes('부적합율')) {
    const rows = [...products].sort((a, b) => b.scrapCost - a.scrapCost).slice(0, limit)
    if (!rows.length) return [textBlock(`${scope}에서 해당 품번 데이터가 없습니다.`)]
    return [
      textBlock(`${scope}에서 폐기비용이 높은 품번 TOP ${rows.length}입니다.`),
      {
        type: 'table',
        title: '폐기비용 TOP',
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      },
      barFromProducts('폐기비용 TOP 5', rows, 'scrapCost'),
    ]
  }

  if (includesAny(n, ['검사자']) && includesAny(n, ['품번'])) {
    const ranked = [...analytics.inspectors].sort((a, b) => b.products.length - a.products.length)
    const top = ranked[0]
    return top
      ? [
          textBlock(
            `가장 많은 품번을 검사한 검사자는 ${top.name}(${top.team})입니다. 품번 ${top.products.length}종 · 검수량 ${top.qty.toLocaleString()} EA`,
          ),
          {
            type: 'table',
            title: `${top.name} 품번`,
            headers: ['순위', '품번', '검수량'],
            rows: top.products
              .slice(0, limit)
              .map((p, i) => [String(i + 1), p.product, `${p.qty.toLocaleString()} EA`]),
          },
        ]
      : [textBlock('검사자 데이터가 없습니다.')]
  }

  if (includesAny(n, ['검사자', '검사원', '누구'])) {
    const ranked = [...analytics.inspectors].sort((a, b) =>
      n.includes('uph') ? b.uph - a.uph : n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    const title = n.includes('uph')
      ? 'UPH가 높은 검사자입니다.'
      : n.includes('부적합')
        ? '부적합률이 높은 검사자입니다.'
        : '검수량이 많은 검사자입니다.'
    return [
      textBlock(title),
      {
        type: 'table',
        title: '검사자 TOP',
        headers: ['순위', '검사자', '소속', '검수량', '부적합률', 'UPH'],
        rows: ranked.slice(0, limit).map((i, idx) => [
          String(idx + 1),
          i.name,
          i.team,
          `${i.qty.toLocaleString()} EA`,
          formatPpm(i.failRate),
          String(i.uph),
        ]),
      },
    ]
  }

  if (includesAny(n, ['증가', '지난달', '이전기간'])) {
    const rows = [...products].sort((a, b) => b.changeRate - a.changeRate).slice(0, limit)
    if (!rows.length) return [textBlock(`${scope}에서 해당 품번 데이터가 없습니다.`)]
    return [
      textBlock(`${scope}에서 이전 기간 대비 부적합률이 가장 많이 증가한 품번입니다.`),
      textBlock(...rows.map((p, i) => formatProduct(p, i, 'changeRate'))),
      barFromProducts(
        '부적합률 증가 TOP 5',
        rows.map((p) => ({ ...p, failRate: Math.max(0, p.changeRate) })),
        'failRate',
      ),
    ]
  }

  if (includesAny(n, ['설비'])) {
    const ranked = [...analytics.equipment].sort((a, b) =>
      n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    return [
      textBlock(n.includes('부적합') ? '부적합률이 높은 설비입니다.' : '검사량이 많은 설비입니다.'),
      {
        type: 'table',
        title: '설비 TOP',
        headers: ['순위', '설비', '검수량', '부적합률', '주요불량'],
        rows: ranked.slice(0, limit).map((e, i) => [
          String(i + 1),
          e.name,
          e.qty.toLocaleString(),
          formatPpm(e.failRate),
          e.mainDefect,
        ]),
      },
    ]
  }

  if (includesAny(n, ['금형'])) {
    const ranked = [...analytics.molds].sort((a, b) =>
      n.includes('부적합') ? b.failRate - a.failRate : b.qty - a.qty,
    )
    return [
      textBlock('금형별 품질입니다.'),
      {
        type: 'table',
        title: '금형 TOP',
        headers: ['순위', '금형', '품번', '부적합률', '폐기비용'],
        rows: ranked.slice(0, limit).map((m, i) => [
          String(i + 1),
          m.moldNo,
          m.product,
          formatPpm(m.failRate),
          formatWon(m.scrapCost),
        ]),
      },
    ]
  }

  const metric: 'failRate' | 'qty' | 'scrapCost' = includesAny(n, [
    '불량률',
    '불량율',
    '부적합률',
    '부적합율',
    '부적합',
  ])
    ? 'failRate'
    : includesAny(n, ['폐기', '비용'])
      ? 'scrapCost'
      : includesAny(n, ['검수량', '검사량']) && !includesAny(n, ['이상'])
        ? 'qty'
        : 'failRate'

  const rows = [...products].sort((a, b) => b[metric] - a[metric]).slice(0, limit)
  if (!rows.length) {
    return [
      textBlock(`${scope} 조건에 맞는 품번이 없습니다. 제품유형이나 품번을 바꿔 질문해 보세요.`),
    ]
  }
  const metricLabel =
    metric === 'qty' ? '검수량이 많은' : metric === 'scrapCost' ? '폐기비용이 높은' : '부적합률이 높은'

  return [
    textBlock(`${scope} 기준 ${metricLabel} 품번 TOP ${rows.length}입니다. (#N/A 제외) (${periodNote})`),
    {
      type: 'table',
      title: `품번 TOP ${rows.length} (${periodNote.replace('기간: ', '')})`,
      headers: PRODUCT_HEADERS,
      rows: productTableRows(rows),
    },
    barFromProducts(`${metricLabel} TOP 5`, rows, metric),
  ]
}

/** 여러 ※ 문항을 나눠 각각 답하고, 블록을 합칩니다. 직전 context로 후속 질문 가능. */
export function answerQuestion(
  q: string,
  analytics: Analytics,
  records: InspectionRecord[] = [],
  priorContext?: AiConversationContext | null,
): AiAnswer {
  const text = q.trim()
  if (!text) return emptyAnswer('질문을 입력하세요.')

  const parts = splitQueryParts(text)
  let ctx: AiConversationContext | null | undefined = priorContext ?? null
  const blocks: AiBlock[] = []

  if (parts.length > 1) {
    blocks.push(textBlock(`질문 ${parts.length}건을 나눠 분석했습니다.`))
  }

  parts.forEach((part, i) => {
    if (parts.length > 1) {
      blocks.push(textBlock(`── Q${i + 1}. ${part} ──`))
    }
    const partBlocks = answerOne(part, analytics, records, ctx)
    blocks.push(...partBlocks)
    const next = buildContextFromBlocks(part, partBlocks)
    if (next) {
      const period =
        parsePeriodFromQuestion(part, records) ??
        ctx?.lastPeriod ??
        null
      ctx = {
        ...next,
        lastPeriod: period ?? next.lastPeriod,
        lastMetric:
          next.lastMetric ??
          ctx?.lastMetric ??
          inferMetricFromText(compact(part)) ??
          'failRate',
      }
    }
  })

  return {
    blocks,
    context: ctx ?? undefined,
  }
}

export function formatAiValue(v: number, format: AiValueFormat = 'raw') {
  return formatValue(v, format)
}

export function trendMetricFromDaily(t: DailyTrend, key: keyof DailyTrend) {
  return t[key]
}

export { groupLabel, BAR_COLOR, GROUP_COLORS }
