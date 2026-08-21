import type { InspectionRecord } from '../types'

function d(main: string, fail: number, parts?: Record<string, number>): Record<string, number> {
  if (parts && Object.keys(parts).length) return parts
  return { [main]: fail }
}

/** 초기 데모용 시드 데이터. 엑셀 업로드 시 교체됩니다. */
const rawRecords: Omit<InspectionRecord, 'rowClass' | 'issues'>[] = [
  {
    id: 'r1', date: '2026-08-01', workType: '초물검사', inspector: '김서연', team: '1공장',
    productType: '가스켓', lot: 'L260801-01', worker: '오성민', equipment: 'PRESS-01',
    product: 'GASKET-A12', moldNo: 'M-1042', start: '08:10', end: '10:05', duration: '115분',
    qty: 1240, pass: 1208, fail: 32, failRate: 25806, mainDefect: 'BURR',
    defects: d('BURR', 32, { BURR: 24, '뜯김/찢어짐': 5, 이물: 3 }), scrapCost: 128000, hours: 1.92,
  },
  {
    id: 'r2', date: '2026-08-02', workType: '순회검사', inspector: '박민지', team: '2공장',
    productType: '오링', lot: 'L260802-02', worker: '유하늘', equipment: 'INJ-11',
    product: 'O-RING-C21', moldNo: 'M-3115', start: '09:00', end: '11:20', duration: '140분',
    qty: 1860, pass: 1848, fail: 12, failRate: 6452, mainDefect: '이물',
    defects: d('이물', 12, { 이물: 8, 기포: 4 }), scrapCost: 42000, hours: 2.33,
  },
  {
    id: 'r3', date: '2026-08-03', workType: '초물검사', inspector: '이준호', team: '1공장',
    productType: '실링', lot: 'L260803-04', worker: '강태호', equipment: 'PRESS-02',
    product: 'SEAL-B07', moldNo: 'M-2088', start: '13:10', end: '15:00', duration: '110분',
    qty: 980, pass: 958, fail: 22, failRate: 22449, mainDefect: '뜯김/찢어짐',
    defects: d('뜯김/찢어짐', 22, { '뜯김/찢어짐': 18, 변형: 4 }), scrapCost: 98000, hours: 1.83,
  },
  {
    id: 'r4', date: '2026-08-04', workType: '전수검사', inspector: '최현우', team: '2공장',
    productType: '부시', lot: 'L260804-07', worker: '신재원', equipment: 'PRESS-03',
    product: 'BUSH-F09', moldNo: 'M-4021', start: '14:30', end: '17:10', duration: '160분',
    qty: 760, pass: 728, fail: 32, failRate: 42105, mainDefect: 'BURR',
    defects: d('BURR', 32, { BURR: 28, 미성형: 4 }), scrapCost: 186000, hours: 2.67,
  },
  {
    id: 'r5', date: '2026-08-05', workType: '순회검사', inspector: '정예린', team: '품질팀',
    productType: '패드', lot: 'L260805-03', worker: '배서준', equipment: 'INJ-12',
    product: 'PAD-D03', moldNo: 'M-5099', start: '10:20', end: '12:00', duration: '100분',
    qty: 1120, pass: 1102, fail: 18, failRate: 16071, mainDefect: '미성형',
    defects: d('미성형', 18, { 미성형: 12, 변형: 6 }), scrapCost: 72000, hours: 1.67,
  },
  {
    id: 'r6', date: '2026-08-06', workType: '초물검사', inspector: '한도윤', team: '품질팀',
    productType: '커버', lot: 'L260806-08', worker: '문지호', equipment: 'PRESS-01',
    product: 'COVER-E15', moldNo: 'M-3115', start: '15:00', end: '16:40', duration: '100분',
    qty: 890, pass: 882, fail: 8, failRate: 8989, mainDefect: '변형',
    defects: d('변형', 8, { 변형: 5, 흠집: 3 }), scrapCost: 36000, hours: 1.67,
  },
  {
    id: 'r7', date: '2026-08-07', workType: '전수검사', inspector: '김서연', team: '1공장',
    productType: '가스켓', lot: 'L260807-02', worker: '오성민', equipment: 'PRESS-03',
    product: 'GASKET-A12', moldNo: 'M-1042', start: '08:30', end: '12:10', duration: '220분',
    qty: 2140, pass: 2084, fail: 56, failRate: 26168, mainDefect: 'BURR',
    defects: d('BURR', 56, { BURR: 40, '뜯김/찢어짐': 10, 이물: 6 }), scrapCost: 224000, hours: 3.67,
  },
  {
    id: 'r8', date: '2026-08-08', workType: '순회검사', inspector: '박민지', team: '2공장',
    productType: '오링', lot: 'L260808-06', worker: '유하늘', equipment: 'INJ-11',
    product: 'O-RING-C21', moldNo: 'M-3115', start: '13:00', end: '14:50', duration: '110분',
    qty: 1540, pass: 1528, fail: 12, failRate: 7792, mainDefect: '기포',
    defects: d('기포', 12, { 기포: 7, 이물: 5 }), scrapCost: 48000, hours: 1.83,
  },
  {
    id: 'r9', date: '2026-08-09', workType: '초물검사', inspector: '이준호', team: '1공장',
    productType: '가스켓', lot: 'L260809-01', worker: '오성민', equipment: 'PRESS-02',
    product: 'GASKET-A12', moldNo: 'M-1042', start: '09:00', end: '11:30', duration: '150분',
    qty: 1560, pass: 1510, fail: 50, failRate: 32051, mainDefect: 'BURR',
    defects: d('BURR', 50, { BURR: 36, '뜯김/찢어짐': 14 }), scrapCost: 210000, hours: 2.5,
  },
  {
    id: 'r10', date: '2026-08-10', workType: '전수검사', inspector: '최현우', team: '2공장',
    productType: '부시', lot: 'L260810-09', worker: '신재원', equipment: 'PRESS-03',
    product: 'BUSH-F09', moldNo: 'M-4021', start: '10:00', end: '13:20', duration: '200분',
    qty: 1320, pass: 1260, fail: 60, failRate: 45455, mainDefect: 'BURR',
    defects: d('BURR', 60, { BURR: 48, 미성형: 12 }), scrapCost: 280000, hours: 3.33,
  },
  {
    id: 'r11', date: '2026-08-11', workType: '초물검사', inspector: '김서연', team: '1공장',
    productType: '가스켓', lot: 'L260811-01', worker: '오성민', equipment: 'PRESS-01',
    product: 'GASKET-A12', moldNo: 'M-1042', start: '08:10', end: '10:05', duration: '115분',
    qty: 1240, pass: 1208, fail: 32, failRate: 25806, mainDefect: 'BURR',
    defects: d('BURR', 32, { BURR: 22, '뜯김/찢어짐': 6, 이물: 4 }), scrapCost: 128000, hours: 1.92,
  },
  {
    id: 'r12', date: '2026-08-11', workType: '순회검사', inspector: '박민지', team: '2공장',
    productType: '오링', lot: 'L260811-02', worker: '유하늘', equipment: 'INJ-11',
    product: 'O-RING-C21', moldNo: 'M-3115', start: '09:00', end: '11:20', duration: '140분',
    qty: 1860, pass: 1848, fail: 12, failRate: 6452, mainDefect: '이물',
    defects: d('이물', 12, { 이물: 9, 기포: 3 }), scrapCost: 42000, hours: 2.33,
  },
]

export const seedRecords: InspectionRecord[] = rawRecords.map((r, i) => {
  const productType =
    r.product.includes('SEAL') || r.product.includes('O-RING') || r.productType.includes('실링')
      ? 'SEAL'
      : r.productType.includes('패드') || r.product.includes('COVER')
        ? '그로멧'
        : '유압'
  return {
    ...r,
    workType: '검사작업',
    team: r.team === '2공장' ? '2공장' : '본사',
    productType,
    rowClass: i === 5 ? 'error' : 'ok',
    issues: i === 5 ? ['#N/A', '제품 유형 #N/A'] : [],
  }
})

export const periodPresets = [
  { id: 'today', label: '오늘' },
  { id: '7d', label: '최근 7일' },
  { id: 'thisMonth', label: '이번 달' },
  { id: 'lastMonth', label: '지난 달' },
  { id: 'year', label: '올해' },
  { id: 'custom', label: '사용자 지정' },
] as const
