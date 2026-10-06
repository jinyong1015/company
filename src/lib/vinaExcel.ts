import * as XLSX from 'xlsx'
import type { InspectionRecord, QualityCheckItem, UploadResult } from '../types'
import { failRatePpm } from './format'
import { normalizeProductType } from './groups'

/**
 * VINA 전용 엑셀 파서 (vn 검사일지 / 일일 검사공정 실적 현황).
 *
 * 컬럼 매핑:
 * - Work Day      → 검사일자
 * - 1차/2차       → 1차만 정상, 2차는 오류
 * - ITEM          → 품번
 * - 종류          → 제품유형
 * - 사원명        → 검사작업자
 * - 설비          → 설비
 * - 설비작업자(NV)→ 성형작업자
 * - 합격수량      → 합격수
 * - NG수량        → 부적합수
 * - 검사시간      → 소요시간(시간)
 * - 검사수량      → 검수량
 * - NG%           → 불량률(참고, 집계는 NG/검수량으로 재계산)
 * - NG금액        → 폐기금액
 * - 검사금액      → 검사금액 (extras)
 * - 단가          → 단가
 * - BURR·뜯김…    → 불량 유형별 수량 (뒤에 숫자 붙은 금액 열은 제외)
 */

const COLUMN_ALIASES = {
  date: ['work day', 'workday', '검사일자', '검사일', '날짜', '일자'],
  passRound: ['1차/2차', '1차2차', '차수'],
  product: ['item', '품번', '제품', '제품명', '품명'],
  productType: ['종류', '제품 유형', '제품유형', '제품타입'],
  inspector: ['사원명', '검사자', '검사원', '검사작업자'],
  equipment: ['설비', '설비명'],
  worker: ['설비작업자(nv)', '설비작업자', '성형작업자', '작업자'],
  pass: ['합격수량', '합격수', '합격'],
  fail: ['ng수량', 'ng 수량', '부적합수량', '부적합수', '부적합'],
  hours: ['검사시간', '소요시간', '소요시간(분)'],
  qty: ['검사수량', '검수량', '검사량'],
  failRateRaw: ['ng%', 'ng %', '불량율', '불량률'],
  unitPrice: ['단가'],
  /** 검사금액은 scrapCost보다 먼저 매핑되도록 aliases에 전용 이름만 사용 */
  inspectCost: ['검사금액', '검사 금액'],
  scrapCost: ['ng금액', 'ng 금액', '폐기금액', '폐기비용'],
  empNo: ['사원번호'],
  shift: ['주/야'],
} as const

type VinaField = keyof typeof COLUMN_ALIASES

const REQUIRED_FIELDS: VinaField[] = [
  'date',
  'product',
  'inspector',
  'qty',
  'productType',
]

/** VINA 불량 유형 헤더 → 정규 이름 (수량 열만, 금액 열 제외) */
const DEFECT_HEADER_ALIASES: Record<string, string> = {
  burr: 'BURR',
  뜯김: '뜯김/찢어짐',
  미성형: '미성형',
  이중성형: '이중성형',
  이물질: '이물',
  이물: '이물',
  변형: '변형',
  기포: '기포',
  갈라짐: '갈라짐',
  금형손상: '금형손상',
  금형오염: '금형오염',
  분산: '분산',
  미가류: '미가류',
  과가류: '과가류',
  세팅불량: '세팅 불량',
  원인불명: '원인불명',
}

/** VINA 레코드 소속 — 기존 분석그룹(본사/2공장)과 절대 매칭되지 않음 */
export const VINA_TEAM = 'VINA'
export const VINA_WORK_TYPE = 'VINA검사'
export const VINA_PRODUCT_TYPE = 'VINA'

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function compactHeader(value: string): string {
  return normalizeHeader(value).replace(/[\s_\-./]/g, '')
}

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
    COLUMN_ALIASES.product,
    COLUMN_ALIASES.qty,
    COLUMN_ALIASES.inspector,
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
  const map: Partial<Record<VinaField, string>> = {}
  const used = new Set<string>()
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES) as [
    VinaField,
    readonly string[],
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

/** Excel serial date → ISO (1899-12-30 기준). SSF 의존 없이 동작 */
function excelSerialToIso(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1) return ''
  const whole = Math.floor(serial)
  const utc = Date.UTC(1899, 11, 30) + whole * 86400000
  const d = new Date(utc)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`
}

function excelDateToIso(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0 && value < 1) return ''
    // SheetJS SSF가 없는 빌드도 있어 serial을 직접 변환
    const fromSsf = XLSX.SSF?.parse_date_code?.(value)
    if (fromSsf?.y) return `${fromSsf.y}-${pad2(fromSsf.m)}-${pad2(fromSsf.d)}`
    return excelSerialToIso(value)
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
  // 숫자 문자열 serial
  const asNum = Number(text)
  if (Number.isFinite(asNum) && asNum > 20000 && asNum < 80000) {
    return excelSerialToIso(asNum)
  }
  return ''
}

function cell(row: Record<string, unknown>, header?: string): unknown {
  if (!header) return undefined
  return row[header]
}

function str(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function isPlaceholder(value: string) {
  return !value || value === '-' || value === '없음'
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

/** VINA 검사시간 = 시간 단위 (0.5, 4.4 …) */
function parseVinaHours(raw: unknown): number {
  const n = toNumber(raw)
  if (n === null || n < 0) return 0
  return Math.round(n * 100) / 100
}

function isFirstPass(value: unknown): boolean {
  const t = str(value).replace(/\s+/g, '')
  if (!t) return false
  if (t === '1' || t === '1차' || t.toLowerCase() === '1st') return true
  return t.includes('1차') && !t.includes('2차')
}

function isSecondPass(value: unknown): boolean {
  const t = str(value).replace(/\s+/g, '')
  if (!t) return false
  if (t === '2' || t === '2차' || t.toLowerCase() === '2nd') return true
  return t.includes('2차')
}

/**
 * 금액 열(BURR 2, 뜯김3 …)은 제외하고 수량 불량 열만 인식.
 * 헤더 compact 결과가 알려진 불량명과 같거나, 숫자 suffix만 붙은 경우는 금액으로 본다.
 */
function resolveDefectHeader(header: string): string | null {
  const compact = compactHeader(header)
  if (!compact) return null
  // 금액 열: 불량명 + 숫자 (예: burr2, 뜯김3, 이중성형5)
  const withDigits = compact.match(/^(.+?)(\d+)$/)
  if (withDigits) {
    const base = withDigits[1]
    if (base in DEFECT_HEADER_ALIASES || Object.values(DEFECT_HEADER_ALIASES).some(
      (name) => compactHeader(name) === base,
    )) {
      return null
    }
  }
  if (compact in DEFECT_HEADER_ALIASES) return DEFECT_HEADER_ALIASES[compact]
  for (const [alias, canonical] of Object.entries(DEFECT_HEADER_ALIASES)) {
    if (compact === compactHeader(canonical) || compact === alias) return canonical
  }
  return null
}

function extractDefects(
  row: Record<string, unknown>,
  headers: string[],
  mappedSet: Set<string>,
  failQty: number,
): { defects: Record<string, number>; mainDefect: string } {
  const defects: Record<string, number> = {}
  for (const header of headers) {
    if (mappedSet.has(header)) continue
    const name = resolveDefectHeader(header)
    if (!name) continue
    const count = toNumber(row[header]) ?? 0
    if (count > 0) defects[name] = (defects[name] ?? 0) + count
  }
  if (Object.keys(defects).length === 0 && failQty > 0) {
    defects['기타'] = failQty
  }
  const top =
    Object.entries(defects).sort((a, b) => b[1] - a[1])[0]?.[0] ??
    (failQty > 0 ? '기타' : '-')
  return { defects, mainDefect: top }
}

export interface ParseVinaExcelResult {
  records: InspectionRecord[]
  uploadResult: UploadResult
}

export async function parseVinaExcel(file: File): Promise<ParseVinaExcelResult> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('엑셀 시트를 찾을 수 없습니다.')

  const sheet = workbook.Sheets[sheetName]
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false,
  })
  if (matrix.length === 0) throw new Error('엑셀에 데이터가 없습니다.')

  const headerRowIndex = findHeaderRowIndex(matrix)
  if (headerRowIndex < 0) {
    throw new Error(
      'VINA 헤더 행을 찾지 못했습니다. Work Day / ITEM / 사원명 / 검사수량 컬럼이 있는 행이 필요합니다.',
    )
  }

  // sheet_to_json(range)는 타이틀 행·병합 셀이 있으면 헤더를 잘못 잡을 수 있어
  // 헤더 행 이후를 직접 객체로 만든다.
  const headerCells = (matrix[headerRowIndex] ?? []).map((c) => String(c ?? ''))

  // 헤더 인덱스 맵 (원본 열 위치 유지). 중복 라벨은 `${label}__${idx}`.
  const headerIndexByName = new Map<string, number>()
  headerCells.forEach((raw, idx) => {
    const label = String(raw ?? '').replace(/[\r\n]+/g, ' ').trim()
    if (!label) return
    const dupBefore = headerCells
      .slice(0, idx)
      .some((prev) => String(prev ?? '').replace(/[\r\n]+/g, ' ').trim() === label)
    const name = dupBefore ? `${label}__${idx}` : label
    if (!headerIndexByName.has(name)) headerIndexByName.set(name, idx)
  })

  const rows: Record<string, unknown>[] = []
  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const line = matrix[r] ?? []
    const obj: Record<string, unknown> = {}
    let any = false
    for (const [name, col] of headerIndexByName) {
      const value = line[col]
      if (value !== null && value !== undefined && value !== '') any = true
      obj[name] = value ?? ''
    }
    if (any) rows.push(obj)
  }

  if (rows.length === 0) throw new Error('엑셀에 데이터가 없습니다.')

  const headerNames = [...headerIndexByName.keys()]
  const headerMap = buildHeaderMap(headerNames)
  const mappedColumns = Object.values(headerMap).filter(Boolean) as string[]
  const mappedSet = new Set(mappedColumns)
  const defectHeaders = headerNames.filter((h) => resolveDefectHeader(h) !== null)
  const unmappedHeaders = headerNames.filter(
    (h) => !mappedSet.has(h) && !defectHeaders.includes(h),
  )

  const missingRequired = REQUIRED_FIELDS.filter((f) => !headerMap[f])
  if (missingRequired.length > 0) {
    throw new Error(
      `VINA 필수 컬럼이 없습니다: ${missingRequired
        .map((f) => COLUMN_ALIASES[f][0])
        .join(', ')} (인식된 헤더: ${headerNames.slice(0, 16).join(', ')})`,
    )
  }

  const quality = {
    requiredMissing: 0,
    duplicate: 0,
    invalidDate: 0,
    invalidNumber: 0,
    zeroQty: 0,
    zeroQtyWithFail: 0,
    failOverQty: 0,
    equipmentMissing: 0,
    secondPass: 0,
    invalidPassRound: 0,
    productTypeMissing: 0,
    naValue: 0,
    qtyMismatch: 0,
    missing: 0,
    error: 0,
  }

  const seen = new Set<string>()
  const records: InspectionRecord[] = []
  const YIELD_EVERY = 2500

  for (let index = 0; index < rows.length; index++) {
    // 대용량 엑셀 파싱 중 UI 스레드 양보
    if (index > 0 && index % YIELD_EVERY === 0) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, 0)
      })
    }

    const row = rows[index]
    const dateRaw = cell(row, headerMap.date)
    const inspector = str(cell(row, headerMap.inspector))
    const productRaw = str(cell(row, headerMap.product))
    const product = isPlaceholder(productRaw) ? '' : productRaw
    const qty = toNumber(cell(row, headerMap.qty))
    const passRoundRaw = cell(row, headerMap.passRound)

    if (
      !excelDateToIso(dateRaw) &&
      !inspector &&
      !product &&
      (qty === null || qty === 0) &&
      !str(passRoundRaw)
    ) {
      continue
    }

    const date = excelDateToIso(dateRaw)
    const pass = toNumber(cell(row, headerMap.pass))
    const fail = toNumber(cell(row, headerMap.fail))
    const unitPrice = toNumber(cell(row, headerMap.unitPrice))
    let inspectCost = Math.round(toNumber(cell(row, headerMap.inspectCost)) ?? 0)
    let scrapCost = Math.round(toNumber(cell(row, headerMap.scrapCost)) ?? 0)
    const equipmentRaw = str(cell(row, headerMap.equipment))
    const equipment =
      isPlaceholder(equipmentRaw) || isNaValue(equipmentRaw) ? '' : equipmentRaw
    const workerRaw = str(cell(row, headerMap.worker))
    const worker =
      isPlaceholder(workerRaw) || isNaValue(workerRaw) ? '' : workerRaw
    const productTypeRaw = str(cell(row, headerMap.productType))
    const productType =
      isPlaceholder(productTypeRaw) || isNaValue(productTypeRaw)
        ? ''
        : normalizeProductType(productTypeRaw) || productTypeRaw
    const hours = parseVinaHours(cell(row, headerMap.hours))
    const empNo = str(cell(row, headerMap.empNo))
    const shift = str(cell(row, headerMap.shift))

    const hasNa = (Object.entries(headerMap) as [VinaField, string | undefined][])
      .filter(([field]) => field !== 'failRateRaw')
      .some(([, h]) => isNaValue(cell(row, h)))

    const issues: string[] = []
    let blocking = false
    let warning = false

    // 1차만 정상 · 2차 및 기타 차수는 오류
    if (isSecondPass(passRoundRaw)) {
      quality.secondPass += 1
      issues.push('2차 데이터(분석 제외)')
      blocking = true
    } else if (headerMap.passRound && !isFirstPass(passRoundRaw)) {
      quality.invalidPassRound += 1
      issues.push('1차/2차 값 오류(1차만 허용)')
      blocking = true
    }

    if (hasNa) {
      quality.naValue += 1
      issues.push('#N/A')
      blocking = true
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      quality.invalidDate += 1
      issues.push('잘못된 날짜')
      blocking = true
    }
    if (!inspector || !product || qty === null) {
      quality.requiredMissing += 1
      issues.push('필수값 누락(Work Day, 사원명, ITEM, 검사수량)')
      blocking = true
    }
    if (!productType) {
      quality.productTypeMissing += 1
      issues.push('제품유형(종류) 누락')
      blocking = true
    }
    if (qty === null) {
      quality.invalidNumber += 1
      if (!issues.includes('잘못된 숫자')) issues.push('잘못된 숫자')
      blocking = true
    }
    if (
      headerMap.fail &&
      str(cell(row, headerMap.fail)) &&
      fail === null
    ) {
      quality.invalidNumber += 1
      if (!issues.includes('잘못된 숫자')) issues.push('잘못된 숫자')
      blocking = true
    }
    if (!equipment) {
      quality.equipmentMissing += 1
      issues.push('설비 누락')
      warning = true
    }

    const safeQty = qty ?? 0
    let safeFail = fail ?? 0
    if (safeFail < 0) {
      quality.invalidNumber += 1
      issues.push('잘못된 숫자')
      blocking = true
      safeFail = 0
    }

    const { defects, mainDefect } = extractDefects(
      row,
      headerNames,
      mappedSet,
      safeFail,
    )
    const defectSum = Object.values(defects).reduce((a, b) => a + b, 0)
    if (fail === null && defectSum > 0) safeFail = defectSum

    if (safeFail > safeQty && safeQty > 0) {
      quality.failOverQty += 1
      issues.push('NG수량 > 검사수량')
      warning = true
    }

    if (safeQty === 0) {
      if (safeFail > 0) {
        quality.zeroQtyWithFail += 1
        issues.push('검사수량 0 (NG 있음)')
        warning = true
      } else {
        quality.zeroQty += 1
        issues.push('검사수량 0')
        blocking = true
      }
    }

    const safePass =
      pass !== null ? pass : Math.max(safeQty - safeFail, 0)
    if (
      pass !== null &&
      fail !== null &&
      pass + fail !== safeQty &&
      safeQty > 0
    ) {
      quality.qtyMismatch += 1
      issues.push('합격+NG ≠ 검사수량')
      warning = true
    }

    if (scrapCost === 0 && unitPrice !== null && safeFail > 0) {
      scrapCost = Math.round(unitPrice * safeFail)
    }
    if (inspectCost === 0 && unitPrice !== null && safeQty > 0) {
      inspectCost = Math.round(unitPrice * safeQty)
    }

    // 동일 세션으로 보이는 완전 동일 키만 중복 처리 (VINA는 같은 날·품번 다건이 정상)
    const dupKey = [
      date,
      inspector,
      product,
      equipment,
      worker,
      hours,
      safeQty,
      safePass,
      safeFail,
      str(passRoundRaw),
    ].join('|')
    if (seen.has(dupKey)) {
      quality.duplicate += 1
      issues.push('중복')
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

    // 대용량 저장·메모리 절약: 필수 extras만 유지 (미매핑 전체 덤프 금지)
    const extras: Record<string, string> = {}
    if (unitPrice !== null) extras['단가'] = String(unitPrice)
    if (inspectCost > 0) extras['검사금액'] = String(inspectCost)
    if (empNo) extras['사원번호'] = empNo
    if (shift) extras['주/야'] = shift
    if (str(passRoundRaw)) extras['1차/2차'] = str(passRoundRaw)
    const ngPct = toNumber(cell(row, headerMap.failRateRaw))
    if (ngPct !== null) extras['NG%'] = String(ngPct)

    records.push({
      id: `vina-row-${index + 1}`,
      date: date || '1970-01-01',
      workType: VINA_WORK_TYPE,
      inspector: inspector || '미지정',
      team: VINA_TEAM,
      productType: productType || VINA_PRODUCT_TYPE,
      lot: '-',
      worker: worker || '-',
      equipment: equipment || '미지정',
      product: product || '미지정',
      moldNo: '-',
      start: '',
      end: '',
      duration: hours ? `${Math.round(hours * 60)}분` : '-',
      qty: safeQty,
      pass: safePass,
      fail: safeFail,
      failRate: failRatePpm(safeFail, safeQty),
      mainDefect: mainDefect === '-' ? '기타' : mainDefect,
      defects,
      scrapCost,
      hours,
      rowClass,
      issues,
      extras: Object.keys(extras).length ? extras : undefined,
    })
  }

  const qualityChecks: QualityCheckItem[] = [
    {
      label: '필수값 누락(Work Day, 사원명, ITEM, 검사수량)',
      count: quality.requiredMissing,
      severity: 'error',
    },
    {
      label: '2차 데이터(분석 제외)',
      count: quality.secondPass,
      severity: 'error',
    },
    {
      label: '1차/2차 값 오류(1차만 허용)',
      count: quality.invalidPassRound,
      severity: 'error',
    },
    { label: '중복', count: quality.duplicate, severity: 'error' },
    { label: '잘못된 날짜', count: quality.invalidDate, severity: 'error' },
    { label: '잘못된 숫자', count: quality.invalidNumber, severity: 'error' },
    { label: '검사수량 0', count: quality.zeroQty, severity: 'error' },
    {
      label: '제품유형(종류) 누락',
      count: quality.productTypeMissing,
      severity: 'error',
    },
    { label: '#N/A 값', count: quality.naValue, severity: 'error' },
    { label: '합격+NG ≠ 검사수량', count: quality.qtyMismatch, severity: 'warn' },
    { label: 'NG수량 > 검사수량', count: quality.failOverQty, severity: 'warn' },
    { label: '검사수량 0 (NG 있음)', count: quality.zeroQtyWithFail, severity: 'warn' },
    { label: '설비 누락', count: quality.equipmentMissing, severity: 'warn' },
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
      zeroQty: quality.zeroQty + quality.zeroQtyWithFail,
      requiredMissing: quality.requiredMissing,
      invalidWorkType: 0,
      blocked: error > 0,
      score,
      qualityChecks,
      mappedColumns: [...mappedColumns, ...defectHeaders],
      unmappedHeaders,
    },
  }
}

export function createVinaSampleWorkbook(): Blob {
  const rows = [
    {
      'Work Day': '2026-08-01',
      '1차/2차': '1차',
      ITEM: 'A-001',
      종류: 'GROMMET',
      사원명: 'VINA김',
      설비: 'B10-1',
      '설비작업자(NV)': 'NV529',
      검사시간: 2.5,
      합격수량: 988,
      NG수량: 12,
      검사수량: 1000,
      'NG%': 0.012,
      BURR: 8,
      뜯김: 4,
      단가: 150,
      검사금액: 150000,
      NG금액: 1800,
    },
    {
      'Work Day': '2026-08-02',
      '1차/2차': '1차',
      ITEM: 'A-001',
      종류: 'SEAL',
      사원명: 'VINA이',
      설비: 'C6-1',
      '설비작업자(NV)': 'NV163',
      검사시간: 1.5,
      합격수량: 795,
      NG수량: 5,
      검사수량: 800,
      'NG%': 0.00625,
      이물질: 5,
      단가: 150,
      검사금액: 120000,
      NG금액: 750,
    },
    {
      'Work Day': '2026-08-03',
      '1차/2차': '2차',
      ITEM: 'B-002',
      종류: 'GROMMET',
      사원명: 'VINA김',
      설비: 'INJ2',
      '설비작업자(NV)': 'NV487',
      검사시간: 1,
      합격수량: 100,
      NG수량: 0,
      검사수량: 100,
      'NG%': 0,
      단가: 200,
      검사금액: 20000,
      NG금액: 0,
    },
  ]
  const sheet = XLSX.utils.json_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '검사작업현황')
  const array = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([array], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}
