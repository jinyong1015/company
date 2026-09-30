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
  formatGrowthPercent,
  formatPercent,
  formatPpm,
  formatPpmAsPercent,
  formatPpmDelta,
  formatPpmDeltaPp,
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

/** 품번/집계 정렬 지표 */
export type AiMetric = 'failRate' | 'qty' | 'scrapCost' | 'fail'

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
      /** 가로 막대 (긴 품번명 등) */
      layout?: 'vertical' | 'horizontal'
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
      /** 누적 막대 */
      stacked?: boolean
      /** 100% 누적 (값은 이미 비율 0~100) */
      percentStacked?: boolean
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
      type: 'scatter'
      title: string
      data: { name: string; x: number; y: number }[]
      xLabel: string
      yLabel: string
      xFormat?: AiValueFormat
      yFormat?: AiValueFormat
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
  lastMetric?: AiMetric
  /** 직전 답변에서 쓴 기간 */
  lastPeriod?: { startDate: string; endDate: string; label: string }
  /** 직전 분석 그룹 (후속에서 공장만 바꿀 때 유지·덮어쓰기) */
  lastGroups?: { id: AnalysisGroupId; label: string }[]
  /** 직전 TOP N */
  lastLimit?: number
  /** 직전 검수량 하한 */
  lastQtyMin?: number | null
  /** 직전 부적합률(ppm) 하한 */
  lastPpmMin?: number | null
  /** 직전 폐기비용 하한(원) */
  lastScrapMin?: number | null
  /** 직전 분석 대상 엔티티 */
  lastEntity?:
    | 'product'
    | 'inspector'
    | 'worker'
    | 'equipment'
    | 'mold'
    | 'lot'
    | 'defect'
    | 'group'
  /** 직전 정렬 방향 (true=낮은/적은 순) */
  lastAscending?: boolean
}

export type AiAnswer = {
  blocks: AiBlock[]
  context?: AiConversationContext
}

/**
 * 사용자 표현 → 분석 그룹
 * - 1공장 SEAL = 본사(SEAL)
 * - 1공장 GROMMET = 본사(GROMMET)
 * - 1공장 / 본사 (라인 미지정) = 본사(SEAL) + 본사(GROMMET)
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
    label: '본사(GROMMET)',
    words: [
      '1공장grommet',
      '1공장그로멧',
      '1공장그로메트',
      '1공장유압',
      '본사(grommet)',
      '본사grommet',
      '본사(유압',
      '본사유압',
      '본사(그로멧',
      '본사(GROMMET)',
      'grommet',
      '그로멧',
      '그로메트',
      '유압',
    ],
  },
  {
    id: 'plant2',
    label: '2공장',
    words: ['2공장', '이공장', 'plant2', '구지', '구지공장', '구지쪽'],
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

export type AiQueryPeriod = {
  startDate: string
  endDate: string
  label: string
}

export type AiAnswerOptions = {
  defaultPeriod?: AiQueryPeriod | null
  now?: Date
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

/** 주간업무 보고와 동일: 월 1~7일=1주차 … */
function getWeekDateRange(
  year: number,
  month: number,
  weekOfMonth: number,
): { startDate: string; endDate: string } {
  const lastDay = lastDayOfMonth(year, month)
  const startDay = (weekOfMonth - 1) * 7 + 1
  const endDay = Math.min(weekOfMonth * 7, lastDay)
  return {
    startDate: ymd(year, month, startDay),
    endDate: ymd(year, month, endDay),
  }
}

function getWeekOfMonth(dateStr: string) {
  const day = Number(dateStr.slice(8, 10))
  return Math.min(5, Math.ceil(day / 7))
}

function periodForAllRecords(records: InspectionRecord[]): AiQueryPeriod | null {
  const dates = records
    .map((record) => record.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort()
  if (!dates.length) return null
  return {
    startDate: dates[0]!,
    endDate: dates[dates.length - 1]!,
    label: '전체',
  }
}

export function periodFromFilters(
  filters: FilterState,
  now = new Date(),
): AiQueryPeriod {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let start = new Date(today)
  let end = new Date(today)
  let label = '시스템 기본 조회기간'

  if (filters.period === '7d') {
    start.setDate(end.getDate() - 6)
    label = '최근 7일(시스템 기본)'
  } else if (filters.period === 'thisMonth') {
    start = new Date(end.getFullYear(), end.getMonth(), 1)
    label = '이번 달(시스템 기본)'
  } else if (filters.period === 'lastMonth') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
    end = new Date(end.getFullYear(), end.getMonth(), 0)
    label = '지난달(시스템 기본)'
  } else if (filters.period === 'year') {
    start = new Date(end.getFullYear(), 0, 1)
    label = '올해(시스템 기본)'
  } else if (filters.period === 'custom') {
    const validStart = /^\d{4}-\d{2}-\d{2}$/.test(filters.startDate)
    const validEnd = /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)
    if (validStart && validEnd) {
      return {
        startDate: filters.startDate,
        endDate: filters.endDate,
        label: `${filters.startDate} ~ ${filters.endDate}(시스템 기본)`,
      }
    }
  } else {
    label = '오늘(시스템 기본)'
  }

  return {
    startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
    endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    label,
  }
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

/** 질문 문장에서 기간을 읽습니다. 예: 7월 / 7월 22일부터 28일까지 / 이번 주 */
export function parsePeriodFromQuestion(
  text: string,
  _records: InspectionRecord[],
  now = new Date(),
): AiQueryPeriod | null {
  const yearFromText = text.match(/(20\d{2})\s*년/)
  const year = yearFromText ? Number(yearFromText[1]) : now.getFullYear()
  const n = compact(text)

  // 오늘 / 어제
  if (/오늘|금일/.test(text) && !/어제|그제/.test(text)) {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    const d = now.getDate()
    return {
      startDate: ymd(y, m, d),
      endDate: ymd(y, m, d),
      label: `${y}년 ${m}월 ${d}일(오늘)`,
    }
  }
  if (/어제|전일/.test(text)) {
    const prev = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    const y = prev.getFullYear()
    const m = prev.getMonth() + 1
    const d = prev.getDate()
    return {
      startDate: ymd(y, m, d),
      endDate: ymd(y, m, d),
      label: `${y}년 ${m}월 ${d}일(어제)`,
    }
  }

  // 최근 N주 (주차별 추이용 — 일/월과 구분)
  const recentWeeks = text.match(/최근\s*(\d+)\s*주/)
  if (recentWeeks) {
    const weeks = Number(recentWeeks[1])
    if (Number.isFinite(weeks) && weeks > 0) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const start = new Date(end)
      start.setDate(start.getDate() - (weeks * 7 - 1))
      return {
        startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
        endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
        label: `최근 ${weeks}주`,
      }
    }
  }

  // 최근 N일 / 최근 한 달 / 최근 3개월
  const recentDays = text.match(/최근\s*(\d+)\s*일/)
  if (recentDays) {
    const days = Number(recentDays[1])
    if (Number.isFinite(days) && days > 0) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const start = new Date(end)
      start.setDate(start.getDate() - (days - 1))
      return {
        startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
        endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
        label: `최근 ${days}일`,
      }
    }
  }
  if (/최근\s*(?:한\s*)?달|최근\s*1\s*개월|최근\s*한달/.test(text)) {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const start = new Date(end)
    start.setMonth(start.getMonth() - 1)
    return {
      startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
      endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
      label: '최근 한 달',
    }
  }
  const recentMonths = text.match(/최근\s*(\d+)\s*개월/)
  if (recentMonths) {
    const months = Number(recentMonths[1])
    if (Number.isFinite(months) && months > 0) {
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const start = new Date(end)
      start.setMonth(start.getMonth() - months)
      return {
        startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
        endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
        label: `최근 ${months}개월`,
      }
    }
  }

  // 작년
  if (/작년|전년|지난해/.test(text) && !/\d{1,2}\s*월/.test(text)) {
    const y = now.getFullYear() - 1
    return {
      startDate: ymd(y, 1, 1),
      endDate: ymd(y, 12, 31),
      label: `${y}년(작년)`,
    }
  }

  // 2024년 / 2026년 (월 미지정 → 해당 연도 전체)
  if (yearFromText && !/\d{1,2}\s*월/.test(text) && !/올해|금년/.test(text)) {
    return {
      startDate: ymd(year, 1, 1),
      endDate: ymd(year, 12, 31),
      label: `${year}년`,
    }
  }

  // 2024년 / 2026년 (월 미지정 → 해당 연도 전체)
  if (yearFromText && !/\d{1,2}\s*월/.test(text) && !/올해|금년/.test(text)) {
    return {
      startDate: ymd(year, 1, 1),
      endDate: ymd(year, 12, 31),
      label: `${year}년`,
    }
  }

  // N월 초/중순/말 / 둘째 주
  const monthPart = text.match(
    /(\d{1,2})\s*월\s*(초|중순|말|첫째\s*주|둘째\s*주|셋째\s*주|넷째\s*주)/,
  )
  if (monthPart) {
    const m = Number(monthPart[1])
    const part = monthPart[2]!.replace(/\s+/g, '')
    if (m >= 1 && m <= 12) {
      const last = lastDayOfMonth(year, m)
      let d1 = 1
      let d2 = last
      if (part === '초') {
        d1 = 1
        d2 = 10
      } else if (part === '중순') {
        d1 = 11
        d2 = 20
      } else if (part === '말') {
        d1 = 21
        d2 = last
      } else if (part.includes('첫째')) {
        return {
          ...(() => {
            const r = getWeekDateRange(year, m, 1)
            return {
              startDate: r.startDate,
              endDate: r.endDate,
              label: `${year}년 ${m}월 1주차`,
            }
          })(),
        }
      } else if (part.includes('둘째')) {
        const r = getWeekDateRange(year, m, 2)
        return {
          startDate: r.startDate,
          endDate: r.endDate,
          label: `${year}년 ${m}월 2주차`,
        }
      } else if (part.includes('셋째')) {
        const r = getWeekDateRange(year, m, 3)
        return {
          startDate: r.startDate,
          endDate: r.endDate,
          label: `${year}년 ${m}월 3주차`,
        }
      } else if (part.includes('넷째')) {
        const r = getWeekDateRange(year, m, 4)
        return {
          startDate: r.startDate,
          endDate: r.endDate,
          label: `${year}년 ${m}월 4주차`,
        }
      }
      return {
        startDate: ymd(year, m, d1),
        endDate: ymd(year, m, d2),
        label: `${year}년 ${m}월 ${part}`,
      }
    }
  }

  // N월 초부터 중순까지
  const monthSpanPart = text.match(
    /(\d{1,2})\s*월\s*초\s*(?:부터|~|-)\s*(?:중순|말)/,
  )
  if (monthSpanPart) {
    const m = Number(monthSpanPart[1])
    if (m >= 1 && m <= 12) {
      const toMid = /중순/.test(text)
      return {
        startDate: ymd(year, m, 1),
        endDate: ymd(year, m, toMid ? 20 : lastDayOfMonth(year, m)),
        label: `${year}년 ${m}월 초~${toMid ? '중순' : '말'}`,
      }
    }
  }

  // N월 N주차 / N월 N주 / N월 둘째 주 / N월 두 번째 주
  const weekOfMonthHit = text.match(
    /(\d{1,2})\s*월\s*(?:(\d)\s*주(?:차)?|(첫째|둘째|셋째|넷째|첫\s*번째|두\s*번째|세\s*번째|네\s*번째)\s*주)/,
  )
  if (weekOfMonthHit) {
    const m = Number(weekOfMonthHit[1])
    let w = Number(weekOfMonthHit[2] || 0)
    const named = (weekOfMonthHit[3] || '').replace(/\s+/g, '')
    if (!w && named) {
      if (named.includes('첫째') || named.includes('첫번째')) w = 1
      else if (named.includes('둘째') || named.includes('두번째')) w = 2
      else if (named.includes('셋째') || named.includes('세번째')) w = 3
      else if (named.includes('넷째') || named.includes('네번째')) w = 4
    }
    if (m >= 1 && m <= 12 && w >= 1 && w <= 5) {
      const range = getWeekDateRange(year, m, w)
      return {
        startDate: range.startDate,
        endDate: range.endDate,
        label: `${year}년 ${m}월 ${w}주차`,
      }
    }
  }
  if (/지난\s*달\s*(?:의\s*)?(?:마지막|끝)\s*주|전월\s*(?:마지막|끝)\s*주/.test(text)) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = previousMonth.getFullYear()
    const m = previousMonth.getMonth() + 1
    const lastDay = lastDayOfMonth(y, m)
    const w = Math.min(5, Math.ceil(lastDay / 7))
    const range = getWeekDateRange(y, m, w)
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${y}년 ${m}월 ${w}주차(지난달 마지막 주)`,
    }
  }

  // 이번 주 / 금주 / 당주 (대비·비교 문장은 비교 파서가 우선)
  if (
    /(?:이번|금|당)\s*주/.test(text) &&
    !/(?:지난|저번|전)\s*주/.test(text.replace(/(?:이번|금|당)\s*주/g, ''))
  ) {
    const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const w = getWeekOfMonth(today)
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    const range = getWeekDateRange(y, m, w)
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${y}년 ${m}월 ${w}주차(이번 주)`,
    }
  }

  // 지난주 / 전주 / 저번 주
  if (/(?:지난|저번|전)\s*주/.test(text) && !/(?:이번|금|당)\s*주/.test(text)) {
    const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const w = getWeekOfMonth(today)
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    let py = y
    let pm = m
    let pw = w - 1
    if (pw < 1) {
      pm = m === 1 ? 12 : m - 1
      py = m === 1 ? y - 1 : y
      const lastDay = lastDayOfMonth(py, pm)
      pw = Math.min(5, Math.ceil(lastDay / 7))
    }
    const range = getWeekDateRange(py, pm, pw)
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${py}년 ${pm}월 ${pw}주차(지난주)`,
    }
  }

  // 올해 / 이번 년도 / 금년
  if (/올해|금년|이번\s*년(?:도)?|금년도/.test(text) && !/\d{1,2}\s*월/.test(text)) {
    const y = now.getFullYear()
    return {
      startDate: ymd(y, 1, 1),
      endDate: ymd(y, 12, 31),
      label: `${y}년(올해)`,
    }
  }

  if (/지난\s*달|전월/.test(text)) {
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const y = previousMonth.getFullYear()
    const m = previousMonth.getMonth() + 1
    return {
      startDate: ymd(y, m, 1),
      endDate: ymd(y, m, lastDayOfMonth(y, m)),
      label: `${y}년 ${m}월(지난달)`,
    }
  }

  if (/이번\s*달|금월|요번\s*달/.test(text)) {
    const y = now.getFullYear()
    const m = now.getMonth() + 1
    return {
      startDate: ymd(y, m, 1),
      endDate: ymd(y, m, now.getDate()),
      label: `${y}년 ${m}월(이번 달)`,
    }
  }

  // 1월~12월 전체 추이 질문은 연간으로 둠
  if (/1\s*월\s*[~～\-–—부터까지\s]*12\s*월/.test(text) && /월별|월간|그래프/.test(text)) {
    return {
      startDate: ymd(year, 1, 1),
      endDate: ymd(year, 12, 31),
      label: `${year}년 1월 ~ 12월`,
    }
  }

  // 7월 22일부터 28일까지 / 7월22일~7월28일 / 7월 22일에서 28일까지
  const dayRange = text.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*일\s*(?:부터|에서|~|-|–|—)\s*(?:(\d{1,2})\s*월\s*)?(\d{1,2})\s*일/,
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

  // 8월 첫날부터 10일까지 / 8월 1~10일
  const firstDayTo = text.match(
    /(\d{1,2})\s*월\s*(?:첫\s*날|1\s*일)\s*(?:부터|~|-)\s*(\d{1,2})\s*일/,
  )
  if (firstDayTo) {
    const m = Number(firstDayTo[1])
    const d2 = Number(firstDayTo[2])
    if (m >= 1 && m <= 12 && d2 >= 1) {
      return {
        startDate: ymd(year, m, 1),
        endDate: ymd(year, m, d2),
        label: `${year}년 ${m}월 1일 ~ ${m}월 ${d2}일`,
      }
    }
  }
  const monthDayTilde = text.match(
    /(\d{1,2})\s*월\s*(\d{1,2})\s*[~～\-–—]\s*(\d{1,2})\s*일/,
  )
  if (monthDayTilde) {
    const m = Number(monthDayTilde[1])
    const d1 = Number(monthDayTilde[2])
    const d2 = Number(monthDayTilde[3])
    if (m >= 1 && m <= 12 && d1 >= 1 && d2 >= 1) {
      return {
        startDate: ymd(year, m, d1),
        endDate: ymd(year, m, d2),
        label: `${year}년 ${m}월 ${d1}일 ~ ${m}월 ${d2}일`,
      }
    }
  }

  // 8/1~8/10 · 8.1~8.10 (연도 생략)
  const slashRange = text.match(
    /(\d{1,2})\s*[./]\s*(\d{1,2})\s*(?:부터|~|-|–|—)\s*(\d{1,2})\s*[./]\s*(\d{1,2})/,
  )
  if (slashRange && !/(20\d{2})/.test(slashRange[0]!)) {
    const m1 = Number(slashRange[1])
    const d1 = Number(slashRange[2])
    const m2 = Number(slashRange[3])
    const d2 = Number(slashRange[4])
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
    const startDate = ymd(year, m, 1)
    const endDate = ymd(year, m, lastDayOfMonth(year, m))
    return {
      startDate,
      endDate,
      label: `${startDate} ~ ${endDate}`,
    }
  }

  // compact에만 남은 짧은 표현 (이번주/지난주 등 공백 제거본)
  if (n.includes('이번주') || n.includes('금주') || n.includes('당주')) {
    const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const w = getWeekOfMonth(today)
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    const range = getWeekDateRange(y, m, w)
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${y}년 ${m}월 ${w}주차(이번 주)`,
    }
  }
  if (n.includes('지난주') || n.includes('전주') || n.includes('저번주')) {
    const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
    const w = getWeekOfMonth(today)
    const m = now.getMonth() + 1
    const y = now.getFullYear()
    let py = y
    let pm = m
    let pw = w - 1
    if (pw < 1) {
      pm = m === 1 ? 12 : m - 1
      py = m === 1 ? y - 1 : y
      const lastDay = lastDayOfMonth(py, pm)
      pw = Math.min(5, Math.ceil(lastDay / 7))
    }
    const range = getWeekDateRange(py, pm, pw)
    return {
      startDate: range.startDate,
      endDate: range.endDate,
      label: `${py}년 ${pm}월 ${pw}주차(지난주)`,
    }
  }

  return null
}

/** 전주·전월 대비 비교용: 기준 기간 + 비교 기간 */
export function parseComparePeriods(
  text: string,
  now = new Date(),
): { current: AiQueryPeriod; previous: AiQueryPeriod; label: string } | null {
  const n = compact(text)
  const wantsCompare =
    includesAny(n, [
      '대비',
      '비교',
      '보다',
      '늘었',
      '줄었',
      '증가',
      '감소',
      '증감',
      '차이',
      '올랐',
      '내렸',
      '좋아졌',
      '나빠졌',
    ]) ||
    /지난주.*이번주|전주.*이번|지난달.*이번달|전월.*이번/.test(n)

  if (!wantsCompare) return null

  // 주간 비교
  if (
    includesAny(n, ['지난주', '전주', '저번주', '이번주', '금주', '당주']) ||
    /주/.test(text)
  ) {
    if (
      includesAny(n, ['지난주', '전주', '저번주', '이번주', '금주', '당주']) ||
      /주\s*대|주하고|주와|주랑/.test(text)
    ) {
      const today = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
      const w = getWeekOfMonth(today)
      const m = now.getMonth() + 1
      const y = now.getFullYear()
      const cur = getWeekDateRange(y, m, w)
      let py = y
      let pm = m
      let pw = w - 1
      if (pw < 1) {
        pm = m === 1 ? 12 : m - 1
        py = m === 1 ? y - 1 : y
        const lastDay = lastDayOfMonth(py, pm)
        pw = Math.min(5, Math.ceil(lastDay / 7))
      }
      const prev = getWeekDateRange(py, pm, pw)
      return {
        current: {
          startDate: cur.startDate,
          endDate: cur.endDate,
          label: `${y}년 ${m}월 ${w}주차(이번 주)`,
        },
        previous: {
          startDate: prev.startDate,
          endDate: prev.endDate,
          label: `${py}년 ${pm}월 ${pw}주차(지난주)`,
        },
        label: '지난주 대비 이번 주',
      }
    }
  }

  // 월간 비교
  if (includesAny(n, ['지난달', '전월', '이번달', '금월'])) {
    const cy = now.getFullYear()
    const cm = now.getMonth() + 1
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const py = prevDate.getFullYear()
    const pm = prevDate.getMonth() + 1
    return {
      current: {
        startDate: ymd(cy, cm, 1),
        endDate: ymd(cy, cm, now.getDate()),
        label: `${cy}년 ${cm}월(이번 달)`,
      },
      previous: {
        startDate: ymd(py, pm, 1),
        endDate: ymd(py, pm, lastDayOfMonth(py, pm)),
        label: `${py}년 ${pm}월(지난달)`,
      },
      label: '전월 대비 이번 달',
    }
  }

  return null
}

function baseFilters(
  group: AnalysisGroupId = 'all',
  period?: AiQueryPeriod | null,
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

/** 현장 오타·동의어를 표준 표현으로 정규화 */
function normalizeQuestionText(raw: string): string {
  return raw
    .replace(/탑\s*(\d+)/gi, 'TOP$1')
    .replace(/워스트\s*(\d+)/gi, 'WORST$1')
    .replace(/\bworst\s*(\d+)/gi, 'WORST$1')
    .replace(/요번\s*주/g, '이번 주')
    .replace(/요번주/g, '이번 주')
    .replace(/요번\s*달/g, '이번 달')
    .replace(/요번달/g, '이번달')
    .replace(/이번주/g, '이번 주')
    .replace(/지난주/g, '지난 주')
    .replace(/폐기\s*비(?![용가])/g, '폐기비용')
    .replace(/불량\s*퍼센트/g, '부적합률')
    .replace(/불량\s*비율/g, '부적합률')
    .replace(/불량율/g, '부적합률')
    .replace(/불량률/g, '부적합률')
    .replace(/ng\s*율|ng율|ng률/gi, '부적합률')
    .replace(/검사\s*수량|검사한\s*수량|검사량/g, '검수량')
    .replace(/품목번호|제품번호|모델명|품목(?!\w)|부품(?!\w)/g, '품번')
    .replace(/불량품|ng(?![가-힣a-z])/gi, '부적합')
    .replace(/본사\s*공장/g, '본사')
    .replace(/구지공장|구지(?!\w)/g, '2공장')
    .replace(/그로메트|그로멧/g, 'GROMMET')
    .replace(/씰(?!\w)/g, 'SEAL')
    .replace(/08\s*-\s*0?(\d+)\s*[~～\-–—]\s*08\s*-\s*0?(\d+)/g, '8월 $1일~$2일')
    .replace(/08\s*-\s*(\d{1,2})\s*[~～\-–—]\s*08\s*-\s*(\d{1,2})/g, '8월 $1일~$2일')
}

export type QueryFilters = {
  qtyMin: number | null
  qtyMax: number | null
  ppmMin: number | null
  ppmMax: number | null
  failMin: number | null
  failMax: number | null
  scrapMin: number | null
  scrapMax: number | null
  /** 검수량 중앙값 이상 + 부적합률 정렬 */
  highQtyAndHighFailRate: boolean
  /** 불량수 낮고 부적합률 높음 */
  lowFailHighRate: boolean
  /** 부적합률·부적합수량 둘 다 높음 */
  highRateAndHighFail: boolean
  /** 검수량 낮은데 부적합률 높음 */
  lowQtyHighFailRate: boolean
  /** 검수량 많은데 부적합수량 적음 */
  highQtyLowFail: boolean
  /** 검수량·부적합수량 둘 다 많음 */
  highQtyAndHighFail: boolean
  /** 부적합률·폐기비용 둘 다 높음 */
  highRateAndHighScrap: boolean
  /** 부적합률 낮은데 부적합수량 많음 */
  lowRateHighFail: boolean
}

function emptyFilters(): QueryFilters {
  return {
    qtyMin: null,
    qtyMax: null,
    ppmMin: null,
    ppmMax: null,
    failMin: null,
    failMax: null,
    scrapMin: null,
    scrapMax: null,
    highQtyAndHighFailRate: false,
    lowFailHighRate: false,
    highRateAndHighFail: false,
    lowQtyHighFailRate: false,
    highQtyLowFail: false,
    highQtyAndHighFail: false,
    highRateAndHighScrap: false,
    lowRateHighFail: false,
  }
}

function thresholdOpFromText(chunk: string): 'gte' | 'gt' | 'lte' | 'lt' | null {
  if (/미만|안\s*넘는|미달/.test(chunk)) return 'lt'
  if (/이하|이하인|이하인품|이하만/.test(chunk)) return 'lte'
  if (/초과|넘는|넘어서|넘은/.test(chunk)) return 'gt'
  if (/이상|이상인|이상만|이상인품/.test(chunk)) return 'gte'
  return null
}

function applyThreshold(
  filters: QueryFilters,
  field: 'qty' | 'ppm' | 'fail' | 'scrap',
  value: number,
  op: 'gte' | 'gt' | 'lte' | 'lt',
) {
  const v = op === 'gt' ? value + (field === 'ppm' ? 1 : 1) : value
  const isMin = op === 'gte' || op === 'gt'
  if (field === 'qty') {
    if (isMin) filters.qtyMin = Math.max(filters.qtyMin ?? 0, v)
    else filters.qtyMax = Math.min(filters.qtyMax ?? Number.POSITIVE_INFINITY, op === 'lt' ? value - 1 : value)
  } else if (field === 'ppm') {
    if (isMin) filters.ppmMin = Math.max(filters.ppmMin ?? 0, v)
    else filters.ppmMax = Math.min(filters.ppmMax ?? Number.POSITIVE_INFINITY, op === 'lt' ? value - 1 : value)
  } else if (field === 'fail') {
    if (isMin) filters.failMin = Math.max(filters.failMin ?? 0, v)
    else filters.failMax = Math.min(filters.failMax ?? Number.POSITIVE_INFINITY, op === 'lt' ? value - 1 : value)
  } else {
    if (isMin) filters.scrapMin = Math.max(filters.scrapMin ?? 0, v)
    else filters.scrapMax = Math.min(filters.scrapMax ?? Number.POSITIVE_INFINITY, op === 'lt' ? value - 1 : value)
  }
}

/** 복합 AND 조건 파서 */
function parseQueryFilters(text: string, n: string): QueryFilters {
  const f = emptyFilters()

  // % / 프로 → ppm
  for (const m of text.matchAll(
    /(?:부적합률|부적합율|불량률|불량율|ng율|ng률)?[^\d]{0,10}(\d+(?:\.\d+)?)\s*(?:%|％|프로|퍼센트)\s*(이상|이하|미만|넘는|초과|안\s*넘는)?/gi,
  )) {
    const pct = Number(m[1])
    if (!Number.isFinite(pct)) continue
    const op = thresholdOpFromText(m[2] ?? '이상') ?? 'gte'
    applyThreshold(f, 'ppm', Math.round(pct * 10_000), op)
  }
  for (const m of n.matchAll(
    /(\d+(?:\.\d+)?)(?:%|％|프로|퍼센트)(이상|이하|미만|넘는|초과)?/g,
  )) {
    if (!includesAny(n, ['부적합', '불량', '률', '율', '%', '프로'])) continue
    const pct = Number(m[1])
    if (!Number.isFinite(pct) || pct > 100) continue
    const op = thresholdOpFromText(m[2] ?? '이상') ?? 'gte'
    applyThreshold(f, 'ppm', Math.round(pct * 10_000), op)
  }

  // 검수량
  for (const m of text.matchAll(
    /검\s*[수사]\s*량[^\d만]{0,20}([\d,]+|\d+(?:\.\d+)?\s*만(?:개|ea)?|만(?:개|ea)?)\s*(?:ea|EA|개)?\s*(이상|이하|미만|넘는|초과)?/gi,
  )) {
    const v = parseKoreanAmount(String(m[1]).replace(/\s+/g, '')) ?? Number(String(m[1]).replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    const op = thresholdOpFromText(m[2] ?? '이상') ?? 'gte'
    applyThreshold(f, 'qty', v, op)
  }

  // 부적합/불량 수량 (개) — TOP10 등 순위 숫자는 제외
  for (const m of text.matchAll(
    /(?:부적합|불량)(?:수량|수|개수)?[^\d]{0,12}([\d,]+)\s*(?:개|건)\s*(이상|이하|미만|넘는|초과)?/gi,
  )) {
    const around = m[0]
    if (/률|율|%|프로|ppm|top|worst|상위/i.test(around)) continue
    const v = Number(String(m[1]).replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    const op = thresholdOpFromText(m[2] ?? '이상') ?? 'gte'
    applyThreshold(f, 'fail', v, op)
  }
  // "불량이 10개 이상"
  for (const m of text.matchAll(
    /불량(?:이|은)?\s*([\d,]+)\s*(?:개|건)\s*(이상|이하|미만|넘는|초과)/gi,
  )) {
    const v = Number(String(m[1]).replace(/,/g, ''))
    if (!Number.isFinite(v) || v <= 0) continue
    const op = thresholdOpFromText(m[2] ?? '이상') ?? 'gte'
    applyThreshold(f, 'fail', v, op)
  }

  // 폐기비용
  const scrap = parseScrapCostMin(text, n)
  if (scrap != null) f.scrapMin = scrap
  for (const m of text.matchAll(
    /폐기[^\d만백]{0,16}(\d+(?:\.\d+)?\s*만\s*원|\d+(?:\.\d+)?\s*백만(?:원)?|[\d,]+)\s*(?:원)?\s*(이하|미만)/gi,
  )) {
    const v = parseKoreanAmount(m[1].replace(/\s+/g, '')) ?? Number(String(m[1]).replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) applyThreshold(f, 'scrap', v, 'lte')
  }

  // 상대 조건
  if (
    (includesAny(n, ['검수량많은', '검사량많은', '검수량이많은', '많은데', '많이했는데']) &&
      includesAny(n, ['부적합률', '불량률', '부적합율', '불량율', '불량도높은', '불량높은'])) ||
    /검수량이?\s*많[^]*부적합률|검수량이?\s*많[^]*불량률|검수\s*많이\s*했[^]*불량/.test(
      text,
    )
  ) {
    f.highQtyAndHighFailRate = true
  }
  if (
    (includesAny(n, ['검수량적은데', '검사량적은데', '검수량은적은']) &&
      includesAny(n, ['부적합률', '불량률', '높은'])) ||
    /검수량(?:은|이)?\s*적[^]*부적합률|검수량(?:은|이)?\s*적[^]*불량률/.test(text)
  ) {
    f.lowQtyHighFailRate = true
  }
  if (
    includesAny(n, ['불량은적은데', '부적합은적은데', '불량적은데']) ||
    (/불량(?:은|이)?\s*적/.test(text) && includesAny(n, ['부적합률', '불량률', '높은']))
  ) {
    f.lowFailHighRate = true
  }
  if (
    (includesAny(n, ['부적합률높은데', '불량률높은데', '부적합률높은', '불량률높은']) &&
      includesAny(n, ['부적합수량', '불량수량', '실제불량', '개수도'])) ||
    /(?:부적합률|불량률).{0,12}높은데.{0,16}(?:실제\s*)?(?:불량|부적합)\s*(?:수량|개수)/.test(
      text,
    ) ||
    /불량률은높은데실제불량|률은높은데불량개수/.test(n)
  ) {
    f.highRateAndHighFail = true
  }
  if (includesAny(n, ['검수량대비', '검사량대비']) && includesAny(n, ['불량', '부적합'])) {
    // 검수량 대비 불량 많음 = 부적합률
    f.highQtyAndHighFailRate = f.highQtyAndHighFailRate || false
  }

  // "검수량 100개 미만은 제외" → qtyMin = 100
  for (const m of text.matchAll(
    /검\s*[수사]\s*량[^\d]{0,16}([\d,]+)\s*(?:개|ea|EA)?\s*(?:미만|이하).{0,8}제외/gi,
  )) {
    const v = Number(String(m[1]).replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) {
      applyThreshold(f, 'qty', v, /미만/.test(m[0]) ? 'gte' : 'gt')
    }
  }
  // "부적합률 5% 미만 제외"
  for (const m of text.matchAll(
    /(?:부적합률|부적합율|불량률|불량율)[^\d]{0,12}(\d+(?:\.\d+)?)\s*(?:%|％|프로)?\s*(?:미만|이하).{0,8}제외/gi,
  )) {
    const pct = Number(m[1])
    if (Number.isFinite(pct) && pct > 0) {
      applyThreshold(f, 'ppm', Math.round(pct * 10_000), /미만/.test(m[0]) ? 'gte' : 'gt')
    }
  }

  if (
    (includesAny(n, ['검수량은많은데', '검수량많은데', '검수량이많은데']) &&
      includesAny(n, ['불량수량은적은', '부적합수량은적은', '불량적은', '불량수량은적'])) ||
    /검수량(?:은|이)?\s*많[^]*불량수량(?:은|이)?\s*적/.test(text)
  ) {
    f.highQtyLowFail = true
  }
  if (
    /검수량.{0,12}불량수량.{0,8}둘\s*다\s*많|불량수량.{0,12}검수량.{0,8}둘\s*다\s*많/.test(
      text,
    ) ||
    includesAny(n, ['검수량과불량수량둘다', '둘다많은품번'])
  ) {
    f.highQtyAndHighFail = true
  }
  if (
    /부적합률.{0,12}폐기비용.{0,8}둘\s*다|폐기비용.{0,12}부적합률.{0,8}둘\s*다/.test(
      text,
    ) ||
    includesAny(n, ['부적합률과폐기비용둘다', '률과폐기둘다'])
  ) {
    f.highRateAndHighScrap = true
  }
  if (
    (/부적합률(?:은|이)?\s*낮/.test(text) &&
      includesAny(n, ['불량수량', '부적합수량', '많은'])) ||
    /부적합률은낮지만불량|률은낮은데불량많/.test(n)
  ) {
    f.lowRateHighFail = true
  }

  // 기존 파서 보강 (fallback)
  if (f.qtyMin == null) f.qtyMin = parseQtyMinEa(text, n)
  if (f.ppmMin == null) f.ppmMin = parsePpmMin(text, n)
  if (f.scrapMin == null) f.scrapMin = parseScrapCostMin(text, n)

  return f
}

function applyProductFilters(
  products: ProductRow[],
  f: QueryFilters,
): ProductRow[] {
  let list = [...products]
  if (f.qtyMin != null) list = list.filter((p) => p.qty >= f.qtyMin!)
  if (f.qtyMax != null) list = list.filter((p) => p.qty <= f.qtyMax!)
  if (f.ppmMin != null) list = list.filter((p) => p.failRate >= f.ppmMin!)
  if (f.ppmMax != null) list = list.filter((p) => p.failRate <= f.ppmMax!)
  if (f.failMin != null) list = list.filter((p) => p.fail >= f.failMin!)
  if (f.failMax != null) list = list.filter((p) => p.fail <= f.failMax!)
  if (f.scrapMin != null) list = list.filter((p) => p.scrapCost >= f.scrapMin!)
  if (f.scrapMax != null) list = list.filter((p) => p.scrapCost <= f.scrapMax!)

  if (f.highQtyAndHighFailRate && list.length) {
    const med = median(list.map((p) => p.qty))
    list = list.filter((p) => p.qty >= med)
  }
  if (f.lowFailHighRate && list.length) {
    const fails = [...list.map((p) => p.fail)].sort((a, b) => a - b)
    const cut = fails[Math.floor(fails.length * 0.4)] ?? 0
    list = list.filter((p) => p.fail <= cut)
  }
  if (f.lowQtyHighFailRate && list.length) {
    const med = median(list.map((p) => p.qty))
    list = list.filter((p) => p.qty <= med)
  }
  if (f.highQtyLowFail && list.length) {
    const medQty = median(list.map((p) => p.qty))
    const medFail = median(list.map((p) => p.fail))
    list = list.filter((p) => p.qty >= medQty && p.fail <= medFail)
  }
  if (f.highQtyAndHighFail && list.length) {
    const medQty = median(list.map((p) => p.qty))
    const medFail = median(list.map((p) => p.fail))
    list = list.filter((p) => p.qty >= medQty && p.fail >= medFail)
  }
  if (f.highRateAndHighScrap && list.length) {
    const medRate = median(list.map((p) => p.failRate))
    const medScrap = median(list.map((p) => p.scrapCost))
    list = list.filter((p) => p.failRate >= medRate && p.scrapCost >= medScrap)
  }
  if (f.lowRateHighFail && list.length) {
    const medRate = median(list.map((p) => p.failRate))
    const medFail = median(list.map((p) => p.fail))
    list = list.filter((p) => p.failRate <= medRate && p.fail >= medFail)
  }
  if (f.highRateAndHighFail && list.length) {
    const medFail = median(list.map((p) => p.fail))
    const medRate = median(list.map((p) => p.failRate))
    list = list.filter((p) => p.fail >= medFail && p.failRate >= medRate)
  }
  return list
}

function filtersNote(f: QueryFilters): string[] {
  const notes: string[] = []
  if (f.qtyMin != null) notes.push(`검수량 ≥ ${f.qtyMin.toLocaleString()}EA`)
  if (f.qtyMax != null) notes.push(`검수량 ≤ ${f.qtyMax.toLocaleString()}EA`)
  if (f.ppmMin != null)
    notes.push(`부적합률 ≥ ${formatPpm(f.ppmMin)} (${(f.ppmMin / 10_000).toFixed(2).replace(/\.?0+$/, '')}%)`)
  if (f.ppmMax != null)
    notes.push(`부적합률 ≤ ${formatPpm(f.ppmMax)}`)
  if (f.failMin != null) notes.push(`부적합수량 ≥ ${f.failMin.toLocaleString()}`)
  if (f.failMax != null) notes.push(`부적합수량 ≤ ${f.failMax.toLocaleString()}`)
  if (f.scrapMin != null) notes.push(`폐기비용 ≥ ${formatWon(f.scrapMin)}`)
  if (f.scrapMax != null) notes.push(`폐기비용 ≤ ${formatWon(f.scrapMax)}`)
  if (f.highQtyAndHighFailRate) notes.push('검수량 중앙값 이상 + 부적합률 기준')
  if (f.lowFailHighRate) notes.push('부적합수 하위 + 부적합률 높음')
  if (f.lowQtyHighFailRate) notes.push('검수량 중앙값 이하 + 부적합률 높음')
  if (f.highQtyLowFail) notes.push('검수량 중앙값 이상 + 부적합수량 적음')
  if (f.highQtyAndHighFail) notes.push('검수량·부적합수량 모두 중앙값 이상')
  if (f.highRateAndHighScrap) notes.push('부적합률·폐기비용 모두 중앙값 이상')
  if (f.lowRateHighFail) notes.push('부적합률 중앙값 이하 + 부적합수량 많음')
  if (f.highRateAndHighFail) notes.push('부적합률·부적합수량 모두 중앙값 이상')
  return notes
}

function criteriaBlock(opts: {
  periodNote: string
  scopeText: string
  metricLabel: string
  ascending?: boolean
  limit?: number | null
  filterNotes?: string[]
}): AiBlock {
  const lines = [
    `조회 조건 · ${opts.periodNote}`,
    `범위: ${opts.scopeText}`,
    `지표: ${opts.metricLabel}${opts.ascending ? ' (낮은/적은 순)' : ' (높은/많은 순)'}`,
  ]
  if (opts.limit != null && opts.limit > 0) lines.push(`TOP ${opts.limit}`)
  if (opts.filterNotes?.length) lines.push(`필터: ${opts.filterNotes.join(' · ')}`)
  return textBlock(...lines)
}

function hasDataInPeriod(
  records: InspectionRecord[],
  period: AiQueryPeriod | null,
  groups: typeof GROUP_ALIASES,
): boolean {
  for (const r of records) {
    if (!isAnalyzable(r)) continue
    if (period && (r.date < period.startDate || r.date > period.endDate)) continue
    if (groups.length) {
      const ok = groups.some((g) => {
        if (g.id === 'plant2') return r.team.includes('2공장')
        if (g.id === 'seal')
          return r.team.includes('본사') && /seal|실링|씰/i.test(r.productType)
        if (g.id === 'hydraulic')
          return (
            r.team.includes('본사') &&
            /grommet|그로멧|유압/i.test(r.productType)
          )
        return true
      })
      if (!ok) continue
    }
    return true
  }
  return false
}

/** "1만"·"만개"·"백만원" 등 현장 숫자 표현 → 숫자 */
function parseKoreanAmount(raw: string): number | null {
  const t = raw.replace(/,/g, '').trim().toLowerCase()
  if (!t) return null
  // 1만 / 1.5만 / 만
  const man = t.match(/^(\d+(?:\.\d+)?)\s*만(?:개|ea)?$/) ?? (t === '만' || t === '만개' ? ['만', '1'] : null)
  if (man) {
    const v = Number(man[1])
    if (Number.isFinite(v)) return Math.round(v * 10_000)
  }
  // 백만 / 1백만 / 100만
  const millionWon =
    t.match(/^(\d+(?:\.\d+)?)\s*백만(?:원)?$/) ??
    (t === '백만' || t === '백만원' ? ['백만', '1'] : null)
  if (millionWon) {
    const v = Number(millionWon[1])
    if (Number.isFinite(v)) return Math.round(v * 1_000_000)
  }
  const manWon = t.match(/^(\d+(?:\.\d+)?)\s*만\s*원$/)
  if (manWon) {
    const v = Number(manWon[1])
    if (Number.isFinite(v)) return Math.round(v * 10_000)
  }
  const plain = Number(t.replace(/[^\d.]/g, ''))
  return Number.isFinite(plain) && plain > 0 ? plain : null
}

function topN(text: string, fallback = 5, max = 50) {
  // TOP/WORST/상위 명시가 있으면 그것을 우선 (필터의 "100개 미만"과 구분)
  const explicit =
    text.match(/(?:top|worst|Worst|WORST|하위)\s*(\d+)/i) ??
    text.match(/상위\s*(\d+)/i) ??
    text.match(/(?:가장|제일)\s*(?:높은|많은|큰|낮은|적은)\s*(\d+)\s*개/i) ??
    text.match(/(\d+)\s*까지/)
  if (explicit) {
    const n = Number(explicit[1])
    if (Number.isFinite(n) && n > 0) return Math.min(n, max)
  }
  // "5개만 보여줘" / "품번 5개" — 단, "100개 이상/미만/제외" 필터는 제외
  const countOnly = text.match(/(\d+)\s*개\s*만/) ?? text.match(/(\d+)\s*개(?!\s*(?:이상|미만|이하|초과|제외))/)
  if (countOnly && !/(?:미만|이상|이하|초과).{0,6}제외|제외.{0,6}(?:미만|이상)/.test(text)) {
    // 필터 문맥이면 무시
    if (/검\s*[수사]\s*량[^\d]{0,12}\d+\s*개/.test(text) && /(이상|미만|이하)/.test(text)) {
      return fallback
    }
    const n = Number(countOnly[1])
    if (Number.isFinite(n) && n > 0 && n <= max) return n
  }
  return fallback
}

function wantsAscendingSort(n: string, text: string) {
  if (includesAny(n, ['하위'])) return true
  if (
    includesAny(n, ['낮은순', '적은순', '낮은', '적은']) &&
    !includesAny(n, ['높은순', '많은순', '높은', '많은', '심한'])
  ) {
    return true
  }
  if (/낮은\s*순|적은\s*순/.test(text)) return true
  return false
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
 * 검수량 N EA 이상 — "검수량 10000ea 이상", "검사량 10,000 이상", "1만 이상"
 * (부적합률 10,000ppm 와 구분)
 */
function parseQtyMinEa(text: string, n: string): number | null {
  // 1만 / 만개 이상 (검수량 문맥)
  if (
    includesAny(n, ['검수량', '검사량', '검수', '검사실적']) ||
    /검\s*[수사]\s*량/.test(text)
  ) {
    const manHit =
      text.match(
        /검\s*[수사]\s*량[^\d만]{0,12}(\d+(?:\.\d+)?\s*만(?:개|ea)?|만(?:개|ea)?)\s*이상/i,
      ) ??
      n.match(/검(?:수|사)량[^\d만]{0,8}(\d+(?:\.\d+)?만(?:개|ea)?|만(?:개|ea)?)이상/)
    if (manHit?.[1]) {
      const v = parseKoreanAmount(manHit[1])
      if (v != null && v > 0) return v
    }
  }

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
  // "검수량 10000 이상인 품번" (단위 생략)
  const bare = text.match(
    /검\s*[수사]\s*량[^\d]{0,24}([\d,]+)\s*이상/i,
  )
  if (bare?.[1]) {
    const v = Number(bare[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
}

/**
 * 부적합률 N ppm/% 이상 — "10000ppm", "5%", "5프로", "부적합률이 10000 이상"
 */
function parsePpmMin(text: string, n: string): number | null {
  // 5% / 5프로 / 5퍼센트 → ppm (이상/넘는)
  const pct =
    text.match(
      /(?:부적합률|부적합율|불량률|불량율)?[^\d]{0,8}(\d+(?:\.\d+)?)\s*(?:%|％|프로|퍼센트)\s*(?:이상|넘는|초과)/,
    ) ?? n.match(/(\d+(?:\.\d+)?)(?:%|％|프로|퍼센트)(?:이상|넘는|초과)/)
  if (pct?.[1]) {
    const v = Number(pct[1])
    if (Number.isFinite(v) && v > 0) return Math.round(v * 10_000)
  }

  const compactHit =
    n.match(
      /(?:부적합률|부적합율|불량률|불량율)(?:이|가)?([\d,]+)(?:ppm|pm)?(?:이상|넘는|초과)/,
    ) ?? n.match(/([\d,]+)(?:ppm|pm)(?:이상|넘는|초과)/)
  if (compactHit?.[1]) {
    const v = Number(String(compactHit[1]).replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  const fromText = text.match(
    /(?:부적합률|부적합율|불량률|불량율|ppm|pm)[^\d]{0,12}([\d,]+)\s*(?:ppm|pm)?\s*(?:이상|넘는|초과)/i,
  )
  if (fromText?.[1]) {
    const v = Number(fromText[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) return v
  }
  return null
}

/**
 * 폐기비용 N원 이상 — "100만원", "백만원", "1,000,000원"
 */
function parseScrapCostMin(text: string, n: string): number | null {
  if (!includesAny(n, ['폐기', '비용', '금액'])) return null

  const man =
    text.match(
      /폐기[^\d만백]{0,16}(\d+(?:\.\d+)?\s*만\s*원|\d+(?:\.\d+)?\s*백만(?:원)?|백만(?:원)?)\s*(?:이상|넘는|초과)/,
    ) ??
    n.match(
      /폐기[^\d만백]{0,12}(\d+(?:\.\d+)?만원|\d+(?:\.\d+)?백만(?:원)?|백만(?:원)?)(?:이상|넘는|초과)/,
    )
  if (man?.[1]) {
    const v = parseKoreanAmount(man[1].replace(/\s+/g, ''))
    if (v != null && v > 0) return v
  }

  const won = text.match(
    /폐기[^\d]{0,20}([\d,]+)\s*원?\s*(?:이상|넘는|초과)/,
  )
  if (won?.[1]) {
    const v = Number(won[1].replace(/,/g, ''))
    if (Number.isFinite(v) && v > 0) {
      // "100만" 없이 숫자만 있고 문맥이 만원이면 이미 man에서 처리됨
      return v
    }
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
  /** GROMMET만 말한 종합 질의 → 본사+2공장 각각 + 합계 (명시적 "전체/종합"일 때만) */
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
    '본사grommet',
    '본사(grommet',
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
  const wantsHqAll =
    includesAny(n, ['본사전체', '1공장전체', '본사전부']) ||
    (hasBareHqWord && includesAny(n, ['전체']) && !hasSealWord && !hasGrommetWord)
  const hasHq =
    hasBare1Plant ||
    (has1PlantSeal && excludeHint !== 'seal') ||
    (has1PlantGrommet && excludeHint !== 'grommet' && excludeHint !== 'hydraulic') ||
    hasBareHqWord
  const hasPlant2 = includesAny(n, [
    '2공장',
    '이공장',
    'plant2',
    '구지',
    '구지공장',
    '구지쪽',
  ])
  /** SEAL/GROMMET 라인을 특정하지 않은 본사·1공장 */
  const hqUnspecified =
    !hasSealWord &&
    !hasGrommetWord &&
    !(has1PlantSeal && excludeHint !== 'seal') &&
    !(has1PlantGrommet && excludeHint !== 'grommet')

  // 2공장(+GROMMET/SEAL)만 물으면 2공장만 — 구지/구지공장 포함
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

    // 1공장 GROMMET / 본사(GROMMET) / 유압·그로멧 (공장 미지정도 본사 GROMMET)
    if (
      excludeHint !== 'grommet' &&
      excludeHint !== 'hydraulic' &&
      (has1PlantGrommet ||
        (hasGrommetWord && hasHq) ||
        (hasGrommetWord && !hasPlant2 && !hasSealWord))
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

    // "1공장" / "본사"만 (라인 미지정) → 본사 전체(SEAL + GROMMET)
    // "본사 전체" 명시
    if ((hqUnspecified && (hasBare1Plant || hasBareHqWord)) || wantsHqAll) {
      if (excludeHint !== 'seal') hitIds.add('seal')
      if (excludeHint !== 'grommet' && excludeHint !== 'hydraulic') {
        hitIds.add('hydraulic')
      }
    }

    if (hasPlant2) hitIds.add('plant2')
  }

  // "2공장 빼고 전체" / "SEAL만 빼고" → 해당 그룹 제거
  if (
    (/2공장|이공장|구지/.test(n) && /빼|제외/.test(n)) ||
    /공장\s*조건\s*빼/.test(n)
  ) {
    hitIds.delete('plant2')
  }
  if (/seal|실링|씰/.test(n) && /빼|제외/.test(n) && includesAny(n, ['전체', '보여', '알려'])) {
    hitIds.delete('seal')
  }

  // GROMMET 종합(본사+2공장)은 "그로멧 전체/종합/합계"처럼 명시할 때만
  if (
    hasGrommetWord &&
    !hasPlant2 &&
    !hasHq &&
    !hasSealWord &&
    !has1PlantSeal &&
    includesAny(n, ['전체', '종합', '합계', '모두', '전부'])
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
  if (includesAny(n, ['전체공장', '전체', '각각', '공장별', '공장'])) {
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
  period?: AiQueryPeriod | null,
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
  metric: AiMetric,
  top = 5,
  layout: 'vertical' | 'horizontal' = 'vertical',
): AiBlock {
  const format: AiValueFormat =
    metric === 'failRate'
      ? 'ppm'
      : metric === 'qty'
        ? 'qty'
        : metric === 'fail'
          ? 'count'
          : 'won'
  const valueLabel =
    metric === 'failRate'
      ? '부적합률'
      : metric === 'qty'
        ? '검수량'
        : metric === 'fail'
          ? '부적합수량'
          : '폐기비용'
  return {
    type: 'bar',
    title,
    format,
    valueLabel,
    layout,
    data: rows.slice(0, top).map((p) => ({
      name: p.name,
      value:
        metric === 'scrapCost'
          ? roundWon(p.scrapCost)
          : metric === 'qty'
            ? p.qty
            : metric === 'fail'
              ? p.fail
              : p.failRate,
    })),
  }
}

/** 차트 종류 요청 해석 (명시 요청 우선) */
export type AiChartKind =
  | 'bar'
  | 'hbar'
  | 'line'
  | 'pie'
  | 'stacked'
  | 'percentStacked'
  | 'scatter'
  | 'multi'
  | null

function detectChartKind(n: string, text: string): AiChartKind {
  if (
    includesAny(n, [
      '100%누적',
      '100퍼센트누적',
      '백분율누적',
      '비율누적',
      '100%stacked',
    ]) ||
    (/100\s*%/.test(text) && includesAny(n, ['누적']))
  ) {
    return 'percentStacked'
  }
  if (includesAny(n, ['누적막대', '누적으로', '스택', 'stacked', '쌓은'])) {
    return 'stacked'
  }
  if (includesAny(n, ['산점도', 'scatter', '상관', '관계'])) {
    // "관계"만으로 너무 넓으면 산점도 후보 — 두 지표가 있을 때
    if (
      includesAny(n, ['산점도', 'scatter']) ||
      (includesAny(n, ['관계']) &&
        (includesAny(n, ['검수', '생산']) &&
          includesAny(n, ['부적합', '불량', '폐기'])))
    ) {
      return 'scatter'
    }
  }
  if (
    includesAny(n, ['가로막대', '가로로', '수평막대', 'horizontal']) ||
    (/가로/.test(text) && includesAny(n, ['막대', '그래프', '차트']))
  ) {
    return 'hbar'
  }
  if (includesAny(n, ['원그래프', '원형', '파이', '도넛', '비중그래프'])) {
    return 'pie'
  }
  if (
    includesAny(n, ['선그래프', '선으로', '라인']) ||
    (includesAny(n, ['추이', '변화', '변했']) &&
      !includesAny(n, ['막대']) &&
      includesAny(n, ['그래프', '차트', '보여', '알려']))
  ) {
    return 'line'
  }
  if (includesAny(n, ['막대그래프', '막대로', '막대', 'bar'])) {
    return 'bar'
  }
  if (includesAny(n, ['그래프', '차트', '차트로'])) {
    // 목적 기반 기본값 — 호출부에서 재해석
    return null
  }
  return null
}

function wantsTableWithChart(n: string) {
  return (
    includesAny(n, ['표', '수치', '실제데이터', '수량도', '같이']) &&
    includesAny(n, ['그래프', '차트', '막대', '원', '선', '보여'])
  )
}

function wantsTotalInChart(n: string) {
  return includesAny(n, ['total', '합계', '총합', '전체합계'])
}

function inferDefaultChartKind(n: string, text: string): AiChartKind {
  const explicit = detectChartKind(n, text)
  if (explicit) return explicit
  if (
    includesAny(n, ['관계']) &&
    includesAny(n, ['검수', '생산']) &&
    includesAny(n, ['부적합', '불량', '폐기'])
  ) {
    return 'scatter'
  }
  if (
    includesAny(n, ['정상']) &&
    includesAny(n, ['부적합', '불량']) &&
    includesAny(n, ['비율', '구성', '비교', '비중'])
  ) {
    return 'percentStacked'
  }
  if (
    includesAny(n, ['비중', '비율', '구성비']) &&
    includesAny(n, ['불량유형', '유형']) &&
    !includesAny(n, ['공장별'])
  ) {
    return 'pie'
  }
  if (
    includesAny(n, ['구성', '나눠', '정상하고', '정상과부적합', '불량유형']) &&
    includesAny(n, ['공장', '월별'])
  ) {
    return 'stacked'
  }
  if (includesAny(n, ['추이', '변화', '월별', '주별', '주차', '일자별', '일별', '최근'])) {
    return 'line'
  }
  if (
    includesAny(n, ['top', '상위', 'worst', '비교', '많은', '높은']) ||
    includesAny(n, ['그래프', '차트'])
  ) {
    return 'bar'
  }
  return null
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

  const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'

  const metricLabel = metricLabelOf(metric)

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
  period?: AiQueryPeriod | null,
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
  period: AiQueryPeriod | null,
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
  period?: AiQueryPeriod | null,
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

/** 명시적인 이전 질문·결과 참조가 있을 때만 대화 문맥을 이어받는다. */
function isFollowUpAsk(n: string, text = '') {
  if (
    includesAny(n, [
      '방금',
      '직전',
      '이전',
      '아까',
      '앞서',
      '위에서',
      '위결과',
      '그리스트',
      '해당리스트',
      '그품번',
      '해당품번',
      '위품번',
      '이품번들',
      '이품번',
      '얘',
      '그결과',
      '해당결과',
      '나온품번',
      '위에서나온품번',
      '그질문',
      '위질문',
      '같은조건으로',
      '동일한조건으로',
      '다시집계',
      '다시조회',
      '기간을바꿔',
      '기간만변경',
      '이것만다시',
      '로변경해서보여',
      '지난주에도',
      '그때도',
      '그것도',
      '그럼',
      '바꿔줘',
      '바꿔',
      '다시정렬',
      '재정렬',
      '전체로',
      '전체보여',
      '전체공장',
      '조건빼고',
      '빼고전체',
      '빼고보여',
      '왜이',
      '왜그',
      '왜안좋',
      '설비별',
      '금형별',
      '검사자별',
      '성형작업자별',
      'lot별',
      '로트별',
      '줄여',
      '줄여줘',
      '몇위',
      '몇 위',
    ])
  ) {
    return true
  }

  if (n.includes('이번에는') && n.includes('기준으로')) return true
  if (/기준으로.*다시/.test(n)) return true

  // 짧은 후속: "1위만", "TOP3만", "검수량은?", "불량유형은", "막대그래프로"
  if (parseRankPick(text || n, n) != null && includesAny(n, ['만', '보여', '알려', '원인', '상세', '불량', '뭐', '누구', '어때'])) {
    return true
  }
  if (parseTopOnlyLimit(text || n, n) != null) return true
  if (
    /^(?:그럼)?(?:top|worst)?\s*\d+\s*(?:만|으로|로)/i.test(text.trim()) ||
    /^(?:그럼)?상위\s*\d+\s*(?:만|으로)/.test(text.trim()) ||
    /top\s*\d+\s*(?:으로|로)/i.test(text) ||
    /전체\s*(?:로\s*)?(?:보여|알려)|전체\s*공장/.test(text) ||
    /조건\s*빼고|빼고\s*전체|공장\s*조건\s*빼/.test(text) ||
    /(?:검수량|폐기비용|부적합률|부적합수량)\s*기준(?:으로)?/.test(text) ||
    /표로\s*(?:보여|바꿔)/.test(text) ||
    /숫자만\s*보여/.test(text) ||
    /^왜\s/.test(text.trim()) ||
    /원인이\s*뭐|이유가\s*뭐|왜\s*안\s*좋/.test(text) ||
    /(?:지난\s*주|지난주|지난\s*달|이번\s*주|이번\s*달)\s*(?:로|으로)/.test(text) ||
    /다시\s*이번\s*주/.test(text) ||
    /설비별|금형별|검사자별|성형\s*작업자|lot\s*별/i.test(text) ||
    /제일\s*많은\s*(?:설비|금형|공장|불량)/.test(text) ||
    /어느\s*공장|어디서\s*많이/.test(text) ||
    /중요한\s*것만|보고용|달라진\s*점/.test(text)
  ) {
    return true
  }
  if (
    includesAny(n, [
      '검수량은',
      '검수량도',
      '폐기비용도',
      '부적합률도',
      '불량유형은',
      '불량유형도',
      '불량유형을',
    ])
  ) {
    return true
  }
  if (
    includesAny(n, [
      '막대그래프로',
      '막대로',
      '원그래프로',
      '선그래프로',
      '표로도',
      '그래프로도',
      '가로막대',
      '누적으로',
    ])
  ) {
    return true
  }
  if (
    /만\s*(?:보여|알려|줘|주세요)?\s*$/.test(text.trim()) ||
    /(만보여|만알려|이상만|넘는것만)/.test(n)
  ) {
    return true
  }

  return false
}

/** 이전 문맥이 있을 때, 단독 신규 질의인지(후속 아님) */
function isStandaloneNewAsk(n: string, text: string) {
  // 기간+지표+대상이 충분히 갖춰진 새 질문
  const hasFreshPeriod =
    Boolean(parsePeriodFromQuestion(text, [], new Date())) ||
    includesAny(n, ['이번주', '지난주', '이번달', '지난달', '올해'])
  const hasFreshMetric = inferMetricFromText(n) != null || includesAny(n, ['worst', '현황', '요약'])
  const hasFreshTarget = includesAny(n, [
    '품번',
    '검사자',
    '검사원',
    '성형',
    '작업자',
    '설비',
    '금형',
    'lot',
    '불량유형',
    '공장',
  ])
  if (hasFreshPeriod && hasFreshMetric && hasFreshTarget) return true
  if (includesAny(n, ['대비', '비교']) && hasFreshMetric) return true
  // "부적합률 높은 품번 TOP5"처럼 완전한 신규 TOP
  // "왜 이 품번이 WORST 1위" 같은 후속 설명은 제외
  if (
    hasFreshMetric &&
    includesAny(n, ['품번', '검사자', '작업자', '설비', '금형']) &&
    /top\s*\d+|상위\s*\d+|worst\s*\d+|\d+\s*개/i.test(text) &&
    !/^왜\s|원인이\s*뭐|이유가\s*뭐|주요\s*불량/.test(text) &&
    !includesAny(n, ['왜이', '왜그', '이품번', '그품번'])
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

/** "TOP 3만", "상위5만", "3개만", "TOP5로", "TOP10으로 줄여" */
function parseTopOnlyLimit(text: string, n: string): number | null {
  const m =
    text.match(/(?:top|TOP|상위|worst|WORST)\s*(\d+)\s*(?:만|으로|로)/i) ??
    text.match(/(\d+)\s*(?:개|위)\s*만/) ??
    n.match(/(?:top|worst)(\d+)(?:만|으로|로)/) ??
    n.match(/상위(\d+)만/)
  if (m?.[1]) {
    const v = Number(m[1])
    if (Number.isFinite(v) && v > 0) return Math.min(v, 50)
  }
  if (includesAny(n, ['개만', '위만', '만보여', '만알려', '추려', '좁혀', '줄여'])) {
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

/** "검수량 순으로 / 검수량이 많은 순서대로" 등 명시적 검수량 정렬 의도 */
function hasExplicitQtySortIntent(n: string): boolean {
  if (!includesAny(n, ['검수량', '검사량'])) return false
  // "검수량 N EA 이상"은 필터이지 정렬이 아님
  if (includesAny(n, ['이상'])) return false
  if (
    includesAny(n, [
      '순으로',
      '순서대로',
      '순위',
      '많은순',
      '높은순',
      '낮은순',
      '적은순',
      '재정렬',
    ])
  ) {
    return true
  }
  // compact 문자열: "검수량이많은", "검수량많은순서" 등
  return /검수량이?(?:많은|높은|낮은|적은)|검사량이?(?:많은|높은|낮은|적은)/.test(
    n,
  )
}

function inferMetricFromText(n: string): AiMetric | null {
  if (includesAny(n, ['폐기', '비용', '폐기금액', '폐기비용'])) return 'scrapCost'
  // 후속: "이전 부적합률 TOP5에서 검수량 순으로" — 부적합 언급이 있어도 검수량 정렬 우선
  if (hasExplicitQtySortIntent(n)) return 'qty'
  // "검수량 10000ea 이상만"은 필터이지 검수량 순 정렬이 아님
  if (
    includesAny(n, ['검수량', '검사량', '검사실적']) &&
    !includesAny(n, ['부적합', '불량']) &&
    !includesAny(n, ['이상'])
  ) {
    return 'qty'
  }
  // "불량 많이 나온" / "부적합 수량" → 부적합수량 (건수)
  if (
    includesAny(n, [
      '부적합수량',
      '부적합수',
      '불량수량',
      '불량수',
      '발생수량',
      '많이난',
      '많이나온',
      '많이발생',
    ]) ||
    (includesAny(n, [
      '많이나는',
      '불량이많은',
      '부적합이많은',
      '불량많은',
      '문제많은',
      '문제많',
    ]) &&
      !includesAny(n, ['부적합률', '부적합율', '불량률', '불량율']))
  ) {
    return 'fail'
  }
  // "불량 심한"은 애매 → clarify에서 확인 (지표 추론하지 않음)
  if (includesAny(n, ['심한', '불량심한']) && !includesAny(n, ['많', '률', '율'])) {
    return null
  }
  if (
    includesAny(n, [
      '부적합률',
      '부적합율',
      '불량률',
      '불량율',
      'worst',
    ])
  ) {
    return 'failRate'
  }
  if (
    includesAny(n, ['부적합', '불량']) &&
    !includesAny(n, ['불량유형', '불량종류'])
  ) {
    // "부적합 높은" = 률, "부적합 많은" = 수량
    if (includesAny(n, ['많은', '많이', '수량'])) return 'fail'
    return 'failRate'
  }
  return null
}

function metricLabelOf(metric: AiMetric) {
  return metric === 'qty'
    ? '검수량'
    : metric === 'scrapCost'
      ? '폐기비용'
      : metric === 'fail'
        ? '부적합수량'
        : '부적합률'
}

function productMetricValue(p: ProductRow, metric: AiMetric) {
  if (metric === 'qty') return p.qty
  if (metric === 'scrapCost') return p.scrapCost
  if (metric === 'fail') return p.fail
  return p.failRate
}

function sortByMetric(rows: ProductRow[], metric: AiMetric, ascending = false) {
  return [...rows].sort((a, b) =>
    ascending
      ? productMetricValue(a, metric) - productMetricValue(b, metric)
      : productMetricValue(b, metric) - productMetricValue(a, metric),
  )
}

/** 지정 품번을 기간 집계 후 ProductRow로 반환 (질문 순서 유지) */
function productRowsForNames(
  records: InspectionRecord[],
  productNames: string[],
  period: AiQueryPeriod | null,
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

  // 표가 없어도 막대 차트에서 품번 복원 (설비/금형/검사자 막대는 제외)
  if (!all.size) {
    for (const b of blocks) {
      if (b.type !== 'bar') continue
      if (
        includesAny(compact(b.title), [
          '설비',
          '금형',
          '검사자',
          '검사원',
          '성형',
          '작업자',
          'lot',
          '공장별',
        ])
      ) {
        continue
      }
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
    lastLimit:
      parseTopOnlyLimit(question, qn) ??
      (/(?:top|worst|상위)\s*\d+/i.test(question) ? topN(question) : undefined),
    lastQtyMin: parseQtyMinEa(question, qn),
    lastPpmMin: parsePpmMin(question, qn),
    lastScrapMin: parseScrapCostMin(question, qn),
    lastEntity: 'product',
    lastAscending:
      includesAny(qn, ['낮은', '적은']) &&
      !includesAny(qn, ['높은', '많은']),
    lastGroups: detectGroups(qn).groups.map((g) => ({
      id: g.id,
      label: g.label,
    })),
  }
}

function yearSpanPeriod(records: InspectionRecord[]): AiQueryPeriod {
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
  const names = new Set<string>([
    ...KNOWN_DEFECT_TYPES.map(String),
    '찍힘',
    '찍힘불량',
    '오염',
    '파손',
  ])
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
  period: AiQueryPeriod | null,
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
  period: AiQueryPeriod | null,
  periodNote: string,
  limit: number,
  defaultPeriod: AiQueryPeriod | null,
  now: Date,
): AiBlock[] | null {
  if (!prior.productNames.length) return null

  // 후속 질문에 기간이 없으면 직전 질문 기간을 이어받음
  const effectivePeriod =
    period ??
    prior.lastPeriod ??
    parsePeriodFromQuestion(prior.lastQuestion, records, now) ??
    defaultPeriod
  const effectiveNote = effectivePeriod
    ? `기간: ${effectivePeriod.label}`
    : periodNote
  const periodChanged = Boolean(period)

  const metricFromFollow = inferMetricFromText(n)
  const metric: AiMetric =
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

  // ── 그 불량(유형)이 어느 공장에서 많이 발생 / 어느 공장에서 많이 나왔어 ──
  if (
    ((namedDefect || includesAny(n, ['그불량', '해당불량', '주요불량'])) &&
      includesAny(n, ['공장', '어디', '어느', '발생'])) ||
    (includesAny(n, ['공장', '어디', '어느']) &&
      includesAny(n, ['많이', '나왔', '발생']) &&
      !includesAny(n, ['설비', '금형', '검사자']))
  ) {
    const rank = parseRankPick(text, n) ?? 1
    const productName =
      prior.productNames[rank - 1] ?? prior.productNames[0]!
    const defectName =
      namedDefect ||
      productRowsForNames(records, [productName], effectivePeriod)[0]
        ?.mainDefect ||
      ''
    if (!defectName || defectName === '-') {
      return [
        textBlock(
          `${productName}: 비교할 주요 불량유형 데이터가 없습니다. (${effectiveNote})`,
        ),
      ]
    }
    const byPlant = new Map<
      string,
      { label: string; qty: number; fail: number; defect: number }
    >()
    for (const r of records) {
      if (!isAnalyzable(r)) continue
      if (
        effectivePeriod &&
        (r.date < effectivePeriod.startDate ||
          r.date > effectivePeriod.endDate)
      )
        continue
      if (compact(r.product) !== compact(productName)) continue
      const matchedKey = defectKeyMatch(r.defects ?? {}, defectName)
      if (!matchedKey) continue
      const label = r.team.includes('2공장')
        ? '2공장'
        : r.team.includes('본사')
          ? `본사(${r.productType || '-'})`
          : r.team || '기타'
      const prev = byPlant.get(label) ?? {
        label,
        qty: 0,
        fail: 0,
        defect: 0,
      }
      prev.qty += r.qty
      prev.fail += r.fail
      prev.defect += Number(r.defects?.[matchedKey] ?? 0)
      byPlant.set(label, prev)
    }
    const rows = [...byPlant.values()].sort((a, b) => b.defect - a.defect)
    if (!rows.length) {
      return [
        textBlock(
          `${productName} · ${defectName}: 공장별 발생 데이터가 없습니다.`,
        ),
      ]
    }
    return [
      textBlock(
        `${productName} · 불량유형 "${defectName}"의 공장별 발생입니다. (${effectiveNote})`,
        '발생 건수 기준이며, 해당 공장이 직접 원인이라고 단정하지 않습니다.',
      ),
      {
        type: 'table',
        title: `${productName} · ${defectName} 공장별`,
        headers: ['순위', '공장/라인', '해당불량', '부적합합계', '검수량'],
        rows: rows.map((r, i) => [
          String(i + 1),
          r.label,
          r.defect.toLocaleString(),
          r.fail.toLocaleString(),
          `${r.qty.toLocaleString()} EA`,
        ]),
      },
      {
        type: 'bar',
        title: `${defectName} 공장별 건수`,
        format: 'count',
        valueLabel: '건수',
        data: rows.map((r) => ({ name: r.label, value: r.defect })),
      },
    ]
  }

  // ── 이 품번(N위) · 검사자별 / 성형작업자별 ──
  {
    const wantsPersonBreakdown =
      includesAny(n, ['검사자', '검사원', '성형작업자', '성형작업', '작업자']) &&
      (includesAny(n, [
        '이품번',
        '그품번',
        '해당품번',
        '별',
        '실적',
        '검수',
        '그공장',
        '얘',
        '누구',
        '그lot',
        '해당lot',
      ]) ||
        parseRankPick(text, n) != null ||
        /보여|알려/.test(text))
    if (wantsPersonBreakdown) {
      const rank = parseRankPick(text, n) ?? 1
      const productName =
        prior.productNames[rank - 1] ?? prior.productNames[0]!
      const byInspector = includesAny(n, ['검사자', '검사원'])
      const map = new Map<
        string,
        { name: string; qty: number; fail: number; scrapCost: number }
      >()
      for (const r of records) {
        if (!isAnalyzable(r)) continue
        if (
          effectivePeriod &&
          (r.date < effectivePeriod.startDate ||
            r.date > effectivePeriod.endDate)
        )
          continue
        if (compact(r.product) !== compact(productName)) continue
        const key = byInspector
          ? r.inspector || '미지정'
          : r.worker || '미지정'
        const prev = map.get(key) ?? {
          name: key,
          qty: 0,
          fail: 0,
          scrapCost: 0,
        }
        prev.qty += r.qty
        prev.fail += r.fail
        prev.scrapCost += r.scrapCost
        map.set(key, prev)
      }
      const rows = [...map.values()]
        .map((x) => ({
          ...x,
          failRate:
            x.qty > 0 ? Math.round((x.fail / x.qty) * 1_000_000) : 0,
        }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, Math.max(limit, 10))
      if (!rows.length) {
        return [
          textBlock(
            `${productName}: ${byInspector ? '검사자' : '성형작업자'} 데이터가 없습니다. (${effectiveNote})`,
          ),
        ]
      }
      const role = byInspector ? '검사자' : '성형작업자'
      return [
        criteriaBlock({
          periodNote: effectiveNote,
          scopeText: productName,
          metricLabel: `${role}별 검수량`,
          limit: rows.length,
        }),
        textBlock(
          `${productName} · ${role}별 실적입니다. (직전 리스트 ${rank}위)`,
        ),
        {
          type: 'table',
          title: `${productName} · ${role}별`,
          headers: [
            '순위',
            role,
            '검수량',
            '부적합',
            '부적합률',
            '폐기비용',
          ],
          rows: rows.map((r, i) => [
            String(i + 1),
            r.name,
            `${r.qty.toLocaleString()} EA`,
            r.fail.toLocaleString(),
            formatPpm(r.failRate),
            formatWon(r.scrapCost),
          ]),
        },
      ]
    }
  }

  // ── 설비별 / 금형별 / LOT별 (직전 품번 유지) ──
  if (
    includesAny(n, ['설비', '금형', 'lot', '로트', '롯트']) &&
    (includesAny(n, ['별', '보여', '알려', '발생', '불량']) ||
      includesAny(n, ['제일많은', '가장많은', '문제인']))
  ) {
    const rank = parseRankPick(text, n) ?? 1
    const productName =
      prior.productNames[rank - 1] ?? prior.productNames[0]!
    const wantEquip = includesAny(n, ['설비'])
    const wantMold = includesAny(n, ['금형'])
    const wantLot = includesAny(n, ['lot', '로트', '롯트'])
    const map = new Map<
      string,
      { name: string; qty: number; fail: number; scrapCost: number }
    >()
    for (const r of records) {
      if (!isAnalyzable(r)) continue
      if (
        effectivePeriod &&
        (r.date < effectivePeriod.startDate ||
          r.date > effectivePeriod.endDate)
      )
        continue
      if (compact(r.product) !== compact(productName)) continue
      const key = wantLot
        ? r.lot || '미지정'
        : wantMold
          ? r.moldNo || '미지정'
          : r.equipment || '미지정'
      const prev = map.get(key) ?? {
        name: key,
        qty: 0,
        fail: 0,
        scrapCost: 0,
      }
      prev.qty += r.qty
      prev.fail += r.fail
      prev.scrapCost += r.scrapCost
      map.set(key, prev)
    }
    const rows = [...map.values()]
      .map((x) => ({
        ...x,
        failRate: x.qty > 0 ? Math.round((x.fail / x.qty) * 1_000_000) : 0,
      }))
      .sort((a, b) => b.fail - a.fail || b.qty - a.qty)
      .slice(0, Math.max(limit, 10))
    const dim = wantLot ? 'LOT' : wantMold ? '금형' : '설비'
    if (!rows.length) {
      return [
        textBlock(
          `${productName}: ${dim}별 데이터가 없습니다. (${effectiveNote})`,
        ),
      ]
    }
    if (includesAny(n, ['제일많은', '가장많은', '문제인', '제일문제'])) {
      const top = rows[0]!
      return [
        textBlock(
          `${productName} · ${dim} 기준 1위는 ${top.name}입니다. (${effectiveNote})`,
          `부적합 ${top.fail.toLocaleString()} · 검수량 ${top.qty.toLocaleString()}EA · 부적합률 ${formatPpm(top.failRate)}`,
        ),
      ]
    }
    return [
      criteriaBlock({
        periodNote: effectiveNote,
        scopeText: productName,
        metricLabel: `${dim}별 부적합`,
        limit: rows.length,
      }),
      textBlock(
        `${productName} · ${dim}별 발생 현황입니다. (직전 리스트 품번 유지)`,
      ),
      {
        type: 'table',
        title: `${productName} · ${dim}별`,
        headers: ['순위', dim, '검수량', '부적합', '부적합률', '폐기비용'],
        rows: rows.map((r, i) => [
          String(i + 1),
          r.name,
          `${r.qty.toLocaleString()} EA`,
          r.fail.toLocaleString(),
          formatPpm(r.failRate),
          formatWon(r.scrapCost),
        ]),
      },
      {
        type: 'bar',
        title: `${dim}별 부적합`,
        format: 'count',
        valueLabel: '부적합',
        data: rows.slice(0, 8).map((r) => ({ name: r.name, value: r.fail })),
      },
    ]
  }

  // ── "1위 품번이 뭐야?" 단순 확인 ──
  if (
    parseRankPick(text, n) != null &&
    includesAny(n, ['뭐', '무엇', '알려', '이름']) &&
    !includesAny(n, ['불량유형', '원인', '설비', '금형', '공장'])
  ) {
    const rank = parseRankPick(text, n) ?? 1
    const name = prior.productNames[rank - 1]
    if (name) {
      const rows = productRowsForNames(records, [name], effectivePeriod)
      const p = rows[0]
      return [
        textBlock(
          `직전 결과 ${rank}위 품번은 ${name}입니다. (${effectiveNote})`,
          p
            ? `부적합률 ${formatPpm(p.failRate)} · 검수량 ${p.qty.toLocaleString()}EA · 부적합 ${p.fail.toLocaleString()}`
            : '',
        ),
      ]
    }
  }

  // ── 지난주에는 몇 위? ──
  if (
    includesAny(n, ['몇위', '몇등']) &&
    includesAny(n, ['지난주', '전주', '저번주'])
  ) {
    const name = prior.productNames[0]
    if (name) {
      const compare =
        parseComparePeriods('지난주 대비 이번 주', now) ??
        parseComparePeriods(prior.lastQuestion, now)
      if (compare) {
        const prevA = analyzeRecords(
          records,
          baseFilters('all', compare.previous),
        )
        const ranked = sortByMetric(
          prevA.products,
          prior.lastMetric ?? 'failRate',
        )
        const idx = ranked.findIndex((p) => compact(p.name) === compact(name))
        return [
          textBlock(
            `${name}: ${compare.previous.label} 기준 ${
              idx >= 0 ? `${idx + 1}위` : 'TOP 권외(해당 기간 데이터 없음 또는 순위 밖)'
            }입니다.`,
            `비교: ${compare.previous.label} ↔ ${compare.current.label}`,
          ),
        ]
      }
    }
  }

  // ── 3) 드릴다운: 1위 / N위 / 특정 품번 원인·자세히 ──
  const rankPick = parseRankPick(text, n)
  const namedInPrior = findProductNames(n, prior.productNames)
  // "얘" = 직전 1위
  const refersCurrent =
    includesAny(n, ['얘', '이거', '그거']) &&
    includesAny(n, ['불량유형', '원인', '공장', '설비', '금형'])
  const wantsDetailWords = includesAny(n, [
    '원인',
    '자세히',
    '상세',
    '왜',
    '분석',
    '불량유형',
    '불량종류',
    '주요불량',
  ])
  // 불량유형 비중 리스트와 겹치지 않게
  if (
    !wantsNamedDefectList &&
    (rankPick != null ||
      refersCurrent ||
      (wantsDetailWords && namedInPrior.length <= 1) ||
      (namedInPrior.length === 1 &&
        (wantsDetailWords || includesAny(n, ['검수량', '폐기', '부적합률']))))
  ) {
    const baseNames =
      scopes.length === 1
        ? scopes[0]!.productNames
        : prior.productNames
    const rows = productRowsForNames(records, baseNames, effectivePeriod)
    const ranked = sortByMetric(rows, metric, ascending)
    let target: ProductRow | null = null
    let rankLabel: string | undefined
    if (namedInPrior.length === 1) {
      const key = compact(namedInPrior[0]!)
      target = ranked.find((r) => compact(r.name) === key) ?? null
    } else if (rankPick != null) {
      target = ranked[rankPick - 1] ?? null
      rankLabel = `${rankPick}위`
    } else if (wantsDetailWords || refersCurrent) {
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
      let ranked = sortByMetric(rows, metric, ascending)
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

const DEFECT_STACK_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#14b8a6',
  '#f97316',
  '#64748b',
]

/** 최근 N주를 7일 단위 버킷으로 (Week 1=가장 오래된 주) */
function buildWeekBuckets(
  endDate: Date,
  weeks: number,
): { startDate: string; endDate: string; label: string }[] {
  const raw: { startDate: string; endDate: string }[] = []
  let end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate())
  for (let i = 0; i < weeks; i++) {
    const start = new Date(end)
    start.setDate(start.getDate() - 6)
    raw.push({
      startDate: ymd(start.getFullYear(), start.getMonth() + 1, start.getDate()),
      endDate: ymd(end.getFullYear(), end.getMonth() + 1, end.getDate()),
    })
    end = new Date(start)
    end.setDate(end.getDate() - 1)
  }
  return raw.reverse().map((b, idx) => ({ ...b, label: `Week ${idx + 1}` }))
}

function aggregateMetricInRange(
  records: InspectionRecord[],
  startDate: string,
  endDate: string,
  metric: AiMetric,
  groupFilter?: (r: InspectionRecord) => boolean,
): number {
  let qty = 0
  let fail = 0
  let scrap = 0
  for (const r of records) {
    if (!isAnalyzable(r)) continue
    if (r.date < startDate || r.date > endDate) continue
    if (groupFilter && !groupFilter(r)) continue
    qty += r.qty
    fail += r.fail
    scrap += r.scrapCost
  }
  if (metric === 'qty') return qty
  if (metric === 'fail') return fail
  if (metric === 'scrapCost') return scrap
  return qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
}

function groupFilterFromId(
  id: string,
): ((r: InspectionRecord) => boolean) | undefined {
  if (id === 'plant2') return (r) => r.team.includes('2공장')
  if (id === 'seal')
    return (r) =>
      r.team.includes('본사') && /seal|실링|씰/i.test(r.productType)
  if (id === 'hydraulic')
    return (r) =>
      r.team.includes('본사') &&
      /grommet|그로멧|유압/i.test(r.productType)
  return undefined
}

/** 주차별 추이 데이터 (단일 시리즈 또는 그룹별) */
function buildWeeklyTrendData(
  records: InspectionRecord[],
  weeks: number,
  endDate: Date,
  metric: AiMetric,
  groupIds: string[] = [],
): { data: Record<string, string | number>[]; series: AiChartSeries[] } {
  const buckets = buildWeekBuckets(endDate, weeks)
  const ids = groupIds.length ? groupIds : ['total']
  const data = buckets.map((b) => {
    const row: Record<string, string | number> = { date: b.label }
    for (const id of ids) {
      const filter = id === 'total' ? undefined : groupFilterFromId(id)
      const v = aggregateMetricInRange(
        records,
        b.startDate,
        b.endDate,
        metric,
        filter,
      )
      row[id] = metric === 'scrapCost' ? toMillion(v) : v
    }
    return row
  })
  const series: AiChartSeries[] =
    groupIds.length === 0
      ? [
          {
            key: 'total',
            label: metricLabelOf(
              metric === 'fail' || metric === 'qty' || metric === 'scrapCost'
                ? metric
                : 'failRate',
            ),
            color: BAR_COLOR,
          },
        ]
      : groupIds.map((id) => ({
          key: id,
          label:
            GROUP_ALIASES.find((g) => g.id === id)?.label ??
            (id === 'total' ? 'TOTAL' : id),
          color: GROUP_COLORS[id] ?? BAR_COLOR,
        }))
  return { data, series }
}

function parseRecentWeeksCount(text: string): number | null {
  const m = text.match(/최근\s*(\d+)\s*주/)
  if (!m) return null
  const w = Number(m[1])
  return Number.isFinite(w) && w > 0 ? w : null
}

function dateFromYmd(s: string, fallback = new Date()): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return fallback
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 월 × 불량유형 누적 */
function buildMonthDefectStacked(
  records: InspectionRecord[],
  period: AiQueryPeriod | null,
  topDefects = 6,
  asPercent = false,
): { data: Record<string, string | number>[]; series: AiChartSeries[] } {
  const defectTotals = new Map<string, number>()
  const byMonth = new Map<string, Map<string, number>>()
  for (const r of records) {
    if (!isAnalyzable(r)) continue
    if (period && (r.date < period.startDate || r.date > period.endDate)) continue
    const ym = r.date.slice(0, 7)
    if (!byMonth.has(ym)) byMonth.set(ym, new Map())
    const map = byMonth.get(ym)!
    for (const [name, count] of Object.entries(r.defects ?? {})) {
      const c = Number(count) || 0
      if (c <= 0) continue
      map.set(name, (map.get(name) ?? 0) + c)
      defectTotals.set(name, (defectTotals.get(name) ?? 0) + c)
    }
  }
  const top = [...defectTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topDefects)
    .map(([name]) => name)
  const months = [...byMonth.keys()].sort()
  const data = months.map((ym) => {
    const map = byMonth.get(ym)!
    const row: Record<string, string | number> = {
      date: `${Number(ym.slice(5, 7))}월`,
    }
    let other = 0
    let monthTotal = 0
    for (const [name, count] of map.entries()) {
      monthTotal += count
      if (top.includes(name)) row[name] = count
      else other += count
    }
    if (other > 0) row['기타'] = other
    for (const name of top) {
      if (row[name] == null) row[name] = 0
    }
    if (asPercent && monthTotal > 0) {
      for (const key of Object.keys(row)) {
        if (key === 'date') continue
        row[key] = Math.round((Number(row[key]) / monthTotal) * 1000) / 10
      }
    }
    return row
  })
  const hasOther = data.some((row) => Number(row['기타'] ?? 0) > 0)
  const seriesNames = hasOther ? [...top, '기타'] : top
  const series: AiChartSeries[] = seriesNames.map((name, i) => ({
    key: name,
    label: name,
    color: DEFECT_STACK_COLORS[i % DEFECT_STACK_COLORS.length]!,
  }))
  return { data, series }
}

/** 공장×불량유형 누적 집계 */
function buildGroupDefectStacked(
  records: InspectionRecord[],
  period: AiQueryPeriod | null,
  topDefects = 6,
): {
  data: Record<string, string | number>[]
  series: AiChartSeries[]
} {
  const groupDefs = GROUP_ALIASES
  const defectTotals = new Map<string, number>()
  const cell = new Map<string, Map<string, number>>()

  for (const g of groupDefs) {
    cell.set(g.id, new Map())
  }

  for (const r of records) {
    if (!isAnalyzable(r)) continue
    if (period && (r.date < period.startDate || r.date > period.endDate)) continue
    const g = groupDefs.find((x) => {
      if (x.id === 'plant2') return r.team.includes('2공장')
      if (x.id === 'seal')
        return (
          r.team.includes('본사') && /seal|실링|씰/i.test(r.productType)
        )
      if (x.id === 'hydraulic')
        return (
          r.team.includes('본사') &&
          /grommet|그로멧|유압/i.test(r.productType)
        )
      return false
    })
    if (!g) continue
    const map = cell.get(g.id)!
    for (const [name, count] of Object.entries(r.defects ?? {})) {
      const c = Number(count) || 0
      if (c <= 0) continue
      map.set(name, (map.get(name) ?? 0) + c)
      defectTotals.set(name, (defectTotals.get(name) ?? 0) + c)
    }
  }

  const tops = [...defectTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topDefects)
    .map(([name]) => name)

  const series: AiChartSeries[] = tops.map((name, i) => ({
    key: name,
    label: name,
    color: DEFECT_STACK_COLORS[i % DEFECT_STACK_COLORS.length]!,
  }))

  const data = groupDefs.map((g) => {
    const map = cell.get(g.id) ?? new Map()
    const row: Record<string, string | number> = { name: g.label }
    for (const d of tops) row[d] = map.get(d) ?? 0
    return row
  })

  return { data, series }
}

/** 공장별 정상/부적합 수량 */
function buildGroupPassFail(
  records: InspectionRecord[],
  period: AiQueryPeriod | null,
  asPercent = false,
): {
  data: Record<string, string | number>[]
  series: AiChartSeries[]
} {
  const series: AiChartSeries[] = [
    { key: 'pass', label: '정상', color: '#22c55e' },
    { key: 'fail', label: '부적합', color: '#ef4444' },
  ]
  const data = GROUP_ALIASES.map((g) => {
    const ga = analyzeGroup(records, g.id, period)
    const pass = ga.products.reduce((s, p) => s + p.pass, 0)
    const fail = ga.products.reduce((s, p) => s + p.fail, 0)
    if (asPercent) {
      // stackOffset=expand 사용 시 원수량 유지
      return { name: g.label, pass, fail }
    }
    return { name: g.label, pass, fail }
  })
  return { data, series }
}

/**
 * 차트 중심 질의 (막대/선/원/누적/산점도/이중지표).
 * 명시적 차트·추이·비중·관계 표현이 있을 때 우선 처리.
 */
function tryAnswerChartQuestion(
  text: string,
  n: string,
  records: InspectionRecord[],
  scopedAnalytics: Analytics,
  groups: typeof GROUP_ALIASES,
  period: AiQueryPeriod | null,
  periodNote: string,
  limit: number,
  ascending: boolean,
  filters: QueryFilters = emptyFilters(),
): AiBlock[] | null {
  const chartKind =
    detectChartKind(n, text) ??
    (includesAny(n, ['그래프', '차트', '추이', '비중', '관계', '산점', '누적'])
      ? inferDefaultChartKind(n, text)
      : null)

  // 전주/전월 비교+차트는 answerOne 비교 분기로 넘김
  if (
    includesAny(n, ['지난달', '전월', '지난주', '전주']) &&
    includesAny(n, ['대비', '비교']) &&
    includesAny(n, ['폐기', '부적합', '검수'])
  ) {
    return null
  }
  // 가중 vs 단순 평균 설명은 차트 분기 말고 answerOne에서 처리
  if (
    includesAny(n, ['평균']) &&
    includesAny(n, ['부적합률', '불량률']) &&
    includesAny(n, ['비교', '다르', '왜'])
  ) {
    return null
  }

  const chartAsked =
    chartKind != null ||
    includesAny(n, ['그래프', '차트', '추이', '비중', '산점', '누적', '막대', '원그래프', '선그래프'])

  if (!chartAsked && !includesAny(n, ['같이보여', '비교해'])) return null

  const withTable = wantsTableWithChart(n)
  const withTotal = wantsTotalInChart(n)
  const layout: 'vertical' | 'horizontal' =
    chartKind === 'hbar' ? 'horizontal' : 'vertical'
  const metric = inferMetricFromText(n) ?? 'failRate'
  const metricLabel = metricLabelOf(metric)

  // ── 산점도 ──
  if (chartKind === 'scatter' || (includesAny(n, ['관계']) && includesAny(n, ['산점', '그래프', '보여']))) {
    const entityWorker = includesAny(n, ['성형', '작업자'])
    const entityInspector = includesAny(n, ['검사자', '검사원'])
    if (entityWorker) {
      const rows = [...scopedAnalytics.workers]
        .filter((w) => w.qty > 0)
        .slice(0, Math.max(limit, 30))
      return [
        textBlock(
          `성형작업자별 생산량(X)·부적합률(Y) 산점도입니다. (${periodNote})`,
        ),
        {
          type: 'scatter',
          title: '성형작업자 · 생산량 vs 부적합률',
          xLabel: '생산량(검수량)',
          yLabel: '부적합률',
          xFormat: 'qty',
          yFormat: 'ppm',
          data: rows.map((w) => ({ name: w.name, x: w.qty, y: w.failRate })),
        },
      ]
    }
    if (entityInspector) {
      const rows = [...scopedAnalytics.inspectors]
        .filter((i) => i.qty > 0)
        .slice(0, Math.max(limit, 30))
      return [
        textBlock(
          `검사자별 검수량(X)·부적합률(Y) 산점도입니다. (${periodNote})`,
        ),
        {
          type: 'scatter',
          title: '검사자 · 검수량 vs 부적합률',
          xLabel: '검수량',
          yLabel: '부적합률',
          xFormat: 'qty',
          yFormat: 'ppm',
          data: rows.map((i) => ({ name: i.name, x: i.qty, y: i.failRate })),
        },
      ]
    }
    const products = sortByMetric(
      scopedAnalytics.products.filter((p) => p.qty > 0),
      'qty',
    ).slice(0, Math.max(limit, 40))
    const yFailQty = includesAny(n, ['부적합수량', '불량수량'])
    const yScrap = includesAny(n, ['폐기'])
    return [
      textBlock(
        `품번별 검수량(X)·${
          yScrap ? '폐기비용' : yFailQty ? '부적합수량' : '부적합률'
        }(Y) 산점도입니다. (${periodNote})`,
      ),
      {
        type: 'scatter',
        title: '품번 · 검수량 vs 품질지표',
        xLabel: '검수량',
        yLabel: yScrap ? '폐기비용' : yFailQty ? '부적합수량' : '부적합률',
        xFormat: 'qty',
        yFormat: yScrap ? 'won' : yFailQty ? 'count' : 'ppm',
        data: products.map((p) => ({
          name: p.name,
          x: p.qty,
          y: yScrap ? p.scrapCost : yFailQty ? p.fail : p.failRate,
        })),
      },
    ]
  }

  // ── 100% 누적: 정상/부적합 비율 / 월×불량유형 ──
  if (
    chartKind === 'percentStacked' ||
    (includesAny(n, ['100%', '100퍼센트', '비율누적', '구성비']) &&
      includesAny(n, ['정상', '부적합', '불량유형']))
  ) {
    if (
      includesAny(n, ['월별', '월간']) &&
      includesAny(n, ['불량유형', '찍힘', '기포', '스크래치'])
    ) {
      const { data, series } = buildMonthDefectStacked(records, period, 6, true)
      if (!series.length) {
        return [textBlock(`불량유형 데이터가 없습니다. (${periodNote})`)]
      }
      return [
        textBlock(`월별 불량유형 구성비(100% 누적)입니다. (${periodNote})`),
        {
          type: 'multiBar',
          title: '월별 불량유형 구성비',
          data,
          xKey: 'date',
          series,
          format: 'percent',
          stacked: true,
          percentStacked: true,
        },
      ]
    }
    if (includesAny(n, ['정상', '부적합']) && !includesAny(n, ['불량유형'])) {
      const { data, series } = buildGroupPassFail(records, period, true)
      return [
        textBlock(
          `공장별 정상/부적합 비율(100% 누적)입니다. (${periodNote})`,
        ),
        {
          type: 'multiBar',
          title: '공장별 정상/부적합 비율',
          data,
          xKey: 'name',
          series,
          format: 'percent',
          stacked: true,
          percentStacked: true,
        },
        ...(withTable
          ? [
              {
                type: 'table' as const,
                title: '공장별 정상/부적합',
                headers: ['그룹', '정상', '부적합', '정상비율'],
                rows: data.map((r) => {
                  const pass = Number(r.pass) || 0
                  const fail = Number(r.fail) || 0
                  const t = pass + fail
                  return [
                    String(r.name),
                    pass.toLocaleString(),
                    fail.toLocaleString(),
                    t > 0 ? formatPercent(Math.round((pass / t) * 1000) / 10) : '-',
                  ]
                }),
              },
            ]
          : []),
      ]
    }
    const { data, series } = buildGroupDefectStacked(records, period)
    if (!series.length) {
      return [textBlock(`불량유형 데이터가 없습니다. (${periodNote})`)]
    }
    return [
      textBlock(
        `공장별 불량유형 비율(100% 누적)입니다. (${periodNote})`,
      ),
      {
        type: 'multiBar',
        title: '공장별 불량유형 비율',
        data,
        xKey: 'name',
        series,
        format: 'percent',
        stacked: true,
        percentStacked: true,
      },
    ]
  }

  // ── 누적 막대: 월×불량유형 / 공장×불량유형 / 정상·부적합 ──
  if (
    chartKind === 'stacked' ||
    (includesAny(n, ['누적']) &&
      includesAny(n, ['불량유형', '정상', '구성'])) ||
    (includesAny(n, ['월별', '월간']) &&
      includesAny(n, ['불량유형', '찍힘', '기포', '스크래치']) &&
      includesAny(n, ['보여', '그래프', '차트', '추이', '발생']))
  ) {
    if (
      includesAny(n, ['월별', '월간', '최근']) &&
      includesAny(n, ['불량유형', '찍힘', '기포', '스크래치'])
    ) {
      const { data, series } = buildMonthDefectStacked(records, period, 6, false)
      if (!series.length) {
        return [textBlock(`불량유형 데이터가 없습니다. (${periodNote})`)]
      }
      return [
        textBlock(`월별 불량유형 발생량(누적 막대)입니다. (${periodNote})`),
        {
          type: 'multiBar',
          title: '월별 불량유형 누적',
          data,
          xKey: 'date',
          series,
          format: 'count',
          stacked: true,
        },
      ]
    }
    if (includesAny(n, ['정상']) && includesAny(n, ['부적합', '불량'])) {
      const { data, series } = buildGroupPassFail(records, period, false)
      return [
        textBlock(`공장별 정상·부적합 수량 누적 막대입니다. (${periodNote})`),
        {
          type: 'multiBar',
          title: '공장별 정상/부적합 누적',
          data,
          xKey: 'name',
          series,
          format: 'count',
          stacked: true,
        },
      ]
    }
    const { data, series } = buildGroupDefectStacked(records, period)
    if (!series.length) {
      return [textBlock(`불량유형 데이터가 없습니다. (${periodNote})`)]
    }
    return [
      textBlock(`공장별 불량유형 구성 누적 막대입니다. (${periodNote})`),
      {
        type: 'multiBar',
        title: '공장별 불량유형 누적',
        data,
        xKey: 'name',
        series,
        format: 'count',
        stacked: true,
      },
      ...(withTable
        ? [
            {
              type: 'table' as const,
              title: '공장별 불량유형 수량',
              headers: ['그룹', ...series.map((s) => s.label)],
              rows: data.map((r) => [
                String(r.name),
                ...series.map((s) => Number(r[s.key] ?? 0).toLocaleString()),
              ]),
            },
          ]
        : []),
    ]
  }

  // ── 원그래프: 불량유형 / 공장 비중 ──
  if (
    chartKind === 'pie' ||
    (includesAny(n, ['비중', '비율', '구성비']) &&
      includesAny(n, ['불량유형', '공장', '폐기', '검수']))
  ) {
    if (includesAny(n, ['공장']) && includesAny(n, ['폐기', '검수', '부적합'])) {
      const summaries = scopedAnalytics.groupSummaries.filter(
        (g) => g.id !== 'all',
      )
      const key: 'scrapCost' | 'qty' | 'fail' = includesAny(n, ['폐기'])
        ? 'scrapCost'
        : includesAny(n, ['검수'])
          ? 'qty'
          : 'fail'
      const total = summaries.reduce(
        (s, g) =>
          s +
          (key === 'scrapCost' ? g.scrapCost : key === 'qty' ? g.qty : g.fail),
        0,
      )
      const pieData = summaries.map((g) => {
        const value =
          key === 'scrapCost' ? g.scrapCost : key === 'qty' ? g.qty : g.fail
        return {
          name: g.label,
          value,
          share: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
        }
      })
      // 항목이 과도하면 막대로
      if (pieData.length > 8) {
        return [
          textBlock(
            `항목이 많아 원그래프 대신 막대로 표시합니다. (${periodNote})`,
          ),
          {
            type: 'bar',
            title: `공장별 ${key === 'scrapCost' ? '폐기비용' : key === 'qty' ? '검수량' : '부적합'}`,
            format: key === 'scrapCost' ? 'won' : key === 'qty' ? 'qty' : 'count',
            data: pieData.map((d) => ({ name: d.name, value: d.value })),
          },
        ]
      }
      return [
        textBlock(
          `공장별 ${
            key === 'scrapCost' ? '폐기비용' : key === 'qty' ? '검수량' : '부적합'
          } 비중 원그래프입니다. (${periodNote})`,
        ),
        { type: 'pie', title: '공장별 비중(%)', data: pieData },
      ]
    }
    const defects = scopedAnalytics.defectTypes.slice(0, Math.max(limit, 8))
    if (!defects.length) {
      return [textBlock(`불량유형 데이터가 없습니다. (${periodNote})`)]
    }
    const useBarFallback = defects.length > 10 && chartKind !== 'pie'
    if (useBarFallback) {
      return [
        textBlock(
          `불량유형이 많아 막대그래프로 표시합니다. (${periodNote})`,
        ),
        {
          type: 'bar',
          title: '불량유형 비중',
          format: 'percent',
          valueLabel: '비중',
          data: defects.map((d) => ({ name: d.name, value: d.share })),
        },
      ]
    }
    return [
      textBlock(`불량유형별 비중 원그래프입니다. (${periodNote})`),
      {
        type: 'pie',
        title: '불량유형 구성(%)',
        data: defects.map((d) => ({
          name: d.name,
          value: d.count,
          share: d.share,
        })),
      },
      ...(withTable || includesAny(n, ['수량', '알려'])
        ? [
            {
              type: 'table' as const,
              title: '불량유형 수량',
              headers: ['순위', '유형', '건수', '비중'],
              rows: defects.map((d, i) => [
                String(i + 1),
                d.name,
                d.count.toLocaleString(),
                formatPercent(d.share),
              ]),
            },
          ]
        : []),
    ]
  }

  // ── 선그래프 / 월별·주별 추이 ──
  if (
    chartKind === 'line' ||
    (includesAny(n, ['추이', '변화', '월별', '주별', '주차', '일자별', '일별']) &&
      includesAny(n, ['그래프', '차트', '선', '보여', '비교'])) ||
    (parseRecentWeeksCount(text) != null &&
      includesAny(n, ['추이', '보여', '그래프', '차트']))
  ) {
    const trendMetric: 'failRate' | 'qty' | 'scrapCost' =
      metric === 'scrapCost'
        ? 'scrapCost'
        : metric === 'qty'
          ? 'qty'
          : 'failRate'
    const format: AiValueFormat =
      trendMetric === 'failRate'
        ? 'ppm'
        : trendMetric === 'qty'
          ? 'qty'
          : 'million'
    const weeksN = parseRecentWeeksCount(text)

    // 최근 N주 → 실제 주차별 버킷 (월별 집계 금지)
    if (weeksN != null) {
      const multiGroup =
        groups.length >= 2 ||
        includesAny(n, ['공장별', '본사와', 'seal과', '1공장과', '비교'])
      const groupIds = multiGroup
        ? (groups.length ? groups : GROUP_ALIASES).map((g) => g.id)
        : groups.length === 1
          ? [groups[0]!.id]
          : []
      const { data, series } = buildWeeklyTrendData(
        records,
        weeksN,
        dateFromYmd(period?.endDate ?? '', new Date()),
        trendMetric,
        groupIds,
      )
      const chartType: 'line' | 'multiBar' = includesAny(n, ['막대'])
        ? 'multiBar'
        : 'line'
      return [
        textBlock(
          `최근 ${weeksN}주 ${metricLabelOf(trendMetric)} 추이(주차 Week 1→${weeksN})입니다. (${periodNote})`,
        ),
        chartType === 'line'
          ? {
              type: 'line' as const,
              title: `주차별 ${metricLabelOf(trendMetric)} 추이`,
              data,
              xKey: 'date',
              series,
              format,
            }
          : {
              type: 'multiBar' as const,
              title: `주차별 ${metricLabelOf(trendMetric)}`,
              data,
              xKey: 'date',
              series,
              format,
            },
        ...(withTable
          ? [
              {
                type: 'table' as const,
                title: '주차별 수치',
                headers: [
                  '주차',
                  ...series.map((s) => s.label),
                ],
                rows: data.map((r) => [
                  String(r.date),
                  ...series.map((s) => {
                    const v = Number(r[s.key] ?? 0)
                    return trendMetric === 'failRate'
                      ? formatPpm(v)
                      : trendMetric === 'scrapCost'
                        ? `${v}백만`
                        : v.toLocaleString()
                  }),
                ]),
              },
            ]
          : []),
      ]
    }

    const yearAnalytics =
      !period || inclusiveMonthCount(period.startDate, period.endDate) >= 3
        ? analyzeRecords(
            records,
            baseFilters(
              'all',
              period ?? {
                startDate: ymd(inferDataYear(records), 1, 1),
                endDate: ymd(inferDataYear(records), 12, 31),
                label: '연간',
              },
            ),
          )
        : scopedAnalytics

    const multiGroup =
      groups.length >= 2 ||
      includesAny(n, ['공장별', '본사와', 'seal과', '1공장과', '비교'])

    if (multiGroup || includesAny(n, ['공장별'])) {
      const data = buildGroupedMonthly(
        yearAnalytics,
        trendMetric,
        trendMetric === 'scrapCost',
      )
      const series =
        groups.length >= 2
          ? groups.map((g) => ({
              key: g.id,
              label: g.label,
              color: GROUP_COLORS[g.id] ?? BAR_COLOR,
            }))
          : chartGroupBars()
      const blocks: AiBlock[] = [
        textBlock(
          `그룹별 월간 ${metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)} 추이(선그래프)입니다. (${periodNote})`,
        ),
        {
          type: 'line',
          title: `월별 ${metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)} 추이`,
          data,
          xKey: 'date',
          series,
          format,
        },
      ]
      if (withTotal) {
        blocks.push({
          type: 'composed',
          title: `월별 ${metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)} · TOTAL`,
          description: '막대: 그룹 · 선: TOTAL',
          data,
          xKey: 'date',
          bars: chartGroupBars(),
          line: {
            key: 'total',
            label: 'TOTAL',
            color: GROUP_COLORS.total!,
          },
          format,
        })
      }
      return blocks
    }

    const data = yearAnalytics.dailyTrends.map((t) => ({
      date: t.date,
      value:
        trendMetric === 'scrapCost'
          ? toMillion(t.scrapCost)
          : trendMetric === 'qty'
            ? t.qty
            : t.failRate,
    }))
    return [
      textBlock(
        `월별 ${metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)} 추이(선그래프)입니다. (${periodNote})`,
      ),
      {
        type: 'line',
        title: `월별 ${metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)}`,
        data,
        xKey: 'date',
        series: [{ key: 'value', label: metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric), color: BAR_COLOR }],
        format,
      },
      ...(withTable
        ? [
            {
              type: 'table' as const,
              title: '월별 수치',
              headers: ['기간', metricLabelOf(trendMetric === 'failRate' ? 'failRate' : trendMetric)],
              rows: data.map((r) => [
                String(r.date),
                trendMetric === 'failRate'
                  ? formatPpm(Number(r.value))
                  : trendMetric === 'scrapCost'
                    ? `${Number(r.value).toFixed(1)}백만`
                    : Number(r.value).toLocaleString(),
              ]),
            },
          ]
        : []),
    ]
  }

  // ── 이중 지표 (검수량+부적합수량 등) ──
  if (
    (includesAny(n, ['같이', '비교']) || includesAny(n, ['하고'])) &&
    ((includesAny(n, ['검수']) && includesAny(n, ['부적합', '불량'])) ||
      (includesAny(n, ['부적합률']) && includesAny(n, ['폐기'])))
  ) {
    const targets = resolveAnswerScopes(groups)
    const dualScrap = includesAny(n, ['폐기'])
    const blocks: AiBlock[] = [
      textBlock(
        dualScrap
          ? `품번별 부적합률·폐기비용 비교입니다. (단위가 달라 표+각각의 막대로 표시) (${periodNote})`
          : `품번별 검수량·부적합수량 비교입니다. (${periodNote})`,
      ),
    ]
    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const rows = sortByMetric(
        ga.products,
        dualScrap ? 'failRate' : 'qty',
        ascending,
      ).slice(0, limit)
      blocks.push({
        type: 'table',
        title: `${g.label} · TOP ${rows.length}`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      })
      const multiData: Record<string, string | number>[] = rows.map((p) => {
        const row: Record<string, string | number> = { name: p.name }
        if (dualScrap) {
          row.scrapCost = roundWon(p.scrapCost)
        } else {
          row.qty = p.qty
          row.fail = p.fail
        }
        return row
      })
      blocks.push({
        type: 'multiBar',
        title: dualScrap
          ? `${g.label} · 부적합률(참고: 표) / 폐기비용`
          : `${g.label} · 검수량·부적합수량`,
        data: multiData,
        xKey: 'name',
        series: dualScrap
          ? [{ key: 'scrapCost', label: '폐기비용', color: '#f59e0b' }]
          : [
              { key: 'qty', label: '검수량', color: '#3b82f6' },
              { key: 'fail', label: '부적합수량', color: '#ef4444' },
            ],
        format: dualScrap ? 'won' : 'count',
      })
      if (dualScrap) {
        blocks.push(
          barFromProducts(
            `${g.label} · 부적합률`,
            rows,
            'failRate',
            rows.length,
            layout,
          ),
        )
      }
    }
    return blocks
  }

  // ── 공장별 단일 지표 막대 ──
  if (
    includesAny(n, ['공장별', '그룹별']) &&
    (chartKind === 'bar' ||
      chartKind === 'hbar' ||
      includesAny(n, ['비교', '그래프', '막대'])) &&
    !includesAny(n, ['평균', '가중', '단순평균'])
  ) {
    const summaries = scopedAnalytics.groupSummaries.filter((g) => g.id !== 'all')
    const valueOf = (g: (typeof summaries)[0]) =>
      metric === 'qty'
        ? g.qty
        : metric === 'fail'
          ? g.fail
          : metric === 'scrapCost'
            ? g.scrapCost
            : g.failRate
    const data = summaries.map((g) => ({ name: g.label, value: valueOf(g) }))
    const total = data.reduce((s, d) => s + d.value, 0)
    const blocks: AiBlock[] = [
      textBlock(`공장별 ${metricLabel} 비교입니다. (${periodNote})`),
      {
        type: 'bar',
        title: `공장별 ${metricLabel}`,
        format:
          metric === 'failRate'
            ? 'ppm'
            : metric === 'scrapCost'
              ? 'won'
              : metric === 'qty'
                ? 'qty'
                : 'count',
        valueLabel: metricLabel,
        layout,
        data,
      },
    ]
    if (withTotal) {
      blocks.push(
        textBlock(
          `TOTAL ${metricLabel}: ${
            metric === 'failRate'
              ? '(비율 지표는 단순 합산하지 않음)'
              : metric === 'scrapCost'
                ? formatWon(total)
                : total.toLocaleString()
          }`,
        ),
      )
    }
    if (withTable) {
      blocks.push({
        type: 'table',
        title: '공장별 수치',
        headers: ['그룹', '검수량', '부적합', '부적합률', '폐기비용'],
        rows: summaries.map((g) => [
          g.label,
          g.qty.toLocaleString(),
          g.fail.toLocaleString(),
          formatPpm(g.failRate),
          formatWon(g.scrapCost),
        ]),
      })
    }
    return blocks
  }

  // ── 검사자 / 작업자 / 설비 / 금형 막대 ──
  if (
    (chartKind === 'bar' ||
      chartKind === 'hbar' ||
      includesAny(n, ['그래프', '막대', '차트'])) &&
    includesAny(n, ['검사자', '검사원', '성형', '작업자', '설비', '금형'])
  ) {
    if (includesAny(n, ['검사자', '검사원'])) {
      const ranked = [...scopedAnalytics.inspectors].sort((a, b) =>
        ascending ? a.qty - b.qty : b.qty - a.qty,
      )
      const rows = ranked.slice(0, limit)
      return [
        textBlock(`검사자 검수량 TOP ${rows.length}입니다. (${periodNote})`),
        {
          type: 'bar',
          title: `검사자 검수량 TOP ${rows.length}`,
          format: 'qty',
          valueLabel: '검수량',
          layout,
          data: rows.map((i) => ({ name: i.name, value: i.qty })),
        },
        ...(withTable
          ? [
              {
                type: 'table' as const,
                title: '검사자 TOP',
                headers: ['순위', '검사자', '검수량', '부적합률'],
                rows: rows.map((i, idx) => [
                  String(idx + 1),
                  i.name,
                  `${i.qty.toLocaleString()} EA`,
                  formatPpm(i.failRate),
                ]),
              },
            ]
          : []),
      ]
    }
    if (includesAny(n, ['성형', '작업자'])) {
      const ranked = [...scopedAnalytics.workers].sort((a, b) =>
        ascending ? a.qty - b.qty : b.qty - a.qty,
      )
      const rows = ranked.slice(0, limit)
      return [
        textBlock(
          `성형작업자 생산량 TOP ${rows.length}입니다. (${periodNote})`,
        ),
        {
          type: 'bar',
          title: `성형작업자 생산량 TOP ${rows.length}`,
          format: 'qty',
          layout,
          data: rows.map((w) => ({ name: w.name, value: w.qty })),
        },
      ]
    }
    if (includesAny(n, ['설비'])) {
      const ranked = [...scopedAnalytics.equipment].sort((a, b) =>
        metric === 'failRate'
          ? ascending
            ? a.failRate - b.failRate
            : b.failRate - a.failRate
          : ascending
            ? a.fail - b.fail
            : b.fail - a.fail,
      )
      const rows = ranked.slice(0, limit)
      return [
        textBlock(`설비별 ${metricLabel} TOP ${rows.length}입니다. (${periodNote})`),
        {
          type: 'bar',
          title: `설비 ${metricLabel}`,
          format: metric === 'failRate' ? 'ppm' : 'count',
          layout,
          data: rows.map((e) => ({
            name: e.name,
            value: metric === 'failRate' ? e.failRate : e.fail,
          })),
        },
      ]
    }
    if (includesAny(n, ['금형'])) {
      const ranked = [...scopedAnalytics.molds].sort((a, b) =>
        ascending ? a.fail - b.fail : b.fail - a.fail,
      )
      const rows = ranked.slice(0, limit)
      return [
        textBlock(`금형별 부적합수량 TOP ${rows.length}입니다. (${periodNote})`),
        {
          type: 'bar',
          title: '금형 부적합수량',
          format: 'count',
          layout,
          data: rows.map((m) => ({ name: m.moldNo, value: m.fail })),
        },
      ]
    }
  }

  // ── 품번 TOP 막대/가로막대 (차트 명시 또는 WORST 그래프) ──
  if (
    (chartKind === 'bar' ||
      chartKind === 'hbar' ||
      includesAny(n, ['worst', '워스트', '그래프', '차트', '막대'])) &&
    (includesAny(n, [
      '품번',
      'top',
      'worst',
      '워스트',
      '부적합',
      '불량',
      '폐기',
      '검수',
    ]) ||
      /top\s*\d+|worst\s*\d+/i.test(text))
  ) {
    const targets = resolveAnswerScopes(groups)
    const mergedFilters =
      filters.qtyMin != null ||
      filters.ppmMin != null ||
      filters.failMin != null ||
      filters.scrapMin != null ||
      filters.highQtyAndHighFailRate ||
      filters.lowFailHighRate ||
      filters.highRateAndHighFail
        ? filters
        : parseQueryFilters(text, n)
    const notes = filtersNote(mergedFilters)
    const blocks: AiBlock[] = [
      criteriaBlock({
        periodNote,
        scopeText: targets.map((t) => t.label).join(', '),
        metricLabel,
        ascending,
        limit,
        filterNotes: notes,
      }),
      textBlock(
        `${metricLabel} TOP ${limit}${
          layout === 'horizontal' ? ' (가로 막대)' : ' (막대)'
        }입니다.`,
        notes.length ? `적용 필터: ${notes.join(' · ')}` : '',
      ),
    ]
    let totalFail = 0
    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const products = applyProductFilters(ga.products, mergedFilters)
      const rows = sortByMetric(products, metric, ascending).slice(0, limit)
      totalFail += rows.reduce((s, p) => s + p.fail, 0)
      if (!rows.length) {
        blocks.push(
          textBlock(
            `${g.label}: 조건에 맞는 품번이 없습니다. (임의 데이터는 생성하지 않습니다.)`,
          ),
        )
        continue
      }
      blocks.push({
        type: 'table',
        title: `${g.label} · ${metricLabel} TOP ${rows.length}`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      })
      blocks.push(
        barFromProducts(
          `${g.label} · ${metricLabel} TOP ${rows.length}`,
          rows,
          metric,
          rows.length,
          layout,
        ),
      )
    }
    if (withTotal && metric === 'fail') {
      blocks.push(textBlock(`표시 품번 부적합수량 TOTAL: ${totalFail.toLocaleString()}`))
    }
    return blocks
  }

  return null
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

function clarifyAmbiguousQuestion(text: string, n: string): AiBlock[] | null {
  const trimmed = text.trim()
  // ── 애매한 품질 표현 (지표 미지정) ──
  if (
    includesAny(n, [
      '불량심한',
      '문제있는품번',
      '상태안좋은',
      '품질안좋은',
      '뭐가제일문제',
      '제일문제',
      '제일안좋',
      '뭐가제일안',
      '요즘불량많이',
      '불량많이나오는',
      '문제많은품번',
      '요즘상태',
      '상태어때',
    ]) ||
    /^(?:불량\s*심한\s*(?:거|것)?|문제\s*있는\s*품번|상태\s*안\s*좋은|품질\s*안\s*좋은|뭐가\s*제일\s*(?:문제|안\s*좋)|요즘\s*(?:불량|상태)|문제\s*있는\s*거)/i.test(
      trimmed,
    ) ||
    (/불량\s*심한/.test(text) &&
      !includesAny(n, ['부적합률', '부적합수량', '불량수량', '불량률']) &&
      !includesAny(n, ['갑자기', '늘어', '급증'])) ||
    (/문제\s*많/.test(text) &&
      !includesAny(n, ['부적합률', '부적합수량', '불량수량']))
  ) {
    // "갑자기 늘어난" 등은 이상치/증감 분기로
    if (includesAny(n, ['갑자기', '급증', '늘어난', '평소보다', '스파이크'])) {
      return null
    }
    return [
      textBlock(
        '부적합수량 기준으로 볼까요, 부적합률 기준으로 볼까요?',
        '예: "부적합수량 많은 품번 TOP10" / "부적합률 높은 품번 TOP10" / "이번 주 WORST5"',
      ),
    ]
  }

  // "이거 왜 안 좋아?" — 대상 없음
  if (
    /(?:이거|그거|이것)\s*왜\s*안\s*좋/.test(text) ||
    n === '이거왜안좋아' ||
    n === '왜안좋아'
  ) {
    return [
      textBlock(
        '어떤 품번(또는 직전 분석 대상)의 원인인지 알려 주세요.',
        '예: 먼저 "이번 주 WORST5"를 물은 뒤 "1위 왜 안 좋아?"처럼 이어 질문해 주세요.',
      ),
    ]
  }

  // "요즘 상태 어때?"
  if (
    /^(?:요즘\s*)?(?:상태|품질\s*현황|요즘)\s*(?:어때|어떻)/i.test(trimmed) ||
    n === '요즘상태어때'
  ) {
    return [
      textBlock(
        '어떤 기간·지표로 볼까요?',
        '예: "이번 주 품질 현황 3줄로 요약" / "이번 주 WORST5" / "지난주 대비 이번 주 부적합률"',
      ),
    ]
  }

  // TOP만 / WORST만 — 지표 미지정
  if (
    /^(?:그럼\s*)?(?:top|worst)\s*\d+\s*(?:알려|보여|줘|주세요)?[.!?]?\s*$/i.test(
      trimmed,
    ) ||
    /^(?:상위|제일\s*높은|가장\s*높은)\s*\d+\s*개?\s*(?:알려|보여|줘)?[.!]?\s*$/i.test(
      trimmed,
    )
  ) {
    return [
      textBlock(
        '어떤 기준의 TOP을 조회할까요?',
        '예: 부적합률 / 부적합수량 / 검수량 / 폐기비용',
        '예: "부적합률 높은 품번 TOP5"',
      ),
    ]
  }

  // "불량 보여줘" / "문제 있는 거" — 대상·지표 불명확
  if (
    /^(?:불량|문제|이슈)\s*(?:있는\s*거|있는것|사항)?\s*(?:보여|알려|줘)?[.!]?\s*$/i.test(
      trimmed,
    ) ||
    n === '불량보여줘' ||
    n === '문제있는거보여줘' ||
    n === '불량많은거보여줘'
  ) {
    if (n === '불량많은거보여줘' || /불량\s*많은\s*거/.test(text)) {
      return [
        textBlock(
          '불량수량(부적합수량) 기준으로 조회하면 됩니다. 예: "부적합수량 많은 품번 TOP10"',
          '부적합률 기준이면 "부적합률 높은 품번 TOP10"으로 질문해 주세요.',
        ),
      ]
    }
    return [
      textBlock(
        '무엇을 기준으로 볼까요?',
        '예: 부적합률 높은 품번 / 불량유형 TOP5 / 폐기비용 높은 품번 / 이번 주 WORST 5',
      ),
    ]
  }

  // "이번주 어때?" — 요약 의도이나 범위 불명확 → 안내(요약은 WORST 경로로 유도)
  if (
    /^(?:이번\s*주|지난\s*주|이번\s*달)\s*(?:어때|어떻|현황)?[.?]?\s*$/i.test(
      trimmed,
    )
  ) {
    return [
      textBlock(
        '어떤 현황을 볼까요?',
        '예: "이번 주 WORST 5" / "이번 주 부적합률 높은 품번" / "이번 주 품질 현황 3줄로 요약"',
      ),
    ]
  }

  // "검사자 알려줘" / "품번 알려줘" — 지표 없음
  if (
    /^(?:검사자|검사원|성형\s*작업자|작업자|품번|설비|금형)\s*(?:알려|보여|줘)?[.!]?\s*$/i.test(
      trimmed,
    )
  ) {
    return [
      textBlock(
        '어떤 지표로 순위를 볼까요?',
        '예: 검수량 / 부적합률 / 부적합수량 / 폐기비용',
        '예: "검수량 많은 검사자 TOP5"',
      ),
    ]
  }

  // "공장 비교해줘" — 지표 없음
  if (
    /^(?:공장|본사와?\s*2공장|그룹)\s*(?:비교|대비)\s*(?:해줘|해|줘)?[.!]?\s*$/i.test(
      trimmed,
    ) ||
    n === '공장비교해줘'
  ) {
    return [
      textBlock(
        '어떤 지표로 공장을 비교할까요?',
        '예: 부적합률 / 검수량 / 폐기비용',
        '예: "본사와 2공장 부적합률 비교해줘"',
      ),
    ]
  }

  // "지난주랑 비교해줘" — 지표 없음
  if (
    /^(?:지난\s*주|전주|지난\s*달|전월)(?:랑|와|하고)?\s*비교\s*(?:해줘|해|줘)?[.!]?\s*$/i.test(
      trimmed,
    )
  ) {
    return [
      textBlock(
        '어떤 지표를 비교할까요?',
        '예: 부적합률 / 검수량 / 폐기비용',
        '예: "지난주 대비 이번 주 부적합률 알려줘"',
      ),
    ]
  }

  // "그래프로 보여줘" / "상세하게 보여줘" — 대상 없음
  if (
    /^(?:그래프|막대그래프|상세|자세히)(?:로|하게)?\s*(?:보여|알려|줘)?[.!]?\s*$/i.test(
      trimmed,
    )
  ) {
    return [
      textBlock(
        '무엇을 그래프로 볼까요? 먼저 조회할 대상·지표를 알려 주세요.',
        '예: "부적합률 높은 품번 TOP5 막대그래프로"',
      ),
    ]
  }

  // "특정 품번…" 플레이스홀더 — 실제 품번 코드 없음
  if (
    includesAny(n, ['특정품번', '어떤품번']) ||
    (/특정/.test(text) && includesAny(n, ['품번']) && !/[a-z]?\d{4,}/i.test(text))
  ) {
    if (
      includesAny(n, [
        '불량유형',
        '금형',
        '설비',
        '작업자',
        'lot',
        '주요불량',
      ])
    ) {
      return [
        textBlock(
          '조회할 품번을 알려 주세요.',
          '예: "R602514의 주요 불량유형" / "R602514 금형별 부적합률"',
        ),
      ]
    }
  }

  return null
}

function answerOne(
  q: string,
  analytics: Analytics,
  records: InspectionRecord[],
  priorContext?: AiConversationContext | null,
  defaultPeriod: AiQueryPeriod | null = null,
  now = new Date(),
): AiBlock[] {
  const text = normalizeQuestionText(q.trim())
  const n = compact(text)
  if (!text) return [textBlock('질문을 입력하세요.')]

  const limit = topN(text)
  const { groups, grommetOverall } = detectGroups(n)
  const questionPeriod = parsePeriodFromQuestion(text, records, now)
  const period =
    questionPeriod ?? defaultPeriod ?? periodForAllRecords(records)
  const periodNote = period ? `기간: ${period.label}` : '기간: 전체'
  const scopedAnalytics = period
    ? analyzeRecords(records, baseFilters('all', period))
    : analytics
  const ascending = wantsAscendingSort(n, text)
  const filters = parseQueryFilters(text, n)
  const filterNotes = filtersNote(filters)

  // ── 데이터 품질·이상값 (데이터 유무 질문보다 우선) ──
  if (
    includesAny(n, [
      '이상한데이터',
      '이상값',
      '이상데이',
      '검수량보다불량',
      '불량이많은데이터',
      '부적합률이100',
      '100%넘는',
      '생산량이0',
      '검수량0',
      '누락된데이터',
      '누락데이터',
      '부적합수량>검수량',
      '부적합>검수',
      '불량>검수',
    ]) ||
    /검수량\s*보다\s*(?:불량|부적합)/.test(text) ||
    /부적합(?:수량)?\s*[>≥>]\s*검수/.test(text) ||
    /부적합(?:수량)?\s*>\s*검수/.test(text) ||
    /부적합률\s*(?:이\s*)?100\s*%?\s*넘/.test(text) ||
    /이상한\s*데이터/.test(text) ||
    (/검수량\s*0/.test(text) && includesAny(n, ['조회', '데이터', '찾아', '알려']))
  ) {
    const analyzable = records.filter(isAnalyzable)
    const failGtQty = analyzable.filter((r) => r.fail > r.qty)
    const over100 = analyzable.filter(
      (r) => r.failRate > 1_000_000 || (r.qty > 0 && r.fail > r.qty),
    )
    const zeroQty = records.filter(
      (r) => r.qty <= 0 && (r.rowClass === 'ok' || r.rowClass === 'warn'),
    )
    const errors = records.filter((r) => r.rowClass === 'error').length
    const warns = records.filter((r) => r.rowClass === 'warn').length
    const oks = records.filter((r) => r.rowClass === 'ok').length
    return [
      textBlock(
        '데이터 품질 점검 결과입니다. (오류 행은 검사 DATA 분석에서 제외됩니다.)',
        `정상 ${oks.toLocaleString()} · 경고 ${warns.toLocaleString()} · 오류 ${errors.toLocaleString()}`,
        `검수량보다 부적합이 많은 행: ${failGtQty.length.toLocaleString()}건`,
        `부적합률 100% 초과(또는 부적합>검수) 행: ${over100.length.toLocaleString()}건`,
        `검수량 0 행(정상/경고): ${zeroQty.length.toLocaleString()}건`,
      ),
      {
        type: 'table',
        title: '이상 의심 샘플 (최대 20)',
        headers: ['날짜', '품번', '검수량', '부적합', '부적합률', '등급'],
        rows: [...failGtQty, ...over100]
          .slice(0, 20)
          .map((r) => [
            r.date,
            r.product,
            r.qty.toLocaleString(),
            r.fail.toLocaleString(),
            formatPpm(r.failRate),
            r.rowClass,
          ]),
      },
    ]
  }

  // ── "데이터 있어?" / 빈 기간 안내 ──
  if (
    (includesAny(n, ['데이터있어', '데이터있니', '데이터없', '왜없어', '왜안나와', '아무도안']) ||
      /\b데이터\s*(?:있어|있니|있나|없어)/.test(text) ||
      /내일\s*데이터|모레\s*데이터/.test(text)) &&
    !includesAny(n, ['이상한', '이상값', '누락', '오류데이터', '경고데이터'])
  ) {
    const todayStr = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate())
    if (
      /내일|모레/.test(text) ||
      (questionPeriod != null && questionPeriod.startDate > todayStr)
    ) {
      return [
        textBlock(
          '해당 기간은 아직 데이터가 없습니다. (미래 일자)',
          '임의로 데이터를 생성하지 않습니다. 오늘까지의 기간으로 다시 질문해 주세요.',
        ),
      ]
    }
    const ok = hasDataInPeriod(records, period ?? questionPeriod, groups)
    const scope =
      groups.length > 0 ? groups.map((g) => g.label).join(', ') : '전체'
    if (!ok) {
      return [
        textBlock(
          `해당 조건에는 조회 가능한 데이터가 없습니다.`,
          `${periodNote} · 범위: ${scope}`,
          '다른 기간·공장으로 임의 대체하지 않습니다. (임의 데이터는 생성하지 않습니다.)',
        ),
      ]
    }
    const count = records.filter((r) => {
      if (!isAnalyzable(r)) return false
      if (period && (r.date < period.startDate || r.date > period.endDate))
        return false
      return true
    }).length
    return [
      textBlock(
        `네, 조회 가능한 데이터가 있습니다.`,
        `${periodNote} · 범위: ${scope} · 분석 대상 약 ${count.toLocaleString()}건`,
      ),
    ]
  }

  // 기간을 명시했는데 데이터가 전혀 없으면 안내 (TOP 질의 등)
  // 주간·월간 비교는 양쪽 기간을 쓰므로 단일 기간 empty 체크를 건너뜀
  const compareAsk = parseComparePeriods(text, now)
  if (
    questionPeriod &&
    !compareAsk &&
    !hasDataInPeriod(records, questionPeriod, groups) &&
    includesAny(n, ['보여', '알려', '조회', 'top', 'worst', '추이', '비교'])
  ) {
    return [
      textBlock(
        `해당 기간에는 조회 가능한 데이터가 없습니다.`,
        `요청 기간: ${questionPeriod.label}`,
        groups.length
          ? `범위: ${groups.map((g) => g.label).join(', ')}`
          : '',
        '다른 기간의 데이터를 대신 보여주지 않습니다.',
      ),
    ]
  }

  // ── 후속 질문 (직전 품번 리스트 이어받기) ──
  const followCandidate =
    Boolean(priorContext?.productNames.length) &&
    isFollowUpAsk(n, text) &&
    !isStandaloneNewAsk(n, text)

  // 조건만 덮어쓰고 전체 재조회 (2공장만 / TOP5만 / 검수량 이상만 / 막대)
  if (
    followCandidate &&
    priorContext &&
    priorContext.lastEntity !== 'inspector' &&
    priorContext.lastEntity !== 'worker'
  ) {
    const clearGroups =
      includesAny(n, [
        '전체로',
        '전체보여',
        '조건빼고',
        '빼고전체',
        '전체공장',
        '다시전체',
      ]) ||
      /공장\s*조건\s*빼|2공장\s*빼고|그룹\s*빼고|전체\s*공장/.test(text)
    const onlyGroupChange =
      !clearGroups &&
      groups.length > 0 &&
      (includesAny(n, ['만', '쪽']) || /만\s*(?:보여|알려)/.test(text)) &&
      inferMetricFromText(n) == null &&
      parseTopOnlyLimit(text, n) == null &&
      parseQtyMinEa(text, n) == null &&
      !includesAny(n, ['불량유형', '원인', '1위', '검수량도', '그품번', '이품번'])
    const topChangeMatch =
      text.match(/(?:top|TOP|상위|worst|WORST)\s*(\d+)\s*으로/i) ??
      text.match(/(?:top|TOP|상위|worst|WORST)\s*(\d+)\s*로/i) ??
      text.match(/(?:top|TOP|상위|worst|WORST)\s*(\d+)\s*만/i) ??
      text.match(/(?:를|을)\s*(?:top|TOP|상위|worst|WORST)\s*(\d+)/i) ??
      text.match(/(?:top|TOP|상위|worst|WORST)\s*(\d+)\s*(?:로\s*)?줄/i) ??
      n.match(/top(\d+)(?:만|으로|로)/)
    const onlyTopChange =
      ((parseTopOnlyLimit(text, n) != null ||
        Boolean(topChangeMatch) ||
        (/top\s*\d+\s*(?:으로|로)/i.test(text) &&
          inferMetricFromText(n) == null)) &&
        groups.length === 0 &&
        !includesAny(n, ['이품번', '그품번', '상세', '원인']))
    const clearTop = /전체\s*(?:로\s*)?(?:보여|알려)/.test(text) && !topChangeMatch
    const onlyFilterChange =
      (parseQtyMinEa(text, n) != null ||
        parsePpmMin(text, n) != null ||
        parseScrapCostMin(text, n) != null ||
        /검수량\s*[\d,]+\s*개?\s*이상만/.test(text)) &&
      inferMetricFromText(n) == null
    const onlyPeriodChange =
      Boolean(questionPeriod) &&
      groups.length === 0 &&
      inferMetricFromText(n) == null &&
      parseTopOnlyLimit(text, n) == null &&
      parseQtyMinEa(text, n) == null &&
      parseRankPick(text, n) == null &&
      !includesAny(n, [
        '불량유형',
        '원인',
        '설비',
        '금형',
        '검사자',
        '추이',
        '기여',
      ]) &&
      (/(?:지난\s*주|지난주|지난\s*달|이번\s*주|이번\s*달|8\s*월)\s*(?:로|으로)/.test(
        text,
      ) ||
        /다시\s*이번\s*주|기간\s*(?:만\s*)?(?:바꿔|변경)/.test(text) ||
        includesAny(n, ['바꿔줘', '바꿔', '로봐줘', '으로해줘']))
    const onlySortChange =
      /(?:검수량|폐기비용|부적합률|부적합수량|불량수량)\s*기준/.test(text) ||
      includesAny(n, [
        '다시정렬',
        '재정렬',
        '낮은순으로',
        '높은순으로',
        '많은순으로',
        '적은순으로',
      ]) ||
      (/(?:순으로|순서로)\s*(?:다시\s*)?(?:보여|알려|정렬)/.test(text) &&
        inferMetricFromText(n) != null) ||
      (includesAny(n, ['다시보여', '다시알려']) &&
        inferMetricFromText(n) != null)
    const onlyChartChange =
      includesAny(n, [
        '막대',
        '그래프',
        '원그래프',
        '선그래프',
        '가로',
        '누적',
        '산점',
        '바꿔',
        '표로',
        '숫자만',
      ]) &&
      inferMetricFromText(n) == null &&
      groups.length === 0 &&
      parseTopOnlyLimit(text, n) == null &&
      parseRankPick(text, n) == null &&
      !includesAny(n, ['불량유형', '원인', '상세', '그품번', '이품번', '1위']) &&
      !onlySortChange

    // "왜?" / 원인 설명 (직전 1위 또는 지정 품번)
    if (
      (/^왜\s|원인이\s*뭐|이유가\s*뭐|왜이|왜그|왜안좋/.test(text) ||
        includesAny(n, ['왜worst', '왜부적합', '왜높아', '왜늘', '왜안좋']) ||
        /(?:이거|그거|얘)\s*왜/.test(text)) &&
      priorContext.productNames.length
    ) {
      const rank = parseRankPick(text, n) ?? 1
      const name = priorContext.productNames[rank - 1] ?? priorContext.productNames[0]!
      const rows = productRowsForNames(
        records,
        [name],
        questionPeriod ?? priorContext.lastPeriod ?? period,
      )
      const p = rows[0]
      if (!p || p.qty === 0) {
        return [
          textBlock(
            `${name}에 대한 해당 기간 데이터가 없어 원인을 설명할 수 없습니다.`,
          ),
        ]
      }
      const topDefects = (p.defects ?? []).slice(0, 3)
      const defectShare = topDefects[0]
        ? formatPercent(topDefects[0].share)
        : '-'
      return [
        textBlock(
          `결과: ${p.name}(${p.type})이(가) ${metricLabelOf(priorContext.lastMetric ?? 'failRate')} 기준 ${rank}위입니다.`,
          `주요 원인(데이터): ${p.mainDefect || '-'} — 해당 유형이 품번 불량의 ${defectShare}를 차지합니다.`,
          `관련 수치: 검수량 ${p.qty.toLocaleString()}EA · 부적합 ${p.fail.toLocaleString()} · 부적합률 ${formatPpm(p.failRate)} · 폐기비용 ${formatWon(p.scrapCost)}`,
          topDefects.length
            ? `세부 불량: ${topDefects.map((d) => `${d.name} ${d.count.toLocaleString()}건(${formatPercent(d.share)})`).join(', ')}`
            : '세부 불량유형 데이터가 없습니다.',
          '데이터에 없는 현장 추정 원인은 제시하지 않습니다.',
          '불량유형 비중은 발생 연관성이며, 직접 원인이라고 단정하지 않습니다.',
        ),
        ...(p.defects?.length
          ? [
              {
                type: 'pie' as const,
                title: `${p.name} 불량유형`,
                data: p.defects.map((d) => ({
                  name: d.name,
                  value: d.count,
                  share: d.share,
                })),
              },
            ]
          : []),
      ]
    }

    if (
      clearGroups ||
      onlyGroupChange ||
      onlyTopChange ||
      clearTop ||
      onlyFilterChange ||
      onlyChartChange ||
      onlySortChange ||
      onlyPeriodChange
    ) {
      const mergedLimit = clearTop
        ? 50
        : topChangeMatch
          ? Math.min(Number(topChangeMatch[1]), 50)
          : parseTopOnlyLimit(text, n) ?? priorContext.lastLimit ?? limit
      const mergedMetric =
        inferMetricFromText(n) ??
        (onlySortChange
          ? inferMetricFromText(n) ?? priorContext.lastMetric
          : priorContext.lastMetric) ??
        'failRate'
      const mergedPeriod =
        questionPeriod ?? priorContext.lastPeriod ?? defaultPeriod ?? period
      const mergedGroups = clearGroups
        ? []
        : groups.length > 0
          ? groups
          : (priorContext.lastGroups ?? []).length
            ? GROUP_ALIASES.filter((g) =>
                priorContext.lastGroups!.some((x) => x.id === g.id),
              )
            : []
      const mergedFilters = parseQueryFilters(text, n)
      const priorQty = priorContext.lastQtyMin ?? null
      const priorPpm = priorContext.lastPpmMin ?? null
      const priorScrap = priorContext.lastScrapMin ?? null
      if (mergedFilters.qtyMin == null) mergedFilters.qtyMin = priorQty
      if (mergedFilters.ppmMin == null) mergedFilters.ppmMin = priorPpm
      if (mergedFilters.scrapMin == null) mergedFilters.scrapMin = priorScrap
      // "검수량 1000개 이상만" 후속 (검수량 단어 생략 방지)
      if (mergedFilters.qtyMin == null) {
        const bareQty = text.match(
          /(?:검\s*[수사]\s*량)?\s*([\d,]+)\s*개?\s*이상\s*만/,
        )
        if (bareQty?.[1]) {
          const v = Number(bareQty[1].replace(/,/g, ''))
          if (Number.isFinite(v) && v > 0) mergedFilters.qtyMin = v
        }
      }
      const wantTableOnly = includesAny(n, ['표로', '숫자만'])
      const wantBar =
        !wantTableOnly &&
        (onlyChartChange ||
          includesAny(n, ['막대', '그래프', '가로']) ||
          onlyTopChange ||
          onlyGroupChange ||
          onlyFilterChange ||
          onlySortChange ||
          onlyPeriodChange ||
          clearGroups)
      const chartLayout: 'vertical' | 'horizontal' = includesAny(n, [
        '가로',
        '수평',
      ])
        ? 'horizontal'
        : 'vertical'
      const targets = resolveAnswerScopes(mergedGroups)
      const note = mergedPeriod
        ? `기간: ${mergedPeriod.label}`
        : periodNote
      const mergedAsc =
        wantsAscendingSort(n, text) ||
        (priorContext.lastAscending ?? false)
      const changeLabel = clearGroups
        ? '공장/그룹 필터를 제거'
        : onlyGroupChange
          ? '분석 그룹'
          : onlyTopChange || clearTop
            ? 'TOP N'
            : onlyFilterChange
              ? '필터'
              : onlyPeriodChange
                ? '기간'
                : onlySortChange
                  ? '정렬'
                  : '표시 형태'
      const blocks: AiBlock[] = [
        criteriaBlock({
          periodNote: note,
          scopeText: targets.map((t) => t.label).join(', '),
          metricLabel: metricLabelOf(mergedMetric),
          ascending: mergedAsc,
          limit: mergedLimit,
          filterNotes: filtersNote(mergedFilters),
        }),
        textBlock(
          `이전 조건을 유지하고 ${changeLabel}만 변경했습니다.`,
          `직전 질문: ${priorContext.lastQuestion}`,
        ),
      ]
      for (const g of targets) {
        const ga =
          g.id === 'all'
            ? analyzeRecords(records, baseFilters('all', mergedPeriod))
            : analyzeGroup(records, g.id, mergedPeriod)
        let products = applyProductFilters(ga.products, mergedFilters)
        const rows = sortByMetric(products, mergedMetric, mergedAsc).slice(
          0,
          mergedLimit,
        )
        if (!rows.length) {
          blocks.push(textBlock(`${g.label}: 조건에 맞는 품번이 없습니다.`))
          continue
        }
        blocks.push({
          type: 'table',
          title: `${g.label} · ${metricLabelOf(mergedMetric)} TOP ${rows.length}`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(rows),
        })
        if (wantBar) {
          blocks.push(
            barFromProducts(
              `${g.label} · ${metricLabelOf(mergedMetric)} TOP ${Math.min(10, rows.length)}`,
              rows,
              mergedMetric,
              Math.min(10, rows.length),
              chartLayout,
            ),
          )
        }
      }
      return blocks
    }
  }

  if (followCandidate && priorContext) {
    const follow = tryAnswerFollowUp(
      text,
      n,
      records,
      priorContext,
      questionPeriod,
      periodNote,
      limit,
      defaultPeriod,
      now,
    )
    if (follow) return follow
  }
  if (isFollowUpAsk(n, text) && !priorContext?.productNames.length && !isStandaloneNewAsk(n, text)) {
    // 짧은 후속 표현만 막음 — 신규 단독 질문(기간·품번·TOP 포함)은 통과
    const looksLikeNewList =
      includesAny(n, ['품번', 'worst', '불량률', '부적합률']) &&
      (Boolean(questionPeriod) ||
        includesAny(n, ['이번주', '지난주', '이번달', '요번']) ||
        /top\s*\d+|\d+\s*개/i.test(text))
    if (looksLikeNewList) {
      // fall through
    } else if (
      includesAny(n, [
        '방금',
        '직전',
        '아까',
        '그품번',
        '이품번',
        '그리스트',
        '1위만',
      ]) ||
      parseTopOnlyLimit(text, n) != null ||
      /^(?:그럼)?(?:top|worst)\s*\d+\s*만/i.test(text.trim())
    ) {
      return [
        textBlock(
          '이어 질문할 이전 품번 리스트가 없습니다. 먼저 품번 TOP 리스트를 질문한 뒤, "1위만 보여줘" / "TOP3만"처럼 이어서 질문해 주세요.',
        ),
      ]
    }
  }

  // ── 정보가 부족한 애매한 질문 → 추가 확인 ──
  {
    const clarify = clarifyAmbiguousQuestion(text, n)
    if (clarify) return clarify
  }

  // ── "왜?" (문맥 없이 단독) — 현재 범위 WORST 1위 설명 ──
  if (
    (/^왜\s|원인이\s*뭐|이유가\s*뭐/.test(text) ||
      includesAny(n, ['왜worst', '왜부적합률', '주요불량이뭐'])) &&
    !priorContext?.productNames.length &&
    !/왜\s*숫자|숫자가\s*다르|왜\s*다르|가중|단순\s*평균/.test(text)
  ) {
    const targets = resolveAnswerScopes(groups)
    const ga =
      targets[0]!.id === 'all'
        ? scopedAnalytics
        : analyzeGroup(records, targets[0]!.id as Exclude<AnalysisGroupId, 'all'>, period)
    const top = sortByMetric(applyProductFilters(ga.products, filters), 'failRate')[0]
    if (!top) {
      return [
        textBlock(
          '설명할 WORST 품번 데이터가 없습니다.',
          periodNote,
        ),
      ]
    }
    const topDefects = (top.defects ?? []).slice(0, 3)
    return [
      criteriaBlock({
        periodNote,
        scopeText: targets.map((t) => t.label).join(', '),
        metricLabel: '부적합률',
        filterNotes,
      }),
      textBlock(
        `결과: ${top.name}(${top.type})이(가) 부적합률 ${formatPpm(top.failRate)}로 가장 높습니다.`,
        `주요 원인(데이터): ${top.mainDefect || '-'}`,
        topDefects[0]
          ? `해당 유형 비중 ${formatPercent(topDefects[0].share)} · 건수 ${topDefects[0].count.toLocaleString()}`
          : '',
        `관련 수치: 검수량 ${top.qty.toLocaleString()}EA · 부적합 ${top.fail.toLocaleString()} · 폐기비용 ${formatWon(top.scrapCost)}`,
        '데이터에 없는 추정 원인은 답하지 않습니다.',
        '불량유형 비중은 발생 연관성이며, 직접 원인이라고 단정하지 않습니다.',
      ),
      ...(top.defects?.length
        ? [
            {
              type: 'pie' as const,
              title: `${top.name} 불량유형`,
              data: top.defects.map((d) => ({
                name: d.name,
                value: d.count,
                share: d.share,
              })),
            },
          ]
        : []),
    ]
  }

  // ── 차트 중심 질의 (막대/가로/선/원/누적/산점도/이중지표) ──
  {
    const chartAnswer = tryAnswerChartQuestion(
      text,
      n,
      records,
      scopedAnalytics,
      groups,
      period,
      periodNote,
      limit,
      ascending,
      filters,
    )
    if (chartAnswer) return chartAnswer
  }

  // ── % / %p 개념 질문 (예: 3%→5%) ──
  {
    const hypo = text.match(
      /(\d+(?:\.\d+)?)\s*%\s*(?:에서|→|->|~)\s*(\d+(?:\.\d+)?)\s*%/,
    )
    if (
      hypo &&
      includesAny(n, ['증가', '올랐', '증감', '몇%', '몇퍼', '%p', '퍼센트'])
    ) {
      const from = Number(hypo[1])
      const to = Number(hypo[2])
      const pp = to - from
      const growth = from === 0 ? null : ((to - from) / from) * 100
      return [
        textBlock(
          `${from}% → ${to}% 변화는 다음과 같이 구분합니다.`,
          `퍼센트포인트 차이 = ${pp > 0 ? '+' : ''}${parseFloat(pp.toFixed(2))}%p`,
          growth == null
            ? '상대 증감률 = N/A (기준이 0%)'
            : `상대 증감률 = ${growth > 0 ? '+' : ''}${parseFloat(growth.toFixed(1))}%`,
          '예: 부적합률 3%→5%이면 +2%p이며, 상대 증감률은 +66.7%입니다.',
        ),
      ]
    }
  }

  // ── 기여도 분석 (TOP N이 전체에서 차지하는 비율) ──
  if (
    (includesAny(n, ['기여', '기여율', '차지', '비중']) &&
      (includesAny(n, ['top', '품번', '불량유형']) ||
        /top\s*\d+/i.test(text))) ||
    (/전체\s*(?:불량|부적합)/.test(text) &&
      includesAny(n, ['차지', '비중', '기여']))
  ) {
    const metric: AiMetric =
      inferMetricFromText(n) ??
      (includesAny(n, ['폐기']) ? 'scrapCost' : 'fail')
    const targets = resolveAnswerScopes(groups)
    const topCount = Math.max(limit, /top\s*10/i.test(text) ? 10 : 5)
    const blocks: AiBlock[] = [
      textBlock(
        `기여도 분석입니다. (전체 ${metricLabelOf(metric)} 대비 TOP${topCount} 합계 비율) (${periodNote})`,
      ),
    ]
    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const ranked = sortByMetric(
        applyProductFilters(ga.products, filters),
        metric,
      )
      const total = ranked.reduce((s, p) => s + productMetricValue(p, metric), 0)
      const top = ranked.slice(0, topCount)
      const topSum = top.reduce((s, p) => s + productMetricValue(p, metric), 0)
      const share =
        total > 0 ? Math.round((topSum / total) * 1000) / 10 : 0
      const top1 = top[0]
      const top1Share =
        top1 && total > 0
          ? Math.round((productMetricValue(top1, metric) / total) * 1000) / 10
          : 0
      blocks.push(
        textBlock(
          `${g.label}: 전체 ${metricLabelOf(metric)} ${
            metric === 'scrapCost'
              ? formatWon(total)
              : total.toLocaleString()
          } · TOP${top.length} 합계 ${
            metric === 'scrapCost'
              ? formatWon(topSum)
              : topSum.toLocaleString()
          } · 기여율 ${formatPercent(share)}`,
          top1
            ? `1위 ${top1.name} 기여율 ${formatPercent(top1Share)}`
            : '',
        ),
      )
      if (top.length) {
        blocks.push({
          type: 'table',
          title: `${g.label} · TOP${top.length} 기여`,
          headers: ['순위', '품번', metricLabelOf(metric), '기여율'],
          rows: top.map((p, i) => {
            const v = productMetricValue(p, metric)
            const sh = total > 0 ? Math.round((v / total) * 1000) / 10 : 0
            return [
              String(i + 1),
              p.name,
              metric === 'scrapCost' ? formatWon(v) : v.toLocaleString(),
              formatPercent(sh),
            ]
          }),
        })
        blocks.push({
          type: 'pie',
          title: `${g.label} · TOP vs 기타`,
          data: [
            { name: `TOP${top.length}`, value: topSum, share },
            {
              name: '기타',
              value: Math.max(0, total - topSum),
              share: Math.max(0, Math.round((100 - share) * 10) / 10),
            },
          ],
        })
      }
    }
    return blocks
  }

  // ── 전체 부적합률(가중) KPI ──
  if (
    /^(?:그럼\s*)?전체\s*부적합률/.test(text.trim()) ||
    (includesAny(n, ['전체부적합률', '전체불량률']) &&
      includesAny(n, ['알려', '보여', '얼마', '몇']) &&
      !includesAny(n, ['품번', 'top', '높은']))
  ) {
    const qty = scopedAnalytics.products.reduce((s, p) => s + p.qty, 0)
    const fail = scopedAnalytics.products.reduce((s, p) => s + p.fail, 0)
    const rate = qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
    return [
      textBlock(
        `전체 부적합률(가중: Σ부적합 / Σ검수)입니다. (${periodNote})`,
        `부적합률 ${formatPpm(rate)} · 검수량 ${qty.toLocaleString()}EA · 부적합 ${fail.toLocaleString()}`,
        '공장별 률의 단순 평균과 다를 수 있습니다. "공장별 평균이랑 비교해줘"로 확인하세요.',
      ),
    ]
  }

  // ── 가중 전체 vs 공장별 단순 평균 ──
  if (
    (includesAny(n, ['평균', '전체']) &&
      includesAny(n, ['부적합률', '불량률']) &&
      (includesAny(n, ['왜', '다르', '비교', '공장별', '단순', '숫자']) ||
        includesAny(n, ['합친', '합산', '합하면']))) ||
    includesAny(n, ['가중평균', '단순평균']) ||
    (includesAny(n, ['합친', '합치면', '합산']) &&
      includesAny(n, ['부적합률', '불량률'])) ||
    /왜\s*숫자|숫자가\s*다르|왜\s*다르/.test(text)
  ) {
    const targets =
      groups.length >= 2
        ? groups
        : includesAny(n, ['합친', '합치면', '합산']) && groups.length >= 1
          ? groups
          : GROUP_ALIASES
    const rows = targets.map((g) => {
      const ga = analyzeGroup(records, g.id, period)
      const qty = ga.products.reduce((s, p) => s + p.qty, 0)
      const fail = ga.products.reduce((s, p) => s + p.fail, 0)
      const scrap = ga.products.reduce((s, p) => s + p.scrapCost, 0)
      const failRate = qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
      return { label: g.label, qty, fail, scrap, failRate }
    })
    const totalQty = rows.reduce((s, r) => s + r.qty, 0)
    const totalFail = rows.reduce((s, r) => s + r.fail, 0)
    const weighted =
      totalQty > 0 ? Math.round((totalFail / totalQty) * 1_000_000) : 0
    const simpleMean =
      rows.length > 0
        ? Math.round(rows.reduce((s, r) => s + r.failRate, 0) / rows.length)
        : 0
    const wantSumQty = includesAny(n, ['검수량', '부적합수량', '합산'])
    return [
      textBlock(
        `전체 부적합률은 Σ부적합수량 / Σ검수량 × 100 기준(가중)입니다. (${periodNote})`,
        `가중 전체 부적합률 ${formatPpm(weighted)} · 공장별 단순 평균 ${formatPpm(simpleMean)}`,
        '공장별 률을 산술 평균하면 검수량 비중이 무시되어 전체 부적합률과 달라질 수 있습니다.',
      ),
      {
        type: 'table',
        title: '그룹별 집계 vs 전체(가중)',
        headers: ['구분', '검수량', '부적합', '부적합률'],
        rows: [
          ...rows.map((r) => [
            r.label,
            r.qty.toLocaleString(),
            r.fail.toLocaleString(),
            formatPpm(r.failRate),
          ]),
          [
            '전체(가중)',
            totalQty.toLocaleString(),
            totalFail.toLocaleString(),
            formatPpm(weighted),
          ],
          ['공장별 단순 평균', '-', '-', formatPpm(simpleMean)],
        ],
      },
      ...(wantSumQty
        ? [
            textBlock(
              `합산 검수량 ${totalQty.toLocaleString()} EA · 합산 부적합 ${totalFail.toLocaleString()}`,
            ),
          ]
        : []),
    ]
  }

  // ── 오류/경고/정상 DATA 건수 ──
  if (
    includesAny(n, ['오류', '경고', '정상데이터', '오류데이터', '경고데이터']) &&
    (includesAny(n, ['몇건', '건수', '몇개', '보여', '알려', '제외', '문제']) ||
      includesAny(n, ['정상하고', '오류제외']))
  ) {
    const ok = records.filter((r) => r.rowClass === 'ok').length
    const warn = records.filter((r) => r.rowClass === 'warn').length
    const error = records.filter((r) => r.rowClass === 'error').length
    const excluded = records.filter((r) => r.rowClass === 'excluded').length
    const analyzable = records.filter(isAnalyzable).length
    if (includesAny(n, ['오류제외', '오류는분석', '분석에서제외'])) {
      return [
        textBlock(
          `검사 DATA 분석에서는 오류·제외 행을 집계 대상에서 빼습니다.`,
          `현재: 정상 ${ok.toLocaleString()} · 경고 ${warn.toLocaleString()}(분석 포함) · 오류 ${error.toLocaleString()}(분석 제외) · 기타제외 ${excluded.toLocaleString()}`,
          `분석 대상: ${analyzable.toLocaleString()}건`,
        ),
      ]
    }
    if (includesAny(n, ['정상하고경고', '정상과경고', '정상경고만'])) {
      return [
        textBlock(
          `정상 ${ok.toLocaleString()}건 · 경고 ${warn.toLocaleString()}건입니다. (오류 ${error.toLocaleString()}건은 분석 제외)`,
        ),
      ]
    }
    return [
      textBlock(
        `업로드 DATA 품질 현황입니다.`,
        `정상 ${ok.toLocaleString()} · 경고 ${warn.toLocaleString()} · 오류 ${error.toLocaleString()} · 제외 ${excluded.toLocaleString()} (전체 ${records.length.toLocaleString()}건)`,
        includesAny(n, ['문제'])
          ? error > 0
            ? `오류 ${error.toLocaleString()}건이 있어 해당 행은 분석에서 제외됩니다.`
            : '오류 행은 없습니다.'
          : '',
      ),
    ]
  }

  // ── 전주/전월 대비 비교 ──
  {
    const compare = parseComparePeriods(text, now)
    const isAnomalyAsk =
      includesAny(n, [
        '평소',
        '급증',
        '갑자기',
        '스파이크',
        '급격',
        '이상하게',
        '평소와다른',
        '4주평균',
      ]) || /평소\s*보다|최근\s*4\s*주\s*평균/.test(text)
    if (compare && !isAnomalyAsk) {
      const metric: AiMetric =
        inferMetricFromText(n) ??
        (includesAny(n, ['폐기'])
          ? 'scrapCost'
          : includesAny(n, ['검수'])
            ? 'qty'
            : 'failRate')
      const metricLabel = metricLabelOf(metric)
      const targets = resolveAnswerScopes(groups)

      // 품번별 증가 TOP
      if (
        includesAny(n, ['품번']) &&
        (includesAny(n, ['늘어', '증가', '많아진', '오른']) ||
          /top\s*\d+|상위\s*\d+/i.test(text))
      ) {
        const blocks: AiBlock[] = [
          textBlock(
            `${compare.label} ${metricLabel}이 많이 늘어난 품번 TOP ${limit}입니다.`,
            `비교: ${compare.previous.label} → ${compare.current.label}`,
          ),
        ]
        for (const g of targets) {
          const curA =
            g.id === 'all'
              ? analyzeRecords(records, baseFilters('all', compare.current))
              : analyzeGroup(records, g.id, compare.current)
          const prevA =
            g.id === 'all'
              ? analyzeRecords(records, baseFilters('all', compare.previous))
              : analyzeGroup(records, g.id, compare.previous)
          const prevMap = new Map(
            prevA.products.map((p) => [compact(p.name), p] as const),
          )
          const deltas = curA.products
            .map((p) => {
              const prev = prevMap.get(compact(p.name))
              const curV = productMetricValue(p, metric)
              const prevV = prev ? productMetricValue(prev, metric) : 0
              return { product: p, delta: curV - prevV, prevV, curV }
            })
            .filter((x) => x.delta > 0)
            .sort((a, b) => b.delta - a.delta)
            .slice(0, limit)
          if (!deltas.length) {
            blocks.push(textBlock(`${g.label}: 증가한 품번이 없습니다.`))
            continue
          }
          blocks.push({
            type: 'table',
            title: `${g.label} · ${metricLabel} 증가 TOP ${deltas.length}`,
            headers: [
              '순위',
              '품번',
              `이전(${compare.previous.label})`,
              `이번(${compare.current.label})`,
              '차이',
              metric === 'failRate' ? '차이(%p)' : '증감률',
              ...(metric === 'failRate' ? ['증감률'] : []),
            ],
            rows: deltas.map((d, i) => [
              String(i + 1),
              d.product.name,
              metric === 'failRate'
                ? formatPpm(d.prevV)
                : metric === 'scrapCost'
                  ? formatWon(d.prevV)
                  : d.prevV.toLocaleString(),
              metric === 'failRate'
                ? formatPpm(d.curV)
                : metric === 'scrapCost'
                  ? formatWon(d.curV)
                  : d.curV.toLocaleString(),
              metric === 'failRate'
                ? formatPpmDelta(d.delta)
                : metric === 'scrapCost'
                  ? formatWon(d.delta)
                  : d.delta.toLocaleString(),
              metric === 'failRate'
                ? formatPpmDeltaPp(d.delta)
                : formatGrowthPercent(d.prevV, d.curV),
              ...(metric === 'failRate'
                ? [formatGrowthPercent(d.prevV, d.curV)]
                : []),
            ]),
          })
        }
        return blocks
      }

      // 전체 KPI 비교
      const preferPp =
        includesAny(n, ['%p', '퍼센트포인트', '포인트']) ||
        /몇\s*%\s*p|몇%p/.test(text)
      const preferGrowth =
        !preferPp &&
        (includesAny(n, ['증감률', '몇%', '몇퍼', '올랐어', '올랐']) ||
          /몇\s*%\s*(?:올|증|늘)/.test(text))
      const qualitative =
        includesAny(n, ['좋아졌', '나빠졌', '개선', '악화'])

      const blocks: AiBlock[] = [
        textBlock(
          `${compare.label} ${metricLabel} 비교입니다.`,
          `${compare.previous.label} ↔ ${compare.current.label}`,
          preferPp
            ? '요청 단위: 퍼센트포인트(%p) 차이'
            : preferGrowth
              ? '요청 단위: 상대 증감률(%)'
              : '',
        ),
      ]
      for (const g of targets) {
        const curA =
          g.id === 'all'
            ? analyzeRecords(records, baseFilters('all', compare.current))
            : analyzeGroup(records, g.id, compare.current)
        const prevA =
          g.id === 'all'
            ? analyzeRecords(records, baseFilters('all', compare.previous))
            : analyzeGroup(records, g.id, compare.previous)
        const sumMetric = (products: ProductRow[]) => {
          if (metric === 'qty')
            return products.reduce((s, p) => s + p.qty, 0)
          if (metric === 'fail')
            return products.reduce((s, p) => s + p.fail, 0)
          if (metric === 'scrapCost')
            return products.reduce((s, p) => s + p.scrapCost, 0)
          const qty = products.reduce((s, p) => s + p.qty, 0)
          const fail = products.reduce((s, p) => s + p.fail, 0)
          return qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
        }
        const prevVal = sumMetric(prevA.products)
        const curVal = sumMetric(curA.products)
        const delta = curVal - prevVal
        if (qualitative && metric === 'failRate') {
          const better = delta < 0
          const same = delta === 0
          blocks.push(
            textBlock(
              `${g.label}: ${
                same
                  ? '지난주와 동일합니다.'
                  : better
                    ? `좋아졌습니다. 부적합률이 ${formatPpmDeltaPp(delta)} 하락했습니다.`
                    : `나빠졌습니다. 부적합률이 ${formatPpmDeltaPp(delta)} 상승했습니다.`
              }`,
              `(${formatPpm(prevVal)} → ${formatPpm(curVal)}, 상대 증감률 ${formatGrowthPercent(prevVal, curVal)})`,
            ),
          )
          continue
        }
        if (preferPp && metric === 'failRate') {
          blocks.push(
            textBlock(
              `${g.label}: ${formatPpm(prevVal)} → ${formatPpm(curVal)} · 차이 ${formatPpmDeltaPp(delta)}`,
              `참고(상대 증감률): ${formatGrowthPercent(prevVal, curVal)}`,
            ),
          )
        } else if (preferGrowth && metric === 'failRate') {
          blocks.push(
            textBlock(
              `${g.label}: ${formatPpm(prevVal)} → ${formatPpm(curVal)} · 증감률 ${formatGrowthPercent(prevVal, curVal)}`,
              `참고(퍼센트포인트): ${formatPpmDeltaPp(delta)}`,
            ),
          )
        } else {
          blocks.push({
            type: 'table',
            title: `${g.label} · ${metricLabel} 비교`,
            headers:
              metric === 'failRate'
                ? [
                    '구분',
                    compare.previous.label,
                    compare.current.label,
                    '차이(ppm)',
                    '차이(%p)',
                    '증감률',
                  ]
                : [
                    '구분',
                    compare.previous.label,
                    compare.current.label,
                    '차이',
                    '증감률',
                  ],
            rows: [
              metric === 'failRate'
                ? [
                    metricLabel,
                    formatPpm(prevVal),
                    formatPpm(curVal),
                    formatPpmDelta(delta),
                    formatPpmDeltaPp(delta),
                    formatGrowthPercent(prevVal, curVal),
                  ]
                : [
                    metricLabel,
                    metric === 'scrapCost'
                      ? formatWon(prevVal)
                      : prevVal.toLocaleString(),
                    metric === 'scrapCost'
                      ? formatWon(curVal)
                      : curVal.toLocaleString(),
                    metric === 'scrapCost'
                      ? formatWon(delta)
                      : delta.toLocaleString(),
                    formatGrowthPercent(prevVal, curVal),
                  ],
            ],
          })
          if (metric === 'failRate') {
            blocks.push(
              textBlock(
                `참고: 차이(%p)는 퍼센트포인트, 증감률(%)은 상대 변화율입니다.`,
              ),
            )
          }
        }
        blocks.push({
          type: 'bar',
          title: `${g.label} · ${metricLabel}`,
          format:
            metric === 'failRate'
              ? 'ppm'
              : metric === 'scrapCost'
                ? 'won'
                : metric === 'qty'
                  ? 'qty'
                  : 'count',
          valueLabel: metricLabel,
          data: [
            { name: '이전', value: prevVal },
            { name: '이번', value: curVal },
          ],
        })
      }
      return blocks
    }
  }

  // ── 폐기비용 N원 이상 품번 ──
  {
    const scrapMin = parseScrapCostMin(text, n)
    if (scrapMin != null) {
      const targets = resolveAnswerScopes(groups)
      const listN = /top\s*\d+|상위\s*\d+|\d+\s*개/i.test(text) ? limit : 50
      const blocks: AiBlock[] = [
        textBlock(
          `폐기비용 ${formatWon(scrapMin)} 이상인 품번입니다. (${periodNote})`,
        ),
      ]
      for (const g of targets) {
        const ga =
          g.id === 'all'
            ? scopedAnalytics
            : analyzeGroup(records, g.id, period)
        const rows = sortByMetric(
          ga.products.filter((p) => p.scrapCost >= scrapMin),
          'scrapCost',
          ascending,
        ).slice(0, listN)
        if (!rows.length) {
          blocks.push(
            textBlock(
              `${g.label}: 폐기비용 ${formatWon(scrapMin)} 이상 품번이 없습니다.`,
            ),
          )
          continue
        }
        blocks.push({
          type: 'table',
          title: `${g.label} · 폐기비용 ≥ ${formatWon(scrapMin)}`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(rows),
        })
      }
      return blocks
    }
  }

  // ── 성형작업자 TOP ──
  if (
    includesAny(n, ['성형작업자', '성형작업', '작업자']) &&
    !includesAny(n, ['검사자', '검사원']) &&
    (includesAny(n, [
      'top',
      '상위',
      '높은',
      '많은',
      'worst',
      '별',
      '실적',
    ]) ||
      includesAny(n, ['부적합', '불량', '생산', '검수']))
  ) {
    const targets = resolveAnswerScopes(groups)
    const metric: AiMetric =
      inferMetricFromText(n) ??
      (includesAny(n, ['생산', '검수']) ? 'qty' : 'fail')
    const metricLabel = metricLabelOf(metric)
    const blocks: AiBlock[] = [
      textBlock(
        `${targets.map((t) => t.label).join(', ')} 기준 ${metricLabel}이 ${
          ascending ? '낮은' : '높은'
        } 성형작업자 TOP ${limit}입니다. (${periodNote})`,
      ),
    ]
    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const ranked = [...ga.workers].sort((a, b) => {
        const av =
          metric === 'failRate'
            ? a.failRate
            : metric === 'qty'
              ? a.qty
              : metric === 'scrapCost'
                ? a.scrapCost
                : a.fail
        const bv =
          metric === 'failRate'
            ? b.failRate
            : metric === 'qty'
              ? b.qty
              : metric === 'scrapCost'
                ? b.scrapCost
                : b.fail
        return ascending ? av - bv : bv - av
      })
      const rows = ranked.slice(0, limit)
      if (!rows.length) {
        blocks.push(textBlock(`${g.label}: 성형작업자 데이터가 없습니다.`))
        continue
      }
      blocks.push({
        type: 'table',
        title: `${g.label} · 성형작업자 ${metricLabel} TOP ${rows.length}`,
        headers: ['순위', '작업자', '검수량', '부적합', '부적합률', '폐기비용'],
        rows: rows.map((w, i) => [
          String(i + 1),
          w.name,
          `${w.qty.toLocaleString()} EA`,
          w.fail.toLocaleString(),
          formatPpm(w.failRate),
          formatWon(w.scrapCost),
        ]),
      })
    }
    return blocks
  }

  // ── LOT 분석 ──
  if (
    includesAny(n, ['lot', '롯트', '로트']) &&
    (includesAny(n, ['불량', '부적합', 'top', '높은', '많은', '별']) ||
      includesAny(n, ['문제', '검수']))
  ) {
    const productName =
      findProductName(n, scopedAnalytics.filterOptions.products) ??
      findProductName(n, scopedAnalytics.products.map((p) => p.name))
    const namedDefect = findNamedDefectType(
      n,
      records,
      productName ? [productName] : [],
    )
    const lotMap = new Map<
      string,
      { lot: string; qty: number; fail: number; scrapCost: number; product: string }
    >()
    for (const r of records) {
      if (!isAnalyzable(r)) continue
      if (period && (r.date < period.startDate || r.date > period.endDate))
        continue
      if (productName && compact(r.product) !== compact(productName)) continue
      if (groups.length) {
        const ok = groups.some((g) => {
          const ga = analyzeGroup(records, g.id, period)
          return ga.products.some((p) => compact(p.name) === compact(r.product))
        })
        // 그룹 필터: 레코드 team/type 직접 매칭이 더 정확
        void ok
      }
      if (groups.length) {
        const matchGroup = groups.some((g) => {
          if (g.id === 'plant2') return r.team.includes('2공장')
          if (g.id === 'seal')
            return (
              r.team.includes('본사') &&
              /seal|실링|씰/i.test(r.productType)
            )
          if (g.id === 'hydraulic')
            return (
              r.team.includes('본사') &&
              /grommet|그로멧|유압/i.test(r.productType)
            )
          return true
        })
        if (!matchGroup) continue
      }
      if (namedDefect) {
        const matched = defectKeyMatch(r.defects ?? {}, namedDefect)
        if (!matched) continue
      }
      const key = r.lot || '미지정'
      const prev = lotMap.get(key) ?? {
        lot: key,
        qty: 0,
        fail: 0,
        scrapCost: 0,
        product: r.product,
      }
      prev.qty += r.qty
      prev.fail += r.fail
      prev.scrapCost += r.scrapCost
      lotMap.set(key, prev)
    }
    const metric: AiMetric = inferMetricFromText(n) ?? 'fail'
    const rows = [...lotMap.values()]
      .map((x) => ({
        ...x,
        failRate: x.qty > 0 ? Math.round((x.fail / x.qty) * 1_000_000) : 0,
      }))
      .sort((a, b) => {
        const av =
          metric === 'failRate'
            ? a.failRate
            : metric === 'qty'
              ? a.qty
              : metric === 'scrapCost'
                ? a.scrapCost
                : a.fail
        const bv =
          metric === 'failRate'
            ? b.failRate
            : metric === 'qty'
              ? b.qty
              : metric === 'scrapCost'
                ? b.scrapCost
                : b.fail
        return ascending ? av - bv : bv - av
      })
      .slice(0, limit)
    if (!rows.length) {
      return [textBlock(`조건에 맞는 LOT가 없습니다. (${periodNote})`)]
    }
    return [
      textBlock(
        `${productName ? `${productName} · ` : ''}${metricLabelOf(metric)} 기준 LOT TOP ${rows.length}입니다. (${periodNote})`,
      ),
      {
        type: 'table',
        title: `LOT TOP ${rows.length}`,
        headers: ['순위', 'LOT', '품번', '검수량', '부적합', '부적합률'],
        rows: rows.map((r, i) => [
          String(i + 1),
          r.lot,
          r.product,
          `${r.qty.toLocaleString()} EA`,
          r.fail.toLocaleString(),
          formatPpm(r.failRate),
        ]),
      },
    ]
  }

  // ── 설비 + 특정 불량유형 (예: S1에서 찍힘 많이 나온 품번) ──
  if (
    includesAny(n, ['설비']) ||
    scopedAnalytics.equipment.some((e) => e.name && n.includes(compact(e.name)))
  ) {
    const equipmentHit = scopedAnalytics.equipment.find(
      (e) => e.name && n.includes(compact(e.name)),
    )
    const namedDefect = findNamedDefectType(n, records, [])
    if (equipmentHit && (namedDefect || includesAny(n, ['품번', '불량', '부적합']))) {
      if (namedDefect) {
        const productMap = new Map<
          string,
          { name: string; type: string; qty: number; fail: number; defectCount: number }
        >()
        for (const r of records) {
          if (!isAnalyzable(r)) continue
          if (compact(r.equipment) !== compact(equipmentHit.name)) continue
          if (period && (r.date < period.startDate || r.date > period.endDate))
            continue
          const matched = defectKeyMatch(r.defects ?? {}, namedDefect)
          if (!matched) continue
          const key = compact(r.product)
          const prev = productMap.get(key) ?? {
            name: r.product,
            type: r.productType || '-',
            qty: 0,
            fail: 0,
            defectCount: 0,
          }
          prev.qty += r.qty
          prev.fail += r.fail
          prev.defectCount += r.defects[matched] ?? 0
          productMap.set(key, prev)
        }
        const rows = [...productMap.values()]
          .sort((a, b) => b.defectCount - a.defectCount || b.fail - a.fail)
          .slice(0, limit)
        if (!rows.length) {
          return [
            textBlock(
              `${equipmentHit.name}에서 ${namedDefect} 발생 품번이 없습니다. (${periodNote})`,
            ),
          ]
        }
        return [
          textBlock(
            `${equipmentHit.name}에서 ${namedDefect}이(가) 많이 나온 품번 TOP ${rows.length}입니다. (${periodNote})`,
          ),
          {
            type: 'table',
            title: `${equipmentHit.name} · ${namedDefect} 품번 TOP`,
            headers: ['순위', '품번', '유형', `${namedDefect} 건수`, '검수량', '부적합'],
            rows: rows.map((r, i) => [
              String(i + 1),
              r.name,
              r.type,
              r.defectCount.toLocaleString(),
              `${r.qty.toLocaleString()} EA`,
              r.fail.toLocaleString(),
            ]),
          },
        ]
      }
    }
  }

  // ── 금형별 (특정 품번) ──
  if (includesAny(n, ['금형']) && includesAny(n, ['품번', '불량', '부적합', '생산'])) {
    const productName =
      findProductName(n, scopedAnalytics.filterOptions.products) ??
      findProductName(n, scopedAnalytics.products.map((p) => p.name))
    if (productName) {
      const molds = scopedAnalytics.molds.filter(
        (m) => compact(m.product) === compact(productName),
      )
      const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'
      const rows = [...molds]
        .sort((a, b) =>
          ascending
            ? (metric === 'failRate'
                ? a.failRate - b.failRate
                : metric === 'qty'
                  ? a.qty - b.qty
                  : a.scrapCost - b.scrapCost)
            : metric === 'failRate'
              ? b.failRate - a.failRate
              : metric === 'qty'
                ? b.qty - a.qty
                : b.scrapCost - a.scrapCost,
        )
        .slice(0, limit)
      if (!rows.length) {
        return [
          textBlock(
            `${productName}의 금형 데이터가 없습니다. (${periodNote})`,
          ),
        ]
      }
      return [
        textBlock(
          `${productName} · 금형별 ${metricLabelOf(metric)}입니다. (${periodNote})`,
        ),
        {
          type: 'table',
          title: `${productName} 금형별`,
          headers: ['순위', '금형', '검수량', '부적합률', '폐기비용', '주요불량'],
          rows: rows.map((m, i) => [
            String(i + 1),
            m.moldNo,
            m.qty.toLocaleString(),
            formatPpm(m.failRate),
            formatWon(m.scrapCost),
            m.mainDefect,
          ]),
        },
      ]
    }
  }

  // ── 목표·임계값 초과 ──
  if (
    includesAny(n, ['목표', '임계', '관리기준', '기준초과', '목표대비']) &&
    includesAny(n, ['부적합', '불량', '초과', '넘는', '높은', '품번', '보여', '알려'])
  ) {
    const pctMatch =
      text.match(/목표[^\d]{0,12}(\d+(?:\.\d+)?)\s*(?:%|％|프로)?/) ??
      text.match(/(\d+(?:\.\d+)?)\s*(?:%|％)\s*(?:목표|기준|임계)/)
    const targetPpm =
      pctMatch && Number.isFinite(Number(pctMatch[1]))
        ? Math.round(Number(pctMatch[1]) * 10_000)
        : filters.ppmMin ?? 20_000
    const targets = resolveAnswerScopes(groups)
    const blocks: AiBlock[] = [
      criteriaBlock({
        periodNote,
        scopeText: targets.map((t) => t.label).join(', '),
        metricLabel: '부적합률',
        limit,
        filterNotes: [
          ...filterNotes,
          `목표/임계 ${formatPpm(targetPpm)} (${(targetPpm / 10_000).toFixed(2).replace(/\.?0+$/, '')}%) 초과`,
        ],
      }),
      textBlock(
        `목표·임계(${formatPpm(targetPpm)})를 초과한 품번입니다. (검수량 가중 집계 기준)`,
      ),
    ]
    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const rows = sortByMetric(
        applyProductFilters(ga.products, {
          ...filters,
          ppmMin: Math.max(filters.ppmMin ?? 0, targetPpm + 1),
        }),
        'failRate',
      ).slice(0, limit)
      if (!rows.length) {
        blocks.push(textBlock(`${g.label}: 임계 초과 품번이 없습니다.`))
        continue
      }
      blocks.push({
        type: 'table',
        title: `${g.label} · 목표 초과 TOP ${rows.length}`,
        headers: ['순위', '품번', '유형', '부적합률', '검수량', '목표대비(%p)', '주요불량'],
        rows: rows.map((p, i) => [
          String(i + 1),
          p.name,
          p.type,
          formatPpm(p.failRate),
          `${p.qty.toLocaleString()} EA`,
          formatPpmDeltaPp(p.failRate - targetPpm),
          p.mainDefect || '-',
        ]),
      })
    }
    return blocks
  }

  // ── 순위 변화 (이번 vs 지난 / WORST·TOP 진입·탈락) ──
  if (
    (includesAny(n, ['순위', '랭킹']) &&
      includesAny(n, ['바뀌', '변화', '변동', '오른', '내린', '빠진', '들어온', '새로', '비교'])) ||
    (includesAny(n, ['worst', '워스트', 'top']) &&
      includesAny(n, [
        '비교',
        '새로',
        '들어온',
        '빠진',
        '진입',
        '탈락',
        '지난주에도',
        '지난주1위',
      ])) ||
    includesAny(n, ['순위가가장많이', '순위가장많이'])
  ) {
    const compare =
      parseComparePeriods(text, now) ??
      parseComparePeriods('지난주 대비 이번 주', now)
    if (compare) {
      const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'
      const topCount = Math.max(limit, 10)
      const gaCur = analyzeRecords(
        records,
        baseFilters('all', compare.current),
      )
      const gaPrev = analyzeRecords(
        records,
        baseFilters('all', compare.previous),
      )
      const curRanked = sortByMetric(gaCur.products, metric)
      const prevRanked = sortByMetric(gaPrev.products, metric)
      const prevRank = new Map(
        prevRanked.map((p, i) => [compact(p.name), i + 1] as const),
      )
      const curTop = curRanked.slice(0, topCount)
      const prevTopNames = new Set(
        prevRanked.slice(0, topCount).map((p) => compact(p.name)),
      )
      const entered = curTop.filter((p) => !prevTopNames.has(compact(p.name)))
      const exited = prevRanked
        .slice(0, topCount)
        .filter((p) => !curTop.some((c) => compact(c.name) === compact(p.name)))
      const movers = curTop
        .map((p, i) => {
          const before = prevRank.get(compact(p.name))
          const after = i + 1
          const delta = before != null ? before - after : null
          return { p, before, after, delta }
        })
        .filter((x) => x.delta != null && x.delta !== 0)
        .sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!))

      const wantEntered = includesAny(n, ['새로', '들어온', '진입'])
      const wantExited = includesAny(n, ['빠진', '탈락', '나간'])
      const blocks: AiBlock[] = [
        textBlock(
          `${compare.label} ${metricLabelOf(metric)} 순위 변화입니다.`,
          `${compare.previous.label} → ${compare.current.label} (TOP ${topCount} 기준)`,
        ),
      ]
      if (!wantExited) {
        blocks.push({
          type: 'table',
          title: wantEntered
            ? `새로 TOP${topCount} 진입`
            : `순위 변동 (상승폭 큰 순)`,
          headers: ['품번', '이전순위', '이번순위', '변동'],
          rows: (wantEntered ? entered.map((p) => {
            const after = curTop.findIndex((c) => compact(c.name) === compact(p.name)) + 1
            return { p, before: null as number | null, after, delta: null as number | null }
          }) : movers)
            .slice(0, limit)
            .map((x) => [
              x.p.name,
              x.before != null ? String(x.before) : '권외',
              String(x.after),
              x.delta != null
                ? x.delta > 0
                  ? `▲${x.delta}`
                  : `▼${Math.abs(x.delta)}`
                : '신규',
            ]),
        })
      }
      if (wantExited || (!wantEntered && exited.length)) {
        blocks.push({
          type: 'table',
          title: `지난 TOP${topCount}에서 빠진 품번`,
          headers: ['품번', '이전순위', '이번순위'],
          rows: exited.slice(0, limit).map((p) => {
            const before = prevRank.get(compact(p.name)) ?? '-'
            const afterIdx = curRanked.findIndex(
              (c) => compact(c.name) === compact(p.name),
            )
            return [
              p.name,
              String(before),
              afterIdx >= 0 ? String(afterIdx + 1) : '권외',
            ]
          }),
        })
      }
      return blocks
    }
  }

  // ── 급증·이상치 (비교기간 또는 최근 4주 평균 대비) ──
  if (
    includesAny(n, [
      '급증',
      '갑자기',
      '평소보다',
      '이상하게',
      '급격',
      '스파이크',
      '평소와다른',
      '4주평균',
      '최근4주',
    ]) ||
    (/평소/.test(text) && includesAny(n, ['높', '늘', '줄', '다른'])) ||
    (/최근\s*4\s*주/.test(text) && includesAny(n, ['평균', '높', '많']))
  ) {
    const use4w = /최근\s*4\s*주|4주\s*평균|평소/.test(text)
    const compare =
      parseComparePeriods(text, now) ??
      (use4w
        ? null
        : parseComparePeriods('지난주 대비 이번 주', now))

    const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'
    let baselineLabel = ''
    let curPeriod: AiQueryPeriod
    let baselineProducts: ProductRow[]

    if (use4w || !compare) {
      const weeks = buildWeekBuckets(now, 5)
      const cur = weeks[weeks.length - 1]!
      const baseStart = weeks[0]!.startDate
      const baseEnd = weeks[weeks.length - 2]!.endDate
      curPeriod = {
        startDate: cur.startDate,
        endDate: cur.endDate,
        label: cur.label,
      }
      baselineLabel = `최근 4주 평균(${baseStart}~${baseEnd})`
      const gaCur = analyzeRecords(records, baseFilters('all', curPeriod))
      const baseMap = new Map<string, { qty: number; fail: number; scrap: number }>()
      for (const r of records) {
        if (!isAnalyzable(r)) continue
        if (r.date < baseStart || r.date > baseEnd) continue
        const key = compact(r.product)
        const prev = baseMap.get(key) ?? { qty: 0, fail: 0, scrap: 0 }
        prev.qty += r.qty
        prev.fail += r.fail
        prev.scrap += r.scrapCost
        baseMap.set(key, prev)
      }
      // 4주 합계 → 주 평균으로 환산
      baselineProducts = [...baseMap.entries()].map(([key, v]) => {
        const avgQty = v.qty / 4
        const avgFail = v.fail / 4
        const avgScrap = v.scrap / 4
        const failRate =
          avgQty > 0 ? Math.round((avgFail / avgQty) * 1_000_000) : 0
        const found = gaCur.products.find((p) => compact(p.name) === key)
        return {
          id: key,
          name: found?.name ?? key,
          type: found?.type ?? '',
          qty: avgQty,
          fail: avgFail,
          pass: Math.max(0, avgQty - avgFail),
          failTotal: avgFail,
          failRate,
          hours: 0,
          minutes: 0,
          uph: 0,
          scrapCost: avgScrap,
          mainDefect: '',
          defects: [],
          defectSummary: '',
          status: '정상' as const,
          changeRate: 0,
        }
      })
      const prevMap = new Map(
        baselineProducts.map((p) => [compact(p.name), p] as const),
      )
      const spikes = gaCur.products
        .map((p) => {
          const prev = prevMap.get(compact(p.name))
          const curV = productMetricValue(p, metric)
          const prevV = prev ? productMetricValue(prev, metric) : 0
          const ratio = prevV > 0 ? curV / prevV : curV > 0 ? 99 : 1
          const delta = curV - prevV
          return { p, prevV, curV, ratio, delta }
        })
        .filter((x) => {
          if (includesAny(n, ['줄어', '감소', '적은'])) {
            return x.prevV > 0 && x.curV < x.prevV * 0.5
          }
          return (
            x.delta > 0 &&
            (x.ratio >= 1.5 ||
              (metric === 'failRate' && x.delta >= 10_000))
          )
        })
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, limit)

      return [
        criteriaBlock({
          periodNote: `${baselineLabel} → ${curPeriod.label}`,
          scopeText: '전체',
          metricLabel: metricLabelOf(metric),
          limit,
          filterNotes: ['최근 4주 평균 대비 급변'],
        }),
        textBlock(
          `최근 4주 평균 대비 ${metricLabelOf(metric)}이(가) 높은/급변한 품번입니다.`,
          '평소 대비 이상 징후 후보이며, 원인이라고 단정하지 않습니다.',
        ),
        {
          type: 'table',
          title: `이상 후보 TOP ${spikes.length}`,
          headers: [
            '순위',
            '품번',
            '4주평균',
            '이번주',
            metric === 'failRate' ? '차이(%p)' : '차이',
            '배수',
          ],
          rows: spikes.map((x, i) => [
            String(i + 1),
            x.p.name,
            metric === 'failRate'
              ? formatPpm(x.prevV)
              : metric === 'scrapCost'
                ? formatWon(x.prevV)
                : Math.round(x.prevV).toLocaleString(),
            metric === 'failRate'
              ? formatPpm(x.curV)
              : metric === 'scrapCost'
                ? formatWon(x.curV)
                : x.curV.toLocaleString(),
            metric === 'failRate'
              ? formatPpmDeltaPp(x.delta)
              : Math.round(x.delta).toLocaleString(),
            x.ratio >= 99 ? '신규/급증' : `${x.ratio.toFixed(1)}배`,
          ]),
        },
      ]
    }

    if (compare) {
      const gaCur = analyzeRecords(
        records,
        baseFilters('all', compare.current),
      )
      const gaPrev = analyzeRecords(
        records,
        baseFilters('all', compare.previous),
      )
      const prevMap = new Map(
        gaPrev.products.map((p) => [compact(p.name), p] as const),
      )
      const spikes = gaCur.products
        .map((p) => {
          const prev = prevMap.get(compact(p.name))
          const curV = productMetricValue(p, metric)
          const prevV = prev ? productMetricValue(prev, metric) : 0
          const ratio = prevV > 0 ? curV / prevV : curV > 0 ? 99 : 1
          const delta = curV - prevV
          return { p, prevV, curV, ratio, delta }
        })
        .filter((x) => {
          if (includesAny(n, ['줄어', '감소', '적은'])) {
            return x.prevV > 0 && x.curV < x.prevV * 0.5
          }
          return x.delta > 0 && (x.ratio >= 1.5 || (metric === 'failRate' && x.delta >= 10_000))
        })
        .sort((a, b) => b.ratio - a.ratio)
        .slice(0, limit)

      return [
        criteriaBlock({
          periodNote: `${compare.previous.label} → ${compare.current.label}`,
          scopeText: '전체',
          metricLabel: metricLabelOf(metric),
          limit,
          filterNotes: ['비교기간 대비 급변(약 1.5배 이상 또는 률 +1%p↑)'],
        }),
        textBlock(
          `비교기간 대비 ${metricLabelOf(metric)}이(가) 급변한 품번입니다.`,
          '발생 연관성 기준이며, 직접 원인 확정은 추가 조사가 필요합니다.',
        ),
        {
          type: 'table',
          title: `급변 품번 TOP ${spikes.length}`,
          headers: [
            '순위',
            '품번',
            '이전',
            '이번',
            metric === 'failRate' ? '차이(%p)' : '차이',
            '배수',
          ],
          rows: spikes.map((x, i) => [
            String(i + 1),
            x.p.name,
            metric === 'failRate'
              ? formatPpm(x.prevV)
              : metric === 'scrapCost'
                ? formatWon(x.prevV)
                : x.prevV.toLocaleString(),
            metric === 'failRate'
              ? formatPpm(x.curV)
              : metric === 'scrapCost'
                ? formatWon(x.curV)
                : x.curV.toLocaleString(),
            metric === 'failRate'
              ? formatPpmDeltaPp(x.delta)
              : x.delta.toLocaleString(),
            x.ratio >= 99 ? '신규/급증' : `${x.ratio.toFixed(1)}배`,
          ]),
        },
      ]
    }
  }

  // ── 주간 WORST / 현황 요약 ──
  if (
    includesAny(n, ['worst', '워스트']) ||
    (includesAny(n, ['이번주', '지난주', '금주']) &&
      includesAny(n, ['요약', '현황', '이슈', '문제', '주간보고', '보고용', '관리자']))
  ) {
    const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'
    const targets = groups.length ? groups : GROUP_ALIASES
    const listN = includesAny(n, ['worst', '워스트']) ? limit : Math.min(limit, 5)
    const blocks: AiBlock[] = [
      textBlock(
        includesAny(n, ['요약', '이슈', '주간보고', '3줄', '보고용', '관리자', '달라진'])
          ? `주간 품질 요약입니다. (${periodNote})`
          : `WORST ${listN} (부적합률 높은 품번)입니다. (${periodNote})`,
      ),
    ]
    if (
      includesAny(n, [
        '요약',
        '이슈',
        '주간보고',
        '3줄',
        '보고용',
        '관리자',
        '달라진',
      ])
    ) {
      const all = analyzeRecords(records, baseFilters('all', period))
      const qty = all.products.reduce((s, p) => s + p.qty, 0)
      const fail = all.products.reduce((s, p) => s + p.fail, 0)
      const scrap = all.products.reduce((s, p) => s + p.scrapCost, 0)
      const rate = qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
      const worst = sortByMetric(all.products, 'failRate').slice(0, 3)
      const topDefect = all.defectTypes.slice(0, 3)
      blocks.push(
        textBlock(
          `1) 검수량 ${qty.toLocaleString()} EA · 부적합률 ${formatPpm(rate)} · 폐기비용 ${formatWon(scrap)}`,
          `2) WORST 품번: ${
            worst.map((p) => `${p.name}(${formatPpm(p.failRate)})`).join(', ') ||
            '-'
          }`,
          `3) 주요 불량: ${
            topDefect.map((d) => `${d.name} ${formatPercent(d.share)}`).join(', ') ||
            '-'
          }`,
        ),
      )
    }
    for (const g of targets) {
      const ga = analyzeGroup(records, g.id, period)
      const rows = sortByMetric(ga.products, metric, ascending).slice(0, listN)
      if (!rows.length) {
        blocks.push(textBlock(`${g.label}: 데이터 없음`))
        continue
      }
      blocks.push({
        type: 'table',
        title: `${g.label} · WORST ${rows.length} (${metricLabelOf(metric)})`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      })
      blocks.push(
        barFromProducts(
          `${g.label} · WORST ${Math.min(5, rows.length)}`,
          rows,
          metric,
          Math.min(5, rows.length),
        ),
      )
    }
    return blocks
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

  // ── 그룹(공장) 지표 비교 — 품번 TOP보다 우선 ──
  if (
    includesAny(n, ['비교', '대비']) &&
    !includesAny(n, ['지난주', '전주', '지난달', '전월', '이번주', '이번달']) &&
    (groups.length >= 2 || includesAny(n, ['공장', '본사', '그룹'])) &&
    findProductNames(n, scopedAnalytics.filterOptions.products).length < 2 &&
    extractMentionedProductCodes(text).length < 2
  ) {
    const metric: AiMetric = inferMetricFromText(n) ?? 'failRate'
    const metricLabel = metricLabelOf(metric)
    const targets =
      groups.length >= 2
        ? groups
        : GROUP_ALIASES
    const rows = targets.map((g) => {
      const ga = analyzeGroup(records, g.id, period)
      const qty = ga.products.reduce((s, p) => s + p.qty, 0)
      const fail = ga.products.reduce((s, p) => s + p.fail, 0)
      const scrap = ga.products.reduce((s, p) => s + p.scrapCost, 0)
      const failRate = qty > 0 ? Math.round((fail / qty) * 1_000_000) : 0
      return {
        label: g.label,
        qty,
        fail,
        failRate,
        scrapCost: scrap,
        value:
          metric === 'qty'
            ? qty
            : metric === 'fail'
              ? fail
              : metric === 'scrapCost'
                ? scrap
                : failRate,
      }
    })
    return [
      textBlock(`분석 그룹별 ${metricLabel} 비교입니다. (${periodNote})`),
      {
        type: 'table',
        title: `그룹 ${metricLabel} 비교`,
        headers: ['그룹', '검수량', '부적합', '부적합률', '폐기비용'],
        rows: rows.map((r) => [
          r.label,
          r.qty.toLocaleString(),
          r.fail.toLocaleString(),
          formatPpm(r.failRate),
          formatWon(r.scrapCost),
        ]),
      },
      {
        type: 'bar',
        title: `그룹별 ${metricLabel}`,
        format:
          metric === 'failRate'
            ? 'ppm'
            : metric === 'scrapCost'
              ? 'won'
              : metric === 'qty'
                ? 'qty'
                : 'count',
        valueLabel: metricLabel,
        data: rows.map((r) => ({ name: r.label, value: r.value })),
      },
    ]
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
          ? '본사(SEAL)·본사(GROMMET)·2공장은 막대, TOTAL은 선으로 표시한 월별(1~12월) 추이입니다.'
          : '본사(SEAL)·본사(GROMMET)·2공장 막대로 표시한 월별(1~12월) 추이입니다.',
      ),
      ...metrics.map((m) => ({
        type: 'composed' as const,
        title: m.title,
        description: wantTotalLine
          ? '막대: 본사(SEAL) / 본사(GROMMET) / 2공장 · 선: TOTAL'
          : '막대: 본사(SEAL) / 본사(GROMMET) / 2공장',
        data: buildGroupedMonthly(scopedAnalytics, m.key, m.million),
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

  // ── 복합 필터(검수량·부적합률·부적합수·폐기 AND / 상대조건) + 품번 TOP ──
  // qtyMin만 있는 기존 "검수량 N EA + 부적합률 TOP" 분기는 아래 qtyMinEa에 맡긴다.
  {
    const hasRichFilter =
      filters.ppmMin != null ||
      filters.ppmMax != null ||
      filters.failMin != null ||
      filters.failMax != null ||
      filters.scrapMin != null ||
      filters.scrapMax != null ||
      filters.qtyMax != null ||
      filters.highQtyAndHighFailRate ||
      filters.lowFailHighRate ||
      filters.highRateAndHighFail ||
      filters.lowQtyHighFailRate ||
      filters.highQtyLowFail ||
      filters.highQtyAndHighFail ||
      filters.highRateAndHighScrap ||
      filters.lowRateHighFail ||
      (filters.qtyMin != null &&
        (filters.ppmMin != null ||
          filters.failMin != null ||
          filters.scrapMin != null ||
          filters.highRateAndHighFail))
    const wantScrapReorder =
      includesAny(n, ['폐기']) &&
      includesAny(n, ['리스트', '목록', '재정렬', '순으로'])
    if (
      hasRichFilter &&
      !wantScrapReorder &&
      includesAny(n, [
        '품번',
        '부적합',
        '불량',
        '폐기',
        '검수',
        'top',
        '높은',
        '많은',
        '보여',
        '알려',
        '찾아',
      ]) &&
      !includesAny(n, ['검사자', '검사원', '성형', '설비', '금형', '불량유형'])
    ) {
      const inferred = inferMetricFromText(n)
      const resolvedMetric: AiMetric =
        inferred ??
        (includesAny(n, ['폐기'])
          ? 'scrapCost'
          : includesAny(n, ['불량많은', '부적합많은', '불량수량', '부적합수량']) &&
              !includesAny(n, ['부적합률', '불량률', '률', '율'])
            ? 'fail'
            : 'failRate')
      const listN = topN(text)
      const targets = resolveAnswerScopes(groups)
      const wantBar = includesAny(n, ['막대', '그래프', '차트', 'bar'])
      const blocks: AiBlock[] = [
        criteriaBlock({
          periodNote,
          scopeText: targets.map((t) => t.label).join(', '),
          metricLabel: metricLabelOf(resolvedMetric),
          ascending,
          limit: listN,
          filterNotes,
        }),
        textBlock(
          `복합 조건을 AND로 적용한 ${metricLabelOf(resolvedMetric)} TOP ${listN}입니다.`,
        ),
      ]
      for (const g of targets) {
        const ga =
          g.id === 'all'
            ? scopedAnalytics
            : analyzeGroup(records, g.id, period)
        const products = applyProductFilters(ga.products, filters)
        const rows = sortByMetric(products, resolvedMetric, ascending).slice(
          0,
          listN,
        )
        if (!rows.length) {
          blocks.push(
            textBlock(`${g.label}: 조건에 맞는 품번이 없습니다.`),
          )
          continue
        }
        blocks.push({
          type: 'table',
          title: `${g.label} · ${metricLabelOf(resolvedMetric)} TOP ${rows.length}`,
          headers: PRODUCT_HEADERS,
          rows: productTableRows(rows),
        })
        if (wantBar) {
          blocks.push(
            barFromProducts(
              `${g.label} · ${metricLabelOf(resolvedMetric)}`,
              rows,
              resolvedMetric,
              Math.min(10, rows.length),
            ),
          )
        }
      }
      return blocks
    }
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
      criteriaBlock({
        periodNote,
        scopeText: targets.map((t) => t.label).join(', '),
        metricLabel: metricLabelOf('failRate'),
        ascending: false,
        limit: listN,
        filterNotes:
          filterNotes.length > 0
            ? filterNotes
            : [`검수량 ≥ ${qtyMinEa.toLocaleString()}EA`],
      }),
      textBlock(
        `검수량 ${qtyMinEa.toLocaleString()}EA 이상인 품번 중 부적합률 TOP ${listN}입니다.${
          wantBar ? ` TOP ${barN}은 막대그래프로 표시합니다.` : ''
        }${
          wantScrapList
            ? ' 동일 TOP 품번을 폐기비용 높은 순으로도 정리했습니다.'
            : ''
        }`,
      ),
    ]

    for (const g of targets) {
      const ga =
        g.id === 'all'
          ? scopedAnalytics
          : analyzeGroup(records, g.id, period)
      const filtered = sortByMetric(
        applyProductFilters(ga.products, {
          ...filters,
          qtyMin: Math.max(filters.qtyMin ?? 0, qtyMinEa),
        }),
        'failRate',
        false,
      )
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
      !includesAny(n, ['비교', '대비']) &&
      includesAny(n, ['top', '상위', '리스트', '폐기', '부적합', '불량', '검수', '불량유형', 'worst', '워스트', '높은', '많은']) &&
      (
        includesAny(n, [
          '각각',
          '1공장',
          'seal',
          '2공장',
          'grommet',
          '그로멧',
          '유압',
          '구지',
          '본사',
          '원그래프',
          '막대',
          '품번',
          'worst',
          '워스트',
        ]) ||
        includesAny(n, ['top10', '상위10', '10까지']) ||
        /top\s*\d+|상위\s*\d+|worst\s*\d+|\d+\s*개/i.test(text)
      ) &&
      (includesAny(n, ['폐기', '부적합', '검수', '리스트', '막대', '품번', '불량', 'worst']) ||
        includesAny(n, ['각각', '1공장', 'seal', '2공장', '구지', '유압'])) &&
      !includesAny(n, ['10000', '10,000', '5000', '5,000', '상대적으로']) &&
      !includesAny(n, ['검사원', '검사자', '성형작업자', '작업자', '설비', '금형']) &&
      !includesAny(n, ['불량유형']) // 불량유형 TOP은 legacy/전용 분기

    if (looksLikeProductTop) {
      const wantScrap = includesAny(n, ['폐기', '비용']) || includesAny(n, ['각각'])
      const wantFailCount =
        inferMetricFromText(n) === 'fail' ||
        (includesAny(n, ['많이나온', '많이발생', '부적합수량', '불량수량']) &&
          !includesAny(n, ['부적합률', '부적합율', '불량률', '불량율']))
      const wantFail =
        !wantFailCount &&
        (includesAny(n, ['부적합', '불량률', '불량율', '부적합률', '부적합율', 'worst', '워스트']) ||
          (includesAny(n, ['불량']) && !includesAny(n, ['불량유형'])) ||
          includesAny(n, ['각각']))
      const qtyIsFilterOnly =
        includesAny(n, ['이상']) && includesAny(n, ['검수량', '검사량'])
      const wantQty =
        !qtyIsFilterOnly &&
        (includesAny(n, ['각각']) ||
          (includesAny(n, ['검수량', '검사량']) &&
            includesAny(n, ['top', '상위', '많은', '높은', '리스트', '까지'])))
      const wantPie =
        includesAny(n, ['원그래프', '원형', '파이', '도넛']) ||
        includesAny(n, ['각각'])
      const wantBar =
        includesAny(n, ['막대', 'bar']) ||
        (includesAny(n, ['그래프', '차트']) &&
          !wantPie &&
          !includesAny(n, ['선그래프', '선으로']))

      const metrics: AiMetric[] = []
      if (wantScrap) metrics.push('scrapCost')
      if (wantFail) metrics.push('failRate')
      if (wantFailCount) metrics.push('fail')
      if (wantQty) metrics.push('qty')
      // 지표가 명시되지 않았지만 품번 TOP이면 부적합률 기본
      if (!metrics.length && includesAny(n, ['품번', 'top', '상위', 'worst'])) {
        metrics.push('failRate')
      }

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
        const metricText = metrics.map((m) => metricLabelOf(m)).join('/')

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
          products = applyProductFilters(products, filters)
          for (const metric of metrics) {
            const rows = sortByMetric(products, metric, ascending).slice(0, listN)
            if (grommetOverall && metric === metrics[0] && g.id !== 'all') {
              collectedForTotal.push(...products)
            }
            const label = metricLabelOf(metric)
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
            const rows = sortByMetric(merged, metric, ascending).slice(0, listN)
            const label = metricLabelOf(metric)
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
  metric: AiMetric | 'changeRate',
) {
  if (metric === 'scrapCost') {
    return `${i + 1}. ${p.name}(${p.type}) · ${formatWon(p.scrapCost)} · 부적합률 ${formatPpm(p.failRate)} · ${p.mainDefect}`
  }
  if (metric === 'qty') {
    return `${i + 1}. ${p.name}(${p.type}) · 검수량 ${p.qty.toLocaleString()} · 부적합률 ${formatPpm(p.failRate)}`
  }
  if (metric === 'fail') {
    return `${i + 1}. ${p.name}(${p.type}) · 부적합 ${p.fail.toLocaleString()} · 부적합률 ${formatPpm(p.failRate)} · ${p.mainDefect}`
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
  const teamLabel = n.includes('2공장') || includesAny(n, ['구지', '구지공장'])
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
    (includesAny(n, ['불량유형', '어떤불량', '불량top', '불량종류', '주요불량']) ||
      (includesAny(n, ['불량']) &&
        includesAny(n, ['유형', '종류', '많이발생', '가장많이']))) &&
    !n.includes('품번') &&
    !includesAny(n, ['폐기', '검수량', '검사량', '리스트업'])
  ) {
    const rows = analytics.defectTypes.slice(0, limit)
    return [
      textBlock(`${scope} 기준 불량 유형 TOP ${rows.length}입니다. (${periodNote})`),
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
    if (!rows.length) {
      return [
        textBlock(
          `${scope}에서 해당 품번 데이터가 없습니다. (${periodNote})`,
        ),
      ]
    }
    return [
      textBlock(
        `${scope}에서 폐기비용이 높은 품번 TOP ${rows.length}입니다. (${periodNote})`,
      ),
      {
        type: 'table',
        title: `폐기비용 TOP (${periodNote.replace('기간: ', '')})`,
        headers: PRODUCT_HEADERS,
        rows: productTableRows(rows),
      },
      barFromProducts(
        `폐기비용 TOP 5 (${periodNote.replace('기간: ', '')})`,
        rows,
        'scrapCost',
      ),
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

  const wantsPreviousPeriodChange =
    includesAny(n, ['증가', '이전기간']) ||
    (n.includes('지난달') && includesAny(n, ['대비', '비교', '변화']))
  if (wantsPreviousPeriodChange) {
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

  const metric: AiMetric = includesAny(n, [
    '불량률',
    '불량율',
    '부적합률',
    '부적합율',
  ])
    ? 'failRate'
    : includesAny(n, ['폐기', '비용'])
      ? 'scrapCost'
      : includesAny(n, ['검수량', '검사량']) && !includesAny(n, ['이상'])
        ? 'qty'
        : inferMetricFromText(n) ?? 'failRate'

  const rows = sortByMetric(products, metric, includesAny(n, ['낮은', '적은'])).slice(
    0,
    limit,
  )
  if (!rows.length) {
    return [
      textBlock(`${scope} 조건에 맞는 품번이 없습니다. 제품유형이나 품번을 바꿔 질문해 보세요.`),
    ]
  }
  const metricLabel =
    metric === 'qty'
      ? '검수량이 많은'
      : metric === 'scrapCost'
        ? '폐기비용이 높은'
        : metric === 'fail'
          ? '부적합수량이 많은'
          : '부적합률이 높은'

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
  options: AiAnswerOptions = {},
): AiAnswer {
  const text = q.trim()
  if (!text) return emptyAnswer('질문을 입력하세요.')

  const parts = splitQueryParts(text)
  let ctx: AiConversationContext | null | undefined = priorContext ?? null
  const blocks: AiBlock[] = []

  if (parts.length > 1) {
    blocks.push(textBlock(`질문 ${parts.length}건을 나눠 분석했습니다.`))
  }

  const now = options.now ?? new Date()
  const defaultPeriod = options.defaultPeriod ?? null

  parts.forEach((part, i) => {
    if (parts.length > 1) {
      blocks.push(textBlock(`── Q${i + 1}. ${part} ──`))
    }
    const partBlocks = answerOne(
      part,
      analytics,
      records,
      ctx,
      defaultPeriod,
      now,
    )
    blocks.push(...partBlocks)
    const next = buildContextFromBlocks(part, partBlocks)
    if (next) {
      const partNorm = normalizeQuestionText(part)
      const period =
        parsePeriodFromQuestion(partNorm, records, now) ??
        ctx?.lastPeriod ??
        defaultPeriod ??
        null
      const pn = compact(partNorm)
      const { groups: partGroups } = detectGroups(pn)
      ctx = {
        ...next,
        lastPeriod: period ?? next.lastPeriod,
        lastMetric:
          next.lastMetric ??
          ctx?.lastMetric ??
          inferMetricFromText(pn) ??
          'failRate',
        lastLimit:
          next.lastLimit ??
          parseTopOnlyLimit(partNorm, pn) ??
          (/(?:top|worst|상위)\s*\d+/i.test(partNorm)
            ? topN(partNorm)
            : undefined) ??
          ctx?.lastLimit,
        lastQtyMin: next.lastQtyMin ?? ctx?.lastQtyMin ?? null,
        lastPpmMin: next.lastPpmMin ?? ctx?.lastPpmMin ?? null,
        lastScrapMin: next.lastScrapMin ?? ctx?.lastScrapMin ?? null,
        lastGroups:
          next.lastGroups?.length
            ? next.lastGroups
            : partGroups.length
              ? partGroups.map((g) => ({ id: g.id, label: g.label }))
              : ctx?.lastGroups,
        lastEntity: next.lastEntity ?? ctx?.lastEntity ?? 'product',
        lastAscending: next.lastAscending ?? ctx?.lastAscending ?? false,
      }
    } else if (ctx) {
      // 표가 없어도 직전 질문 메타는 유지 (애매 확인 답변 등)
      ctx = {
        ...ctx,
        lastQuestion: part,
      }
    }
  })

  return {
    blocks,
    context: ctx ?? undefined,
  }
}

/** 질문 → 내부 해석 조건 (회귀 테스트·동일의미 검증용) */
export type AiQuestionIntent = {
  question: string
  normalized: string
  period: AiQueryPeriod | null
  /** thisWeek | lastWeek | thisMonth | lastMonth | recentMonths | custom | null */
  periodKind:
    | 'thisWeek'
    | 'lastWeek'
    | 'thisMonth'
    | 'lastMonth'
    | 'recentMonths'
    | 'custom'
    | null
  groups: { id: string; label: string }[]
  metric: AiMetric | null
  /** 지표 미명시 시 기본값(부적합률) 적용 결과 */
  metricResolved: AiMetric
  sort: 'asc' | 'desc'
  limit: number
  filters: QueryFilters
  chart: AiChartKind
  target:
    | 'product'
    | 'inspector'
    | 'worker'
    | 'equipment'
    | 'mold'
    | 'lot'
    | 'defect'
    | 'group'
    | null
  compare: {
    current: AiQueryPeriod
    previous: AiQueryPeriod
    label: string
  } | null
}

function periodKindOf(period: AiQueryPeriod | null): AiQuestionIntent['periodKind'] {
  if (!period) return null
  const l = period.label
  if (l.includes('이번 주')) return 'thisWeek'
  if (l.includes('지난주')) return 'lastWeek'
  if (l.includes('이번달') || l.includes('이번 달') || /\(이번달\)/.test(l))
    return 'thisMonth'
  if (l.includes('지난달')) return 'lastMonth'
  if (l.startsWith('최근') && l.includes('주')) return 'recentMonths' // 추이 grain은 별도
  if (l.startsWith('최근')) return 'recentMonths'
  return 'custom'
}

function inferTargetEntity(n: string): AiQuestionIntent['target'] {
  if (includesAny(n, ['불량유형', '불량종류'])) return 'defect'
  if (includesAny(n, ['검사자', '검사원'])) return 'inspector'
  if (includesAny(n, ['성형작업자', '성형작업', '작업자'])) return 'worker'
  if (includesAny(n, ['설비'])) return 'equipment'
  if (includesAny(n, ['금형'])) return 'mold'
  if (includesAny(n, ['lot', '롯트', '로트'])) return 'lot'
  if (includesAny(n, ['공장', '그룹']) && includesAny(n, ['비교'])) return 'group'
  if (
    includesAny(n, ['품번', '품목', '제품', '모델', 'worst', '워스트']) ||
    includesAny(n, ['top', '상위'])
  ) {
    return 'product'
  }
  return null
}

/**
 * answerQuestion과 동일한 정규화·파서로 질문 의도를 구조화합니다.
 * 동일 의미 → 동일 내부 조건 검증에 사용합니다.
 */
export function interpretQuestion(
  q: string,
  now = new Date(),
  records: InspectionRecord[] = [],
): AiQuestionIntent {
  const question = q.trim()
  const normalized = normalizeQuestionText(question)
  const n = compact(normalized)
  const period = parsePeriodFromQuestion(normalized, records, now)
  const { groups } = detectGroups(n)
  const metric = inferMetricFromText(n)
  const ascending = wantsAscendingSort(n, normalized)
  const filters = parseQueryFilters(normalized, n)
  const compare = parseComparePeriods(normalized, now)
  const explicitChart = detectChartKind(n, normalized)
  const chart =
    explicitChart ??
    inferDefaultChartKind(n, normalized)

  return {
    question,
    normalized,
    period,
    periodKind: periodKindOf(period),
    groups: groups.map((g) => ({ id: g.id, label: g.label })),
    metric,
    metricResolved: metric ?? 'failRate',
    sort: ascending ? 'asc' : 'desc',
    limit: parseTopOnlyLimit(normalized, n) ?? topN(normalized),
    filters,
    chart,
    target: inferTargetEntity(n),
    compare,
  }
}

export function formatAiValue(v: number, format: AiValueFormat = 'raw') {
  return formatValue(v, format)
}

export function trendMetricFromDaily(t: DailyTrend, key: keyof DailyTrend) {
  return t[key]
}

export { groupLabel, BAR_COLOR, GROUP_COLORS }
