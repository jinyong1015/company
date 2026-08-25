import * as XLSX from 'xlsx'
import type { InspectionRecord, QualityCheckItem, UploadResult } from '../types'
import { failRatePpm } from './format'

export const KNOWN_DEFECT_TYPES = [
  'BURR',
  '뜯김/찢어짐',
  '미성형',
  '이중성형',
  '이물',
  '변형',
  '기포',
  '갈라짐',
  '미가류',
  '분산',
  '흠집',
  '스코치',
  '형합NG',
  '과가류',
  'Hole NG',
  'HoleNG',
  '기타',
] as const

export const ALLOWED_WORK_TYPES = ['검사작업']

const COLUMN_ALIASES: Record<
  keyof Omit<InspectionRecord, 'id' | 'hours' | 'failRate' | 'defects' | 'rowClass' | 'issues'>,
  string[]
> = {
  date: ['날짜', '일자', '검사일', '검사일자', 'date', 'inspection_date', 'inspectiondate'],
  workType: ['작업구분', '작업 구분', '작업유형', 'work_type', 'worktype'],
  inspector: ['검사원', '검사자', '검사작업자', 'inspector'],
  team: ['소속', '팀', '공장', 'team', 'department'],
  productType: ['제품 유형', '제품유형', '제품타입', 'product_type', 'type'],
  lot: ['성형 lot', '성형lot', 'lot', '로트', '성형로트'],
  worker: ['작업자', '생산자', 'worker', 'operator'],
  equipment: ['설비', '설비명', 'equipment', 'machine'],
  product: [
    '품번',
    '제품',
    '제품명',
    '품명',
    '제품(품번)',
    '품번(제품)',
    'product',
    'product_name',
    'part_no',
    'partno',
  ],
  moldNo: ['금형번호', '금형', '금형 no', 'mold', 'mold_no', 'moldno'],
  start: ['시작', '시작시간', 'start', 'start_time'],
  end: ['종료', '종료시간', 'end', 'end_time'],
  duration: ['소요시간(분)', '소요시간 분', '소요분', '소요시간', '검사시간', '시간', 'duration', 'minutes', '분'],
  qty: ['검수량', '검사수량', '검사량', '수량', 'qty', 'quantity', 'inspection_qty'],
  pass: ['합격 수량', '합격수량', '합격', 'pass', 'ok'],
  fail: ['부적합 수량', '부적합수량', '부적합', '불량', 'fail', 'ng'],
  mainDefect: ['주요 불량', '주요불량', '불량유형', '불량 유형', 'defect', 'main_defect'],
  scrapCost: ['폐기비용', '폐기 비용', '비용', 'scrap', 'scrap_cost', 'cost'],
}

const REQUIRED_FIELDS: (keyof typeof COLUMN_ALIASES)[] = [
  'date',
  'inspector',
  'product',
  'qty',
]

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function compactHeader(value: string): string {
  return normalizeHeader(value).replace(/[\s_\-./]/g, '')
}

/** 날짜/검사일자, 제품(품번)처럼 표기만 다른 헤더를 같은 컬럼으로 본다. */
function headerTokens(value: unknown): string[] {
  const normalized = normalizeHeader(value)
  const compact = compactHeader(normalized)
  const withoutParen = compact.replace(/[()[\]{}]/g, '')
  const tokens = [normalized, compact, withoutParen]

  for (const match of normalized.matchAll(/[([【［]([^)\]】］]+)[)\]】］]/g)) {
    const inner = compactHeader(match[1])
    if (inner) tokens.push(inner)
  }

  const outer = compactHeader(normalized.replace(/[([【［][^)\]】］]*[)\]】］]/g, ''))
  if (outer) tokens.push(outer)

  return [...new Set(tokens.filter(Boolean))]
}

function headerMatches(header: string, alias: string) {
  const headerTokensList = headerTokens(header)
  const aliasTokens = headerTokens(alias)
  return headerTokensList.some((token) => aliasTokens.includes(token))
}

function findHeaderRowIndex(matrix: unknown[][]): number {
  const groups = [
    COLUMN_ALIASES.date,
    COLUMN_ALIASES.inspector,
    COLUMN_ALIASES.qty,
    COLUMN_ALIASES.product,
  ]

  for (let i = 0; i < Math.min(matrix.length, 40); i++) {
    const cells = (matrix[i] ?? []).map((c) => String(c ?? ''))
    const hitCount = groups.filter((aliases) =>
      cells.some((cell) => aliases.some((alias) => headerMatches(cell, alias))),
    ).length
    if (hitCount >= 3) return i
  }

  return -1
}

function buildHeaderMap(headers: string[]) {
  const map: Partial<Record<keyof typeof COLUMN_ALIASES, string>> = {}
  const used = new Set<string>()

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    keyof typeof COLUMN_ALIASES,
    string[],
  ][]) {
    const found = headers.find(
      (h) => !used.has(h) && aliases.some((alias) => headerMatches(h, alias)),
    )
    if (found) {
      map[field] = found
      used.add(found)
    }
  }

  return map
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return null
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const cleaned = String(value).replace(/[,\s원₩]/g, '').replace(/%/g, '')
  if (!cleaned || cleaned === '-') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function excelDateToIso(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear()
    const m = pad2(value.getUTCMonth() + 1)
    const d = pad2(value.getUTCDate())
    return `${y}-${m}-${d}`
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) return ''
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed?.y) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`
    }
  }

  const text = String(value).trim()
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(text)) {
    const [y, m, d] = text.slice(0, 10).split('-')
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}[./]\d{1,2}[./]\d{1,2}/.test(text)) {
    const [y, m, d] = text.slice(0, 10).split(/[./]/)
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  if (/^\d{4}\d{2}\d{2}$/.test(text)) {
    return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`
  }

  const mdy = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/)
  if (mdy) {
    const month = Number(mdy[1])
    const day = Number(mdy[2])
    let year = Number(mdy[3])
    if (year < 100) year += year >= 70 ? 1900 : 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`
    }
  }

  return ''
}

function excelTimeToHm(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''

  if (typeof value === 'number' && Number.isFinite(value)) {
    let fraction = value
    if (value >= 1) fraction = value % 1
    if (fraction < 0) return ''
    const totalMin = Math.round(fraction * 24 * 60) % (24 * 60)
    return `${pad2(Math.floor(totalMin / 60))}:${pad2(totalMin % 60)}`
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${pad2(value.getUTCHours())}:${pad2(value.getUTCMinutes())}`
  }

  const text = String(value).trim()
  const hm = text.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return `${pad2(Number(hm[1]))}:${hm[2]}`
  return text
}

function parseDurationHours(raw: unknown, start: string, end: string): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) {
    if (raw < 1) return Math.round(raw * 24 * 100) / 100
    if (raw <= 24 * 20) return Math.round((raw / 60) * 100) / 100
  }

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const minutes = raw.getUTCHours() * 60 + raw.getUTCMinutes()
    if (minutes > 0) return Math.round((minutes / 60) * 100) / 100
  }

  const text = str(raw)
  if (text) {
    const asNumber = toNumber(text)
    if (asNumber !== null && !/[시h분m:]/i.test(text)) {
      if (asNumber > 0 && asNumber < 1) return Math.round(asNumber * 24 * 100) / 100
      if (asNumber > 24) return Math.round((asNumber / 60) * 100) / 100
      return asNumber
    }

    const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h/i)
    const minMatch = text.match(/(\d+(?:\.\d+)?)\s*m/i)
    const koreanHour = text.match(/(\d+(?:\.\d+)?)\s*시간/)
    const koreanMin = text.match(/(\d+(?:\.\d+)?)\s*분/)
    const hm = text.match(/^(\d{1,2}):(\d{2})$/)

    let hours = 0
    if (hourMatch) hours += Number(hourMatch[1])
    if (minMatch) hours += Number(minMatch[1]) / 60
    if (koreanHour) hours += Number(koreanHour[1])
    if (koreanMin) hours += Number(koreanMin[1]) / 60
    if (hm) hours += Number(hm[1]) + Number(hm[2]) / 60
    if (hours > 0) return Math.round(hours * 100) / 100
  }

  const startMin = timeToMinutes(start)
  const endMin = timeToMinutes(end)
  if (startMin !== null && endMin !== null) {
    let diff = endMin - startMin
    if (diff < 0) diff += 24 * 60
    return Math.round((diff / 60) * 100) / 100
  }

  return 0
}

function timeToMinutes(value: string): number | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const hm = text.match(/^(\d{1,2}):(\d{2})/)
  if (hm) return Number(hm[1]) * 60 + Number(hm[2])
  return null
}

function isPlaceholder(value: string) {
  return !value || value === '-' || value === '0' || value === '없음'
}

function isNaValue(value: unknown) {
  if (value === null || value === undefined) return false
  const text = String(value).trim().toUpperCase()
  return (
    text === '#N/A' ||
    text === '#NA' ||
    text === 'N/A' ||
    text === '#N/A!' ||
    text.includes('#N/A')
  )
}

function cell(row: Record<string, unknown>, header?: string): unknown {
  if (!header) return undefined
  return row[header]
}

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isKnownDefectHeader(header: string) {
  const key = normalizeHeader(header)
  return KNOWN_DEFECT_TYPES.some((d) => normalizeHeader(d) === key)
}

function extractDefects(
  row: Record<string, unknown>,
  headers: string[],
  mappedColumns: Set<string>,
  mainDefect: string,
  failQty: number,
): Record<string, number> {
  const defects: Record<string, number> = {}

  for (const header of headers) {
    if (mappedColumns.has(header)) continue
    if (!isKnownDefectHeader(header)) continue
    const count = toNumber(row[header]) ?? 0
    if (count > 0) {
      const canonical =
        KNOWN_DEFECT_TYPES.find((d) => normalizeHeader(d) === normalizeHeader(header)) ?? header
      const name = canonical === 'HoleNG' ? 'Hole NG' : canonical
      defects[name] = (defects[name] ?? 0) + count
    }
  }

  if (Object.keys(defects).length === 0 && failQty > 0) {
    defects[mainDefect || '기타'] = failQty
  }

  return defects
}

function topDefectName(defects: Record<string, number>, fallback: string) {
  const top = Object.entries(defects).sort((a, b) => b[1] - a[1])[0]
  return top?.[0] || fallback || '기타'
}

export interface ParseExcelResult {
  records: InspectionRecord[]
  uploadResult: UploadResult
}

export async function parseInspectionExcel(file: File): Promise<ParseExcelResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error('엑셀 시트를 찾을 수 없습니다.')
  }

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })

  if (matrix.length === 0) {
    throw new Error('엑셀에 데이터가 없습니다.')
  }

  const headerRowIndex = findHeaderRowIndex(matrix)
  if (headerRowIndex < 0) {
    throw new Error(
      '헤더 행을 찾지 못했습니다. 날짜/검사원/제품(품번)/검수량 컬럼이 있는 행이 필요합니다.',
    )
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
    range: headerRowIndex,
  })

  if (rows.length === 0) {
    throw new Error('엑셀에 데이터가 없습니다.')
  }

  const headers = Object.keys(rows[0] ?? {}).filter((h) => normalizeHeader(h))
  const headerMap = buildHeaderMap(headers)
  const mappedColumns = Object.values(headerMap).filter(Boolean) as string[]
  const mappedSet = new Set(mappedColumns)
  const defectHeaders = headers.filter((h) => !mappedSet.has(h) && isKnownDefectHeader(h))
  const unmappedHeaders = headers.filter(
    (h) => !mappedColumns.includes(h) && !defectHeaders.includes(h),
  )

  const missingRequired = REQUIRED_FIELDS.filter((f) => !headerMap[f])
  if (missingRequired.length > 0) {
    throw new Error(
      `필수 컬럼이 없습니다: ${missingRequired
        .map((f) => COLUMN_ALIASES[f][0])
        .join(', ')} (인식된 헤더: ${headers.slice(0, 12).join(', ')})`,
    )
  }

  const quality = {
    requiredMissing: 0,
    duplicate: 0,
    invalidDate: 0,
    invalidNumber: 0,
    zeroQty: 0,
    invalidWorkType: 0,
    qtyMismatch: 0,
    workTypeInconsistent: 0,
    productTypeMissing: 0,
    equipmentMissing: 0,
    moldMissing: 0,
    lotMissing: 0,
    naValue: 0,
    error: 0,
    missing: 0,
  }

  const seen = new Set<string>()
  const records: InspectionRecord[] = []

  rows.forEach((row, index) => {
    const dateRaw = cell(row, headerMap.date)
    const inspector = str(cell(row, headerMap.inspector))
    const productRaw = str(cell(row, headerMap.product))
    const product = isPlaceholder(productRaw) ? '' : productRaw
    const qty = toNumber(cell(row, headerMap.qty))

    if (!excelDateToIso(dateRaw) && !inspector && !product && (qty === null || qty === 0)) {
      return
    }

    const date = excelDateToIso(dateRaw)
    const pass = toNumber(cell(row, headerMap.pass))
    const fail = toNumber(cell(row, headerMap.fail))
    const scrapCost = Math.round(toNumber(cell(row, headerMap.scrapCost)) ?? 0)
    const workType = str(cell(row, headerMap.workType))
    const team = str(cell(row, headerMap.team))
    const productTypeRaw = str(cell(row, headerMap.productType))
    const productType =
      isPlaceholder(productTypeRaw) || isNaValue(productTypeRaw) ? '' : productTypeRaw
    const lotRaw = str(cell(row, headerMap.lot))
    const lot = isPlaceholder(lotRaw) || isNaValue(lotRaw) ? '' : lotRaw
    const workerRaw = str(cell(row, headerMap.worker))
    const worker = isPlaceholder(workerRaw) || isNaValue(workerRaw) ? '' : workerRaw
    const equipmentRaw = str(cell(row, headerMap.equipment))
    const equipment =
      isPlaceholder(equipmentRaw) || isNaValue(equipmentRaw) ? '' : equipmentRaw
    const moldRaw = str(cell(row, headerMap.moldNo))
    const moldNo = isPlaceholder(moldRaw) || isNaValue(moldRaw) ? '' : moldRaw
    const start = excelTimeToHm(cell(row, headerMap.start))
    const end = excelTimeToHm(cell(row, headerMap.end))
    const durationRaw = cell(row, headerMap.duration)
    let mainDefect = str(cell(row, headerMap.mainDefect))

    const mappedValues = Object.values(headerMap).map((h) => cell(row, h))
    const hasNa = mappedValues.some((v) => isNaValue(v)) ||
      headers.some((h) => isNaValue(row[h]))

    const issues: string[] = []
    let blocking = false
    let warning = false

    if (hasNa) {
      quality.naValue += 1
      issues.push('#N/A')
      // 제품유형 등 어떤 컬럼이든 #N/A면 오류 — 업로드 차단 / 오류 행 제외 대상
      blocking = true
    }

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      quality.invalidDate += 1
      issues.push('잘못된 날짜')
      blocking = true
    }
    if (!inspector || !product || qty === null) {
      quality.requiredMissing += 1
      issues.push('필수값 누락')
      blocking = true
    }
    if (qty === null || (headerMap.pass && pass === null) || (headerMap.fail && fail === null)) {
      quality.invalidNumber += 1
      issues.push('잘못된 숫자')
      blocking = true
    }
    if (qty === 0) {
      quality.zeroQty += 1
      issues.push('검수량 0')
      blocking = true
    }
    if (workType && !ALLOWED_WORK_TYPES.includes(workType)) {
      quality.invalidWorkType += 1
      quality.workTypeInconsistent += 1
      issues.push(`작업구분 오류(${workType})`)
      blocking = true
    }
    if (!workType) {
      quality.workTypeInconsistent += 1
      issues.push('작업구분 누락')
      blocking = true
    }
    if (!productType) {
      quality.productTypeMissing += 1
      issues.push(
        isNaValue(productTypeRaw) ? '제품 유형 #N/A' : '제품 유형 누락',
      )
      // 제품유형 #N/A / 누락은 오류 처리
      blocking = true
    }
    if (!equipment) {
      quality.equipmentMissing += 1
      issues.push('설비 누락')
      warning = true
    }
    if (!moldNo) {
      quality.moldMissing += 1
      issues.push('금형번호 누락')
      warning = true
    }
    if (!lot) {
      quality.lotMissing += 1
      issues.push('LOT 누락')
      warning = true
    }

    const safeQty = qty ?? 0
    const safePass = pass ?? Math.max(safeQty - (fail ?? 0), 0)
    let safeFail = fail ?? Math.max(safeQty - safePass, 0)

    const defects = extractDefects(row, headers, mappedSet, mainDefect || '기타', safeFail)
    const defectSum = Object.values(defects).reduce((a, b) => a + b, 0)
    if (fail === null && defectSum > 0) {
      safeFail = defectSum
    }
    mainDefect = topDefectName(defects, mainDefect || '기타')

    if (pass !== null && fail !== null && pass + fail !== safeQty && safeQty > 0) {
      quality.qtyMismatch += 1
      issues.push('합격+부적합 ≠ 검수량')
      warning = true
    }

    const dupKey = [date, inspector, product, moldNo, lot, start, end, safeQty].join('|')
    if (seen.has(dupKey)) {
      quality.duplicate += 1
      issues.push('중복')
      // 동일 키의 첫 행만 반영, 이후 행은 오류(업로드 차단 / 오류 행 제외 대상)
      blocking = true
    } else {
      seen.add(dupKey)
    }

    let rowClass: InspectionRecord['rowClass'] = 'ok'
    if (blocking) {
      rowClass = 'error'
      quality.error += 1
    } else if (warning) {
      rowClass = 'warn'
      quality.missing += 1
    }

    const hours = parseDurationHours(durationRaw, start, end)
    const failRate = failRatePpm(safeFail, safeQty)

    records.push({
      id: `row-${index + 1}`,
      date: date || '1970-01-01',
      workType: workType || '미지정',
      inspector: inspector || '미지정',
      team: team || '미지정',
      productType: productType || '미지정',
      lot: lot || '-',
      worker: worker || '-',
      equipment: equipment || '미지정',
      product: product || '미지정',
      moldNo: moldNo || '-',
      start,
      end,
      duration: hours ? `${Math.round(hours * 60)}분` : '-',
      qty: safeQty,
      pass: pass !== null ? safePass : Math.max(safeQty - safeFail, 0),
      fail: safeFail,
      failRate,
      mainDefect,
      defects,
      scrapCost,
      hours,
      rowClass,
      issues,
    })
  })

  const qualityChecks: QualityCheckItem[] = [
    { label: '필수값 누락', count: quality.requiredMissing },
    { label: '중복', count: quality.duplicate },
    { label: '잘못된 날짜', count: quality.invalidDate },
    { label: '잘못된 숫자', count: quality.invalidNumber },
    { label: '검수량 0', count: quality.zeroQty },
    { label: '작업구분 오류', count: quality.invalidWorkType },
    { label: '합격+부적합 ≠ 검수량', count: quality.qtyMismatch },
    { label: '#N/A 값', count: quality.naValue },
    { label: '제품 유형 누락/#N/A', count: quality.productTypeMissing },
    { label: '설비 누락', count: quality.equipmentMissing },
    { label: '금형번호 누락', count: quality.moldMissing },
    { label: 'LOT 누락', count: quality.lotMissing },
  ]

  const valid = records.filter((r) => r.rowClass === 'ok').length
  const warn = records.filter((r) => r.rowClass === 'warn').length
  const excluded = records.filter((r) => r.rowClass === 'excluded').length
  const error = records.filter((r) => r.rowClass === 'error').length
  const issueTotal = qualityChecks.reduce((s, c) => s + c.count, 0)
  const score =
    records.length === 0
      ? 0
      : Math.max(0, Math.round((100 - (issueTotal / records.length) * 20) * 10) / 10)

  return {
    records,
    uploadResult: {
      total: records.length,
      valid,
      warn,
      error,
      excluded,
      missing: quality.missing,
      duplicate: quality.duplicate,
      zeroQty: quality.zeroQty,
      requiredMissing: quality.requiredMissing,
      invalidWorkType: quality.invalidWorkType,
      blocked: error > 0,
      score,
      qualityChecks,
      mappedColumns: [...mappedColumns, ...defectHeaders],
      unmappedHeaders,
    },
  }
}

export function createSampleWorkbook(): Blob {
  const rows = [
    {
      날짜: '2026-08-01', 작업구분: '검사작업', 검사원: '김서연', 소속: '본사',
      '제품 유형': 'SEAL', '성형 LOT': 'L260801-01', 작업자: '오성민', 설비: 'PRESS-01',
      품번: 'SEAL-A12', 금형번호: 'M-1042', 시작: '08:10', 종료: '10:05', '소요시간(분)': 115,
      검사량: 1240, 합격수량: 1208, 부적합수량: 32, BURR: 24, '뜯김/찢어짐': 5, 이물: 3, 폐기비용: 128000,
    },
    {
      날짜: '2026-08-02', 작업구분: '검사작업', 검사원: '박민지', 소속: '2공장',
      '제품 유형': 'SEAL', '성형 LOT': 'L260802-02', 작업자: '유하늘', 설비: 'INJ-11',
      품번: 'O-RING-C21', 금형번호: 'M-3115', 시작: '09:00', 종료: '11:20', '소요시간(분)': 140,
      검사량: 1860, 합격수량: 1848, 부적합수량: 12, 이물: 8, 기포: 4, 폐기비용: 42000,
    },
    {
      날짜: '2026-08-03', 작업구분: '검사작업', 검사원: '이준호', 소속: '본사',
      '제품 유형': 'SEAL', '성형 LOT': 'L260803-04', 작업자: '강태호', 설비: 'PRESS-02',
      품번: 'SEAL-B07', 금형번호: 'M-2088', 시작: '13:10', 종료: '15:00', '소요시간(분)': 110,
      검사량: 980, 합격수량: 958, 부적합수량: 22, '뜯김/찢어짐': 18, 변형: 4, 폐기비용: 98000,
    },
    {
      날짜: '2026-08-04', 작업구분: '검사작업', 검사원: '최현우', 소속: '2공장',
      '제품 유형': '유압', '성형 LOT': 'L260804-07', 작업자: '신재원', 설비: 'PRESS-03',
      품번: 'HYD-F09', 금형번호: 'M-4021', 시작: '14:30', 종료: '17:10', '소요시간(분)': 160,
      검사량: 760, 합격수량: 728, 부적합수량: 32, BURR: 28, 미성형: 4, 폐기비용: 186000,
    },
    {
      날짜: '2026-08-05', 작업구분: '검사작업', 검사원: '정예린', 소속: '본사',
      '제품 유형': '그로멧', '성형 LOT': 'L260805-03', 작업자: '배서준', 설비: 'INJ-12',
      품번: 'GROMMET-D03', 금형번호: 'M-5099', 시작: '10:20', 종료: '12:00', '소요시간(분)': 100,
      검사량: 1120, 합격수량: 1102, 부적합수량: 18, 미성형: 12, 변형: 6, 폐기비용: 72000,
    },
    {
      날짜: '2026-08-06', 작업구분: '검사작업', 검사원: '한도윤', 소속: '본사',
      '제품 유형': '유압', '성형 LOT': 'L260806-08', 작업자: '문지호', 설비: 'PRESS-01',
      품번: 'HYD-E15', 금형번호: 'M-3115', 시작: '15:00', 종료: '16:40', '소요시간(분)': 100,
      검사량: 890, 합격수량: 882, 부적합수량: 8, 변형: 5, 흠집: 3, 폐기비용: 36000,
    },
    {
      날짜: '2026-08-07', 작업구분: '검사작업', 검사원: '김서연', 소속: '본사',
      '제품 유형': 'SEAL', '성형 LOT': 'L260807-02', 작업자: '오성민', 설비: 'PRESS-03',
      품번: 'SEAL-A12', 금형번호: 'M-1042', 시작: '08:30', 종료: '12:10', '소요시간(분)': 220,
      검사량: 2140, 합격수량: 2084, 부적합수량: 56, BURR: 40, '뜯김/찢어짐': 10, 이물: 6, 폐기비용: 224000,
    },
    {
      날짜: '2026-08-08', 작업구분: '검사작업', 검사원: '박민지', 소속: '2공장',
      '제품 유형': 'SEAL', '성형 LOT': 'L260808-06', 작업자: '유하늘', 설비: 'INJ-11',
      품번: 'O-RING-C21', 금형번호: 'M-3115', 시작: '13:00', 종료: '14:50', '소요시간(분)': 110,
      검사량: 1540, 합격수량: 1528, 부적합수량: 12, 기포: 7, 이물: 5, 폐기비용: 48000,
    },
    {
      날짜: '2026-08-09', 작업구분: '검사작업', 검사원: '이준호', 소속: '본사',
      '제품 유형': '유압', '성형 LOT': 'L260809-01', 작업자: '오성민', 설비: 'PRESS-02',
      품번: 'HYD-A12', 금형번호: 'M-1042', 시작: '09:00', 종료: '11:30', '소요시간(분)': 150,
      검사량: 1560, 합격수량: 1510, 부적합수량: 50, BURR: 36, '뜯김/찢어짐': 14, 폐기비용: 210000,
    },
    {
      날짜: '2026-08-10', 작업구분: '검사작업', 검사원: '최현우', 소속: '2공장',
      '제품 유형': '그로멧', '성형 LOT': 'L260810-09', 작업자: '신재원', 설비: 'PRESS-03',
      품번: 'GROMMET-F09', 금형번호: 'M-4021', 시작: '10:00', 종료: '13:20', '소요시간(분)': 200,
      검사량: 1320, 합격수량: 1260, 부적합수량: 60, BURR: 48, 미성형: 12, 폐기비용: 280000,
    },
  ]

  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '검사DATA')
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
