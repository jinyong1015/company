import type { InspectionRecord } from '../types'
import { failRatePpm } from '../lib/format'

export const periodPresets = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '최근 7일' },
  { id: 'thisMonth', label: '이번 달' },
  { id: 'lastMonth', label: '지난 달' },
  { id: 'year', label: '올해' },
  { id: 'custom', label: '사용자 지정' },
] as const

type SeedDraft = {
  date: string
  inspector: string
  team: '본사' | '2공장'
  productType: 'SEAL' | '그로멧' | 'GROMMET'
  worker: string
  equipment: string
  product: string
  moldNo: string
  qty: number
  fail: number
  mainDefect: string
  defects: Record<string, number>
  scrapCost: number
  hours: number
  rowClass?: InspectionRecord['rowClass']
  issues?: string[]
}

const INSPECTORS_HQ = ['김서연', '이준호', '정예린', '한도윤', '오하늘']
const INSPECTORS_P2 = ['박민지', '최현우', '윤서준', '배도윤']
const WORKERS = [
  '후인(B)',
  '오성민',
  '유하늘',
  '강태호',
  '신재원',
  '배서준',
  '문지호',
  '조성민',
  '임하늘',
  '권태영',
  '서준호',
  '노지민',
]

const EQUIP_PLANT1 = ['[1공장] PRESS-01', '[1공장] PRESS-02', '[1공장] PRESS-03']
const EQUIP_SEALS = ['성형S-01', '성형S-02', '성형S-03']
const EQUIP_PLANT2 = ['[2공장] INJ-11', '[2공장] INJ-12', '[2공장] PRESS-21']

type ProductMeta = {
  product: string
  moldNo: string
  type: 'SEAL' | '그로멧' | 'GROMMET'
}

const PRODUCTS_SEAL: ProductMeta[] = [
  { product: 'SEAL-A12', moldNo: 'M-1042', type: 'SEAL' },
  { product: 'SEAL-B07', moldNo: 'M-2088', type: 'SEAL' },
  { product: 'SEAL-C03', moldNo: 'M-2091', type: 'SEAL' },
]
const PRODUCTS_GROMMET: ProductMeta[] = [
  { product: 'GROMMET-D03', moldNo: 'M-5099', type: '그로멧' },
  { product: 'GROMMET-E15', moldNo: 'M-5110', type: '그로멧' },
  { product: 'HYD-F09', moldNo: 'M-4021', type: 'GROMMET' },
  { product: 'HYD-G11', moldNo: 'M-4033', type: 'GROMMET' },
]
const PRODUCTS_P2: ProductMeta[] = [
  { product: 'O-RING-C21', moldNo: 'M-3115', type: 'SEAL' },
  { product: 'BUSH-F09', moldNo: 'M-4021', type: 'GROMMET' },
  { product: 'PAD-D03', moldNo: 'M-5099', type: '그로멧' },
  { product: 'COVER-E15', moldNo: 'M-3115', type: '그로멧' },
]

const DEFECT_POOLS: { main: string; parts: Record<string, number> }[] = [
  { main: 'BURR', parts: { BURR: 0.7, '뜯김/찢어짐': 0.2, 이물: 0.1 } },
  { main: '뜯김/찢어짐', parts: { '뜯김/찢어짐': 0.75, 변형: 0.25 } },
  { main: '미성형', parts: { 미성형: 0.65, 이중성형: 0.2, 변형: 0.15 } },
  { main: '이물', parts: { 이물: 0.6, 기포: 0.25, 흠집: 0.15 } },
  { main: '기포', parts: { 기포: 0.7, 이물: 0.3 } },
  { main: '변형', parts: { 변형: 0.6, 흠집: 0.25, 갈라짐: 0.15 } },
]

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function dateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

/** 결정적 의사난수 (시드 데이터가 빌드마다 동일하도록) */
function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, list: T[]): T {
  return list[Math.floor(rand() * list.length)]!
}

function splitDefects(fail: number, parts: Record<string, number>) {
  const keys = Object.keys(parts)
  const out: Record<string, number> = {}
  let remain = fail
  keys.forEach((k, i) => {
    if (i === keys.length - 1) {
      out[k] = Math.max(0, remain)
      return
    }
    const n = Math.max(0, Math.round(fail * (parts[k] ?? 0)))
    out[k] = Math.min(n, remain)
    remain -= out[k]
  })
  return out
}

function buildDrafts(): SeedDraft[] {
  const rand = mulberry32(20260917)
  const drafts: SeedDraft[] = []

  // 8월 하순 ~ 9월 중순 (기본 조회「이번 달」=9월에 데이터가 보이도록)
  const days: string[] = []
  for (let d = 20; d <= 31; d++) days.push(dateStr(2026, 8, d))
  for (let d = 1; d <= 17; d++) days.push(dateStr(2026, 9, d))

  let seq = 0
  for (const date of days) {
    const rowsToday = 3 + Math.floor(rand() * 3) // 3~5건/일
    for (let i = 0; i < rowsToday; i++) {
      seq += 1
      const plantRoll = rand()
      let team: '본사' | '2공장'
      let equipment: string
      let productMeta: ProductMeta
      let inspector: string

      if (plantRoll < 0.42) {
        team = '본사'
        equipment = pick(rand, EQUIP_PLANT1)
        productMeta = pick(rand, [...PRODUCTS_SEAL, ...PRODUCTS_GROMMET])
        inspector = pick(rand, INSPECTORS_HQ)
      } else if (plantRoll < 0.68) {
        team = '본사'
        equipment = pick(rand, EQUIP_SEALS)
        productMeta = pick(rand, PRODUCTS_SEAL)
        inspector = pick(rand, INSPECTORS_HQ)
      } else if (plantRoll < 0.92) {
        team = '2공장'
        equipment = pick(rand, EQUIP_PLANT2)
        productMeta = pick(rand, PRODUCTS_P2)
        inspector = pick(rand, INSPECTORS_P2)
      } else {
        team = '본사'
        equipment = '미지정'
        productMeta = pick(rand, PRODUCTS_SEAL)
        inspector = pick(rand, INSPECTORS_HQ)
      }

      const qty = 600 + Math.floor(rand() * 2200)
      const failRate = 0.004 + rand() * 0.035
      const fail = Math.max(0, Math.round(qty * failRate))
      const pool = pick(rand, DEFECT_POOLS)
      const defects =
        fail > 0 ? splitDefects(fail, pool.parts) : ({} as Record<string, number>)
      const mainDefect =
        fail > 0
          ? Object.entries(defects).sort((a, b) => b[1] - a[1])[0]?.[0] ?? pool.main
          : '-'
      const scrapCost = fail * (80 + Math.floor(rand() * 420))
      const hours = Math.round((1.2 + rand() * 3.2) * 100) / 100

      drafts.push({
        date,
        inspector,
        team,
        productType: productMeta.type,
        worker: pick(rand, WORKERS),
        equipment,
        product: productMeta.product,
        moldNo: productMeta.moldNo,
        qty,
        fail,
        mainDefect,
        defects,
        scrapCost,
        hours,
      })
    }
  }

  // 오류 DATA 메뉴 데모용 1건
  drafts.push({
    date: dateStr(2026, 9, 10),
    inspector: '김서연',
    team: '본사',
    productType: 'SEAL',
    worker: '오성민',
    equipment: '[1공장] PRESS-01',
    product: 'SEAL-ERR',
    moldNo: 'M-0000',
    qty: 100,
    fail: 5,
    mainDefect: 'BURR',
    defects: { BURR: 5 },
    scrapCost: 15000,
    hours: 1,
    rowClass: 'error',
    issues: ['#N/A', '제품 유형 #N/A'],
  })

  return drafts
}

function toRecord(draft: SeedDraft, index: number): InspectionRecord {
  const pass = Math.max(0, draft.qty - draft.fail)
  const minutes = Math.round(draft.hours * 60)
  return {
    id: `seed-${index + 1}`,
    date: draft.date,
    workType: '검사작업',
    inspector: draft.inspector,
    team: draft.team,
    productType: draft.productType,
    lot: `L${draft.date.replace(/-/g, '').slice(2)}-${pad2((index % 30) + 1)}`,
    worker: draft.worker,
    equipment: draft.equipment,
    product: draft.product,
    moldNo: draft.moldNo,
    start: '08:00',
    end: '12:00',
    duration: `${minutes}분`,
    qty: draft.qty,
    pass,
    fail: draft.fail,
    failRate: failRatePpm(draft.fail, draft.qty),
    mainDefect: draft.mainDefect,
    defects: draft.defects,
    scrapCost: draft.scrapCost,
    hours: draft.hours,
    rowClass: draft.rowClass ?? 'ok',
    issues: draft.issues ?? [],
  }
}

/**
 * 초기·「시드 데이터로 복원」 공용 가데이터.
 * 엑셀 업로드 확정 전까지 기본으로 사용되며, 복원 시에도 동일 세트가 다시 적용된다.
 */
export const seedRecords: InspectionRecord[] = buildDrafts().map(toRecord)
