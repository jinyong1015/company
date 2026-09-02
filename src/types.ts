export type Status = '정상' | '주의' | '위험'

export interface KpiItem {
  id: string
  label: string
  value: string
  delta: string
  deltaLabel: string
  tone: 'up-bad' | 'up-good' | 'down-bad' | 'down-good' | 'neutral'
}

export interface DailyTrend {
  date: string
  inspectionCount: number
  qty: number
  pass: number
  fail: number
  failRate: number
  hours: number
  uph: number
  scrapCost: number
}

export interface GroupTrendSeries {
  id: string
  label: string
  trends: DailyTrend[]
}

export interface DefectType {
  name: string
  count: number
  share: number
  delta?: string
  tone?: 'up-bad' | 'down-good' | 'neutral'
}

export interface ProductBreakdown {
  product: string
  qty: number
  fail: number
  failRate: number
  scrapCost: number
  hours: number
  minutes: number
  uph: number
  mainDefect: string
}

export interface InspectorRow {
  id: string
  name: string
  team: string
  count: number
  qty: number
  pass: number
  fail: number
  failRate: number
  hours: number
  minutes: number
  uph: number
  scrapCost: number
  products: ProductBreakdown[]
}

export interface ProductRow {
  id: string
  name: string
  type: string
  qty: number
  pass: number
  fail: number
  /** 불량 유형별 건수 합계 */
  failTotal: number
  failRate: number
  hours: number
  /** 소요시간(분) */
  minutes: number
  uph: number
  mainDefect: string
  /** 불량 유형별 상세 */
  defects: DefectType[]
  /** 화면 표시용 요약 (예: BURR 32, 이물 4) */
  defectSummary: string
  scrapCost: number
  status: Status
  changeRate: number
}

export interface WorkerProductUph {
  id: string
  worker: string
  product: string
  productType: string
  count: number
  qty: number
  pass: number
  fail: number
  failRate: number
  minutes: number
  hours: number
  uph: number
  scrapCost: number
  mainDefect: string
  defects: DefectType[]
  defectSummary: string
}

/** 검사자 × 품번 UPH */
export interface InspectorProductUph {
  id: string
  inspector: string
  team: string
  product: string
  productType: string
  count: number
  qty: number
  pass: number
  fail: number
  failRate: number
  minutes: number
  hours: number
  uph: number
  scrapCost: number
  mainDefect: string
  defects: DefectType[]
  defectSummary: string
}

export interface WorkerRow {
  id: string
  name: string
  count: number
  qty: number
  pass: number
  fail: number
  failRate: number
  minutes: number
  hours: number
  uph: number
  scrapCost: number
  productCount: number
  products: WorkerProductUph[]
}

export interface MoldRow {
  id: string
  moldNo: string
  product: string
  qty: number
  fail: number
  failRate: number
  mainDefect: string
  hours: number
  minutes: number
  scrapCost: number
  recentChange: string
  changeRate: number
  status: Status
}

export interface EquipmentRow {
  id: string
  name: string
  qty: number
  fail: number
  hours: number
  minutes: number
  uph: number
  failRate: number
  mainDefect: string
  scrapCost: number
  status: Status
  changeRate: number
  products: ProductBreakdown[]
}

export interface AnomalyItem {
  id: string
  category: string
  title: string
  severity: 'high' | 'medium' | 'low'
  occurredAt: string
  scope: string
  current: string
  average: string
  change: string
  products: string
  molds: string
  equipment: string
  mainDefect: string
}

export interface InspectionRecord {
  id: string
  date: string
  workType: string
  inspector: string
  team: string
  productType: string
  lot: string
  worker: string
  equipment: string
  product: string
  moldNo: string
  start: string
  end: string
  duration: string
  qty: number
  pass: number
  fail: number
  failRate: number
  mainDefect: string
  /** 불량 유형별 발생 수량 */
  defects: Record<string, number>
  scrapCost: number
  hours: number
  rowClass: 'ok' | 'error' | 'warn' | 'excluded'
  issues: string[]
}

export interface InsightItem {
  id: string
  tone: 'warn' | 'good' | 'danger'
  title: string
  body: string[]
  action?: string
  to?: string
}

export interface CostPoint {
  name: string
  value: number
}

export interface QualityCheckItem {
  label: string
  count: number
}

export interface UploadResult {
  total: number
  valid: number
  warn: number
  error: number
  excluded: number
  missing: number
  duplicate: number
  zeroQty: number
  requiredMissing: number
  invalidWorkType: number
  blocked: boolean
  score: number
  qualityChecks: QualityCheckItem[]
  mappedColumns: string[]
  unmappedHeaders: string[]
}

export interface GroupSummary {
  id: string
  label: string
  qty: number
  fail: number
  failRate: number
  scrapCost: number
}

export interface FilterOptions {
  teams: string[]
  inspectors: string[]
  workTypes: string[]
  productTypes: string[]
  products: string[]
  molds: string[]
  equipment: string[]
  workers: string[]
  lots: string[]
}

export type WeeklyReportMetric = 'qty' | 'fail' | 'failRate' | 'scrapCost'

export type WeeklyReportOrgId = 'seal' | 'hydraulic' | 'plant2'

export interface MonthlyOrgMetric {
  monthKey: string
  monthLabel: string
  seal: number
  hydraulic: number
  plant2: number
  total: number
}

export interface WeekPeriod {
  year: number
  month: number
  weekOfMonth: number
  label: string
  startDate: string
  endDate: string
  hasData: boolean
}

export interface OrgWeeklyStats {
  qty: number
  fail: number
  failRate: number
  scrapCost: number
}

export interface WeeklyProductionRow {
  periodKey: string
  periodLabel: string
  isCurrent: boolean
  columns: {
    hydraulic: OrgWeeklyStats
    seal: OrgWeeklyStats
    plant2: OrgWeeklyStats
    total: OrgWeeklyStats
  }
}

export interface WorstProductItem {
  rank: number
  product: string
  qty: number
  fail: number
  failRate: number
  failRatePercent: number
  mainDefect: string
}

export interface WeeklyIssue {
  id: string
  source: 'auto' | 'manual'
  order: number
  product?: string
  failRatePercent?: number
  title: string
  bullets: string[]
}

export interface WeeklyReportDetail {
  period: WeekPeriod
  title: string
  productionRows: WeeklyProductionRow[]
  issues: WeeklyIssue[]
  worst5: Record<WeeklyReportOrgId, WorstProductItem[]>
  worst5Thresholds: Record<WeeklyReportOrgId, number>
}

export interface WeeklyReportMonthlyView {
  metric: WeeklyReportMetric
  months: MonthlyOrgMetric[]
  tableRows: {
    id: WeeklyReportOrgId | 'total'
    label: string
    values: Record<string, number>
  }[]
  range: { from: string; to: string }
}

export interface Analytics {
  kpis: KpiItem[]
  dailyTrends: DailyTrend[]
  /** 품질 추이 집계 단위 */
  trendGrain: 'day' | 'month'
  /** 전체 선택 시 하위 3개 그룹별 추이 */
  groupTrends: GroupTrendSeries[]
  defectTypes: DefectType[]
  inspectors: InspectorRow[]
  products: ProductRow[]
  workers: WorkerRow[]
  workerProductUph: WorkerProductUph[]
  inspectorProductUph: InspectorProductUph[]
  molds: MoldRow[]
  equipment: EquipmentRow[]
  costByPeriod: CostPoint[]
  costByProduct: CostPoint[]
  costByMold: CostPoint[]
  costByDefect: CostPoint[]
  anomalies: AnomalyItem[]
  insights: InsightItem[]
  groupSummaries: GroupSummary[]
  filterOptions: FilterOptions
  summary: {
    recordCount: number
    totalQty: number
    totalFail: number
    failRate: number
    totalCost: number
    excludedCount: number
  }
}
