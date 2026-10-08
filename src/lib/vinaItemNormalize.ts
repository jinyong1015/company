/**
 * VINA ITEM → 시스템 품번 정규화.
 *
 * 명시적 변환 매핑을 우선 적용한다. 매핑에 없는 ITEM은 임의 분리/추정하지 않고
 * 원본을 유지한다. (품번 변환 확인 경고는 사용하지 않음)
 *
 * 흐름: 원본 ITEM → normalizedItem(display) → itemMatchKey로 기존 품번·사진 매칭
 */

import {
  itemMatchKey,
  matchItemAgainstCatalog,
  type ItemMatchResult,
} from './itemMatchKey'

/** 원본 ITEM(대문자·공백제거 키) → 정규화 품번 */
export const VINA_ITEM_NORMALIZE_MAP: Readonly<Record<string, string>> = {
  YF9820: 'YF 9820',
  NX4N9090: 'NX4 N9090',
  NU615470: 'NU 615470',
  IK9830: 'IK 9830',
  OS4730: 'OS 4730',
  GL3610858: 'GL3 610858',
  NX4N9080: 'NX4 N9080',
  NX4N9030: 'NX4 N9030',
  YD9872: 'YD 9872',
  RG3614836: 'RG3 614836',
  GN7N1060: 'GN7-N1060',
  CM9801: 'CM 9801',
  YG310: 'YG 310',
  NX4N9040: 'NX4 N9040',
  MQ4CP4000A: 'MQ4C P4000A',
  NQ5RP1010: 'NQ5R P1010',
  DN8HRC7000: 'DN8HR C7000',
  SK0001: 'SK 0001',
  MQ4HCP4002B: 'MQ4HC P4002B',
  MVRDO1622: 'MVR-DO1622',
  RG3ECJI100: 'RG3EC JI100',
  NX4RN9070: 'NX4R N9070',
  LM9803: 'LM 9803',
  DN8GL1240: 'DN8G L1240',
  NX4FN9060: 'NX4F N9060',
  SK3K0300: 'SK3 K0300',
  TAMEE2300: 'TAME-E2300',
  JK1AR570: 'JK1-AR570',
  MX5P6410: 'MX5-P6410',
  MVDORBBSB: 'MV-DORBBSB',
  YF6: 'YF 6',
  BH9803: 'BH 9803',
  CN7GAA320B: 'CN7G AA320B',
  MX5FP6620: 'MX5F-P6620',
  HI9820: 'HI 9820',
  CL4GG010: 'CL4-GG010',
  CL4GG020: 'CL4-GG020',
  MX5P6610: 'MX5-P6610',
  SU2RBW020: 'SU2R BW020',
  MQ4P2500: 'MQ4 P2500',
  GR500: 'GR 500',
  MQ4CP2000: 'MQ4C P2000',
  RG3614837: 'RG3 614837',
  OS9810: 'OS 9810',
  JA9130: 'JA 9130',
  JA8400: 'JA 8400',
  YG319: 'YG 319',
  LQ2P8030: 'LQ2-P8030',
  CN7GAA520B: 'CN7G AA520B',
  DH9807: 'DH 9807',
  SX2TBE050: 'SX2T-BE050',
  MQ4PGP4006: 'MQ4PG P4006',
  YN9809: 'YN 9809',
  SVEV020: 'SV-EV020',
  MVFDO1612: 'MVF-DO1612',
  GL3HCN0060B: 'GL3HC N0060B',
  JC9810: 'JC 9810',
  GR773: 'GR 773',
  GN7N1050: 'GN7-N1050',
  'NX4N9080-1': 'NX4 N9080',
  SVEV010: 'SV-EV010',
  PU30: 'PU 30',
  XD580: 'XD 580',
  DEH9830: 'DEH 9830',
  JK1AR070: 'JK1-AR070',
  MQ4CP2500B: 'MQ4C P2500B',
  GN7RN1030: 'GN7R-N1030',
  LX3P9000: 'LX3-P9000',
  UM9802: 'UM 9802',
  MQ4FP2010: 'MQ4F-P2010',
  MQ4FP2020: 'MQ4FP-2020',
  // 추가 매핑
  BL7BC030: 'BL7-BC030',
  DH9808: 'DH 9808',
  GR580: 'GR 580',
  'QXF K2200': 'QXFK2200',
  HR20: 'HR 20',
  HR60: 'HR 60',
  AD329C: 'AD 329C',
  MX5P6510: 'MX5-P6510',
  BR2R1100: 'BR2-R1100',
  NX4G00002: 'NX4G 00002',
  'LG6-2': 'LG 6-2',
  DN8RL1020: 'DN8R L1020',
  SX2BE040: 'SX2-BE040',
  CL4GG050: 'CL4-GG050',
  DN8L1050: 'DN8-L1050',
  JK1PEAR100: 'JK1PE-AR100',
  JK1RAR020: 'JK1R AR020',
  AX1RO6200: 'AX1R O6200',
  JK1AR080: 'JK1-AR080',
  PU70: 'PU 70',
  JA9810: 'JA 9810',
  SP3BS010: 'SP3-BS010',
  GN7FN1010: 'GN7F-N1010',
  BL7BC010: 'BL7-BC010',
  BL7BC020: 'BL7-BC020',
  YB9820: 'YB 9820',
  MQ4EP4800B: 'MQ4E-P4800B',
  NF40: 'NF 40',
  SG2HFAT050: 'SG2HF AT050',
  TD9800: 'TD 9800',
  JX1T6060: 'JX1-T6060',
  OV9820: 'OV 9820',
  KA4R0910: 'KA4 R0910',
  RS4FT4010: 'RS4F T4010',
  NENI010: 'NE-NI010',
  SG2HFAT020: 'SG2HF AT020',
  MQ4P2950: 'MQ4 P2950',
  NEPI010: 'NE-PI010',
  MVDO660: 'MV-DO660',
  NEPI020: 'NE-PI020',
  MEGO040: 'ME-GO040',
  NQ5PW010: 'NQ5-PW010',
  LQ2P8010: 'LQ2-P8010',
  // LQ2P8030 / MQ4FP2010 / MQ4FP2020 은 상단 기존 규칙 유지
  NU615472: 'NU 615472',
  CE1RKL620: 'CE1R KL620',
  MEGO020: 'ME-GO020',
  SU2GBW010: 'SU2G BW010',
  TK1DV030: 'TK1-DV030',
  MEGO030: 'ME-GO030',
  TK1DV010: 'TK1-DV010',
  TK1DV040: 'TK1-DV040',
  PD9830: 'PD 9830',
  NQ5PW020: 'NQ5-PW020',
  LQ2P8020: 'LQ2-P8020',
  GH70: 'GH 70',
  LX2800: 'LX 2800',
  'R600018-GB': 'R600018',
  'R600018-2': 'R600018',
} as const

/** 규칙 개수 — Context에서 규칙 추가 후 재적용 트리거로 사용 */
export const VINA_ITEM_MAP_REVISION = Object.keys(VINA_ITEM_NORMALIZE_MAP).length

/** 엑셀/OCR 잔여 문자 제거 후 조회 키 생성 */
export function sanitizeVinaItemText(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u3000]/g, '') // zero-width · NBSP · 전각 공백
    .replace(/[｀´'']/g, '')
    .trim()
}

/** 조회 키: 대문자 + 공백만 제거(하이픈은 유지 — MV-DORBBSB, NX4N9080-1 구분) */
export function vinaItemLookupKey(raw: string): string {
  return sanitizeVinaItemText(raw).toUpperCase().replace(/\s+/g, '')
}

const SOURCE_LOOKUP = new Map<string, string>()
const TARGET_LOOKUP = new Map<string, string>()
/** 공백·하이픈 무시 매칭 (등록된 변환 규칙 품번) */
const MATCH_LOOKUP = new Map<string, string>()

for (const [from, to] of Object.entries(VINA_ITEM_NORMALIZE_MAP)) {
  SOURCE_LOOKUP.set(vinaItemLookupKey(from), to)
  TARGET_LOOKUP.set(vinaItemLookupKey(to), to)
  MATCH_LOOKUP.set(itemMatchKey(from), to)
  MATCH_LOOKUP.set(itemMatchKey(to), to)
}

export type VinaItemNormalizeResult = {
  /** 엑셀 원본 ITEM (trim) */
  originalItem: string
  /** 화면 표시·저장용 품번 (명시 매핑 결과) */
  normalizedItem: string
  /** displayItem 별칭 (= normalizedItem) */
  displayItem: string
  /** 공백/하이픈 무시 매칭 KEY */
  itemMatchKey: string
  /** 매핑 테이블(또는 이미 정규화된 값)에 해당하면 true */
  mapped: boolean
}

/**
 * VINA ITEM을 정규화한다.
 * - 매핑 히트: 테이블의 정규화 품번 사용
 * - 이미 정규화 형태: 테이블 값으로 통일
 * - 미매핑: 원본 유지(임의 변환 금지), mapped=false
 */
export function normalizeVinaItem(raw: string): VinaItemNormalizeResult {
  const originalItem = sanitizeVinaItemText(raw)
  if (!originalItem) {
    return {
      originalItem: '',
      normalizedItem: '',
      displayItem: '',
      itemMatchKey: '',
      mapped: false,
    }
  }

  const key = vinaItemLookupKey(originalItem)
  const fromSource = SOURCE_LOOKUP.get(key)
  if (fromSource) {
    return {
      originalItem,
      normalizedItem: fromSource,
      displayItem: fromSource,
      itemMatchKey: itemMatchKey(fromSource),
      mapped: true,
    }
  }

  const fromTarget = TARGET_LOOKUP.get(key)
  if (fromTarget) {
    return {
      originalItem,
      normalizedItem: fromTarget,
      displayItem: fromTarget,
      itemMatchKey: itemMatchKey(fromTarget),
      mapped: true,
    }
  }

  // 등록된 변환 규칙과 matchKey가 같으면 매핑된 것으로 본다
  const fromMatch = MATCH_LOOKUP.get(itemMatchKey(originalItem))
  if (fromMatch) {
    return {
      originalItem,
      normalizedItem: fromMatch,
      displayItem: fromMatch,
      itemMatchKey: itemMatchKey(fromMatch),
      mapped: true,
    }
  }

  return {
    originalItem,
    normalizedItem: originalItem,
    displayItem: originalItem,
    itemMatchKey: itemMatchKey(originalItem),
    mapped: false,
  }
}

export { itemMatchKey } from './itemMatchKey'
export type { ItemMatchResult, ItemMatchStatus } from './itemMatchKey'

/**
 * VINA 원본 ITEM → 정규화 → 기존/대상 카탈로그 정확 매칭.
 * 원본값은 변경하지 않으며, 부분일치로 임의 연결하지 않는다.
 */
export function matchVinaItemToCatalog(
  raw: string,
  catalog: Iterable<string>,
): ItemMatchResult & { mapped: boolean } {
  const norm = normalizeVinaItem(raw)
  const match = matchItemAgainstCatalog(
    norm.originalItem || raw,
    catalog,
    norm.normalizedItem,
  )
  return { ...match, mapped: norm.mapped }
}

export const VINA_ITEM_UNMAPPED_ISSUE = '품번 변환 확인 필요'

/** 변환 규칙에 등록된 ITEM인지 (원본·정규화·matchKey 모두) */
export function isRegisteredVinaItem(raw: string): boolean {
  return normalizeVinaItem(raw).mapped
}

type VinaIssueRecord = {
  product: string
  rowClass: 'ok' | 'error' | 'warn' | 'excluded'
  issues: string[]
  extras?: Record<string, string>
}

function isUnmappedIssueLabel(issue: string) {
  return (
    issue === VINA_ITEM_UNMAPPED_ISSUE ||
    issue.replace(/\s+/g, '') === '품번변환확인필요'
  )
}

/**
 * 「품번 변환 확인 필요」 이슈를 제거하고, 변환 규칙이 있으면 정규화 품번으로 맞춘다.
 */
export function reconcileVinaMappedItem<T extends VinaIssueRecord>(
  record: T,
): T {
  const original = sanitizeVinaItemText(
    record.extras?.['원본ITEM'] || record.product || '',
  )
  const productRaw = sanitizeVinaItemText(record.product || '')

  const normOriginal = original ? normalizeVinaItem(original) : null
  const normProduct = productRaw ? normalizeVinaItem(productRaw) : null
  const norm =
    normOriginal?.mapped
      ? normOriginal
      : normProduct?.mapped
        ? normProduct
        : null

  const prevIssues = record.issues ?? []
  const hadUnmapped = prevIssues.some(isUnmappedIssueLabel)
  const issues = prevIssues.filter((i) => !isUnmappedIssueLabel(i))
  const product = norm?.normalizedItem || record.product

  let rowClass = record.rowClass
  if (hadUnmapped && rowClass === 'warn') {
    const warnLeft = issues.some(
      (i) =>
        i === '설비 누락' ||
        i === 'NG수량 > 검사수량' ||
        i === '검사수량 0 (NG 있음)' ||
        i === '합격+NG ≠ 검사수량',
    )
    if (!warnLeft) rowClass = 'ok'
  }

  if (
    !hadUnmapped &&
    product === record.product &&
    issues.length === prevIssues.length
  ) {
    return record
  }

  const extras: Record<string, string> = { ...(record.extras ?? {}) }
  if (original) extras['원본ITEM'] = original
  if (norm?.mapped) extras['정규화ITEM'] = product

  return {
    ...record,
    product,
    issues,
    rowClass,
    extras: Object.keys(extras).length ? extras : record.extras,
  }
}

export function reconcileVinaMappedItems<T extends VinaIssueRecord>(
  records: T[],
): T[] {
  return records.map((r) => reconcileVinaMappedItem(r))
}

type UploadResultLike = {
  valid: number
  warn: number
  error: number
  qualityChecks?: { label: string; count: number; severity?: 'error' | 'warn' }[]
}

/** 업로드 결과에서 「품번 변환 확인 필요」 항목을 제거하고 건수를 records 기준으로 맞춤 */
export function syncVinaUploadResultItemUnmapped<T extends UploadResultLike>(
  result: T | null | undefined,
  records: { rowClass: string; issues?: string[] }[],
): T | null {
  if (!result) return null
  const qualityChecks = (result.qualityChecks ?? []).filter(
    (c) =>
      c.label !== VINA_ITEM_UNMAPPED_ISSUE &&
      c.label.replace(/\s+/g, '') !== '품번변환확인필요',
  )
  return {
    ...result,
    valid: records.filter((r) => r.rowClass === 'ok').length,
    warn: records.filter((r) => r.rowClass === 'warn').length,
    error: records.filter((r) => r.rowClass === 'error').length,
    qualityChecks,
  }
}

export function vinaRecordsNeedItemReconcile<T extends VinaIssueRecord>(
  before: T[],
  after: T[],
): boolean {
  if (before.length !== after.length) return true
  for (let i = 0; i < before.length; i++) {
    const a = before[i]
    const b = after[i]
    if (
      a.product !== b.product ||
      a.rowClass !== b.rowClass ||
      (a.issues ?? []).join('\u0001') !== (b.issues ?? []).join('\u0001')
    ) {
      return true
    }
  }
  return false
}
