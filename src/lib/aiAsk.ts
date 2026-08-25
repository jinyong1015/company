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
import { formatPpm, formatPpmDelta } from './format'
import type {
  Analytics,
  DailyTrend,
  DefectType,
  InspectionRecord,
  ProductRow,
} from '../types'

export type AiValueFormat = 'ppm' | 'qty' | 'won' | 'million' | 'count' | 'raw'

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

export type AiAnswer = { blocks: AiBlock[] }

/**
 * 사용자 표현 → 분석 그룹
 * - 1공장 SEAL = 본사(SEAL)
 * - 1공장 GROMMET = 본사(유압+그로멧)
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
  const hasSealWord = includesAny(n, ['seal', '실링', '씰'])
  const hasGrommetWord = includesAny(n, ['grommet', '그로멧', '그로메트', '유압'])
  const hasBare1Plant = n.includes('1공장') || n.includes('일공장')
  const hasHq = hasBare1Plant || has1PlantSeal || has1PlantGrommet || n.includes('본사')
  const hasPlant2 = includesAny(n, ['2공장', '이공장', 'plant2'])

  // 2공장(+GROMMET/SEAL)만 물으면 2공장만
  if (hasPlant2 && !hasHq) {
    hitIds.add('plant2')
  } else {
    // 1공장 SEAL / SEAL / 본사(SEAL)
    if (has1PlantSeal || (hasSealWord && !hasPlant2)) hitIds.add('seal')
    if (hasSealWord && hasHq) hitIds.add('seal')

    // 1공장 GROMMET / 본사(유압+그로멧)
    if (has1PlantGrommet || (hasGrommetWord && hasHq)) hitIds.add('hydraulic')

    // "1공장, SEAL, 2공장" → 1공장=GROMMET
    if (hasBare1Plant && hasSealWord && !has1PlantSeal && !has1PlantGrommet && !hasGrommetWord) {
      hitIds.add('hydraulic')
    }

    // 단독 "1공장" → GROMMET 라인
    if (hasBare1Plant && !hasSealWord && !hasGrommetWord && !has1PlantSeal && !has1PlantGrommet) {
      hitIds.add('hydraulic')
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
      scrapCost: prev.scrapCost + p.scrapCost,
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
  if (format === 'qty') return `${Math.round(v).toLocaleString()} EA`
  if (format === 'won') return `₩${Math.round(v).toLocaleString()}`
  if (format === 'million') return `${(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}백만원`
  if (format === 'count') return `${Math.round(v).toLocaleString()}건`
  return String(v)
}

function toMillion(won: number) {
  return Math.round((won / 1_000_000) * 100) / 100
}

function productTableRows(rows: ProductRow[]): string[][] {
  return rows.map((p, i) => [
    String(i + 1),
    p.name,
    p.type,
    formatPpm(p.failRate),
    `${p.qty.toLocaleString()} EA`,
    `₩${p.scrapCost.toLocaleString()}`,
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
          ? p.scrapCost
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
  const sorted = [...products]
    .filter(Boolean)
    .sort((a, b) => compact(b).length - compact(a).length)
  const embedded = sorted.find((p) => {
    const c = compact(p)
    return c.length >= 3 && n.includes(c)
  })
  if (embedded) return embedded

  // NEOR GI000 → neor + gi000 토큰이 모두 품번에 포함
  const codeTokens = (n.match(/[a-z]+[0-9][a-z0-9]*|[0-9]+[a-z]+[a-z0-9]*/gi) ?? []).map(
    (t) => t.toLowerCase(),
  )
  if (codeTokens.length >= 1) {
    const hit = sorted.find((p) => {
      const c = compact(p)
      return codeTokens.every((t) => c.includes(t))
    })
    if (hit) return hit
  }
  return null
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
    includesAny(n, ['변동', '추이', '선그래프', '막대그래프', '막대', '날짜별', '리스트'])
  if (
    defectTrendHit ||
    (includesAny(n, ['불량유형', '불량']) &&
      includesAny(n, ['추이', '변동', '그래프']))
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
    const listLimit = limit
    const wantBar = includesAny(n, ['막대', '그래프', 'bar'])
    const wantScrapList =
      includesAny(n, ['폐기']) ||
      includesAny(n, ['리스트', '리스트업', '목록'])

    const targets = resolveAnswerScopes(groups)

    const blocks: AiBlock[] = [
      textBlock(
        `검수량 ${qtyMinEa.toLocaleString()}EA 이상인 품번 중 부적합률 TOP ${listLimit}입니다.${
          wantScrapList ? ' 동일 TOP 품번을 폐기비용 높은 순으로도 정리했습니다.' : ''
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
      const topByFail = filtered.slice(0, listLimit)

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
      if (wantBar) {
        blocks.push(
          barFromProducts(
            `${g.label} · 부적합률 TOP ${topByFail.length} (검수량 ≥ ${qtyMinEa.toLocaleString()}EA)`,
            topByFail,
            'failRate',
            topByFail.length,
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
    const listLimit = capped ? topN(text) : relativeOr ? 50 : limit
    const wantBar =
      includesAny(n, ['막대', '그래프']) || includesAny(n, ['top5', '상위5'])
    const wantScrapList =
      includesAny(n, ['폐기']) ||
      includesAny(n, ['리스트', '리스트업', '목록'])
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
          `${ruleText}입니다. ${capped ? `최대 ${listLimit}개.` : ''} (${periodNote})`,
        ),
      )
    } else {
      const rankLabel = rankByQty ? '검수량' : '부적합률'
      blocks.push(
        textBlock(
          `부적합률 ${ppmMin.toLocaleString()}ppm 이상인 품번 중 ${rankLabel} TOP ${listLimit}입니다.${
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

      const rows = hit.slice(0, listLimit)
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
      if (wantBar) {
        blocks.push(
          barFromProducts(
            `${g.label} · ${titleMetric} TOP ${rows.length}`,
            rows,
            rankByQty ? 'qty' : 'failRate',
            rows.length,
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

  // ── 그룹별 TOP10 + TOP5 막대 + 불량유형 원그래프 ──
  if (
    groups.length &&
    includesAny(n, ['top', '상위', '리스트', '폐기', '부적합', '불량', '검수', '불량유형']) &&
    (includesAny(n, ['각각', '1공장', 'seal', '2공장', 'grommet', '그로멧', '원그래프', '막대']) ||
      includesAny(n, ['top10', '상위10', '10까지'])) &&
    !includesAny(n, ['10000', '10,000', '5000', '5,000', '상대적으로'])
  ) {
    const wantScrap = includesAny(n, ['폐기', '비용']) || includesAny(n, ['각각'])
    const wantFail =
      includesAny(n, ['부적합', '불량률', '불량율', '부적합률', '부적합율', '불량']) ||
      includesAny(n, ['각각'])
    const qtyIsFilterOnly =
      includesAny(n, ['이상']) && includesAny(n, ['검수량', '검사량'])
    const wantQty =
      !qtyIsFilterOnly &&
      (includesAny(n, ['각각']) ||
        (includesAny(n, ['검수량', '검사량']) &&
          includesAny(n, ['top', '상위', '많은', '높은'])))
    const wantPie = includesAny(n, ['불량유형', '원그래프', '원형']) || includesAny(n, ['각각'])
    const wantBar = includesAny(n, ['막대', '그래프'])
    const metrics: ('scrapCost' | 'failRate' | 'qty')[] = []
    if (wantScrap) metrics.push('scrapCost')
    if (wantFail) metrics.push('failRate')
    if (wantQty) metrics.push('qty')
    if (!metrics.length) metrics.push('failRate')

    const listN = Math.max(limit, 10)
    const barN = wantBar ? listN : 0
    const grommetFilter = includesAny(n, ['grommet', '그로멧', '그로메트'])
    const scopeText = grommetOverall
      ? 'GROMMET 종합(본사·2공장 각각 + 합계)'
      : `${groups.map((g) => g.label).join(', ')} 기준`

    const blocks: AiBlock[] = [
      textBlock(
        `${scopeText} TOP ${listN} 리스트${wantBar ? ` · TOP ${barN} 막대` : ''}입니다. (${periodNote})`,
      ),
    ]

    const collectedForTotal: ProductRow[] = []

    for (const g of groups) {
      const ga = analyzeGroup(records, g.id, period)
      let products = [...ga.products]
      if (grommetFilter && g.id === 'plant2') {
        const only = products.filter(isGrommetLikeProduct)
        if (only.length) products = only
      }
      for (const metric of metrics) {
        const rows = [...products]
          .sort((a, b) => b[metric] - a[metric])
          .slice(0, listN)
        if (grommetOverall && metric === metrics[0]) {
          collectedForTotal.push(...products)
        }
        const label =
          metric === 'scrapCost'
            ? '폐기비용'
            : metric === 'qty'
              ? '검수량'
              : '부적합율'
        blocks.push({
          type: 'table',
          title: `${g.label} · ${label} TOP ${rows.length}`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(rows),
        })
        if (wantBar) {
          blocks.push(
            barFromProducts(
              `${g.label} · ${label} TOP ${Math.min(barN, rows.length)}`,
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
        if (wantBar) {
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

  // ── 기존 규칙 기반 (차트 포함) ──
  return legacyAnswer(text, n, limit, scopedAnalytics, records, periodNote)
}

function typeHint(text: string, types: string[]) {
  const n = compact(text)
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
    return `${i + 1}. ${p.name}(${p.type}) · ₩${p.scrapCost.toLocaleString()} · 부적합률 ${formatPpm(p.failRate)} · ${p.mainDefect}`
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
  const team = n.includes('2공장') ? '2공장' : n.includes('본사') ? '본사' : null
  const inspectorHit = analytics.inspectors.find((i) => n.includes(compact(i.name)))
  const equipmentHit = analytics.equipment.find((e) => e.name && n.includes(compact(e.name)))
  const productHit = analytics.products.find((p) => n.includes(compact(p.name)))
  const scope = scopeLabel(hint, team)

  let products = [...analytics.products]
  if (hint) products = products.filter((p) => matchesType(p, hint))
  if (team) {
    const inspectorNames = new Set(
      analytics.inspectors.filter((i) => i.team.includes(team)).map((i) => i.name),
    )
    if (inspectorNames.size) {
      products = products.filter((p) =>
        analytics.inspectors.some(
          (i) => inspectorNames.has(i.name) && i.products.some((x) => x.product === p.name),
        ),
      )
    }
  }

  if (n.includes('비교')) {
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
          `₩${g.scrapCost.toLocaleString()}`,
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
        `폐기비용 ₩${productHit.scrapCost.toLocaleString()} · UPH ${productHit.uph} · 주요 불량 ${productHit.mainDefect}`,
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

  if (includesAny(n, ['불량유형', '어떤불량', '불량top', '불량종류']) && !n.includes('품번')) {
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
        title: '불량유형 TOP',
        format: 'count',
        valueLabel: '발생량',
        data: rows.map((d) => ({ name: d.name, value: d.count })),
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
          `₩${m.scrapCost.toLocaleString()}`,
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

/** 여러 ※ 문항을 나눠 각각 답하고, 블록을 합칩니다. */
export function answerQuestion(
  q: string,
  analytics: Analytics,
  records: InspectionRecord[] = [],
): AiAnswer {
  const text = q.trim()
  if (!text) return emptyAnswer('질문을 입력하세요.')

  const parts = splitQueryParts(text)
  if (parts.length === 1) {
    return { blocks: answerOne(parts[0]!, analytics, records) }
  }

  const blocks: AiBlock[] = [
    textBlock(`질문 ${parts.length}건을 나눠 분석했습니다.`),
  ]
  parts.forEach((part, i) => {
    blocks.push(textBlock(`── Q${i + 1}. ${part} ──`))
    blocks.push(...answerOne(part, analytics, records))
  })
  return { blocks }
}

export function formatAiValue(v: number, format: AiValueFormat = 'raw') {
  return formatValue(v, format)
}

export function trendMetricFromDaily(t: DailyTrend, key: keyof DailyTrend) {
  return t[key]
}

export { groupLabel, BAR_COLOR, GROUP_COLORS }
