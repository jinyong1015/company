import { Link } from 'react-router-dom'
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { formatDateRangeWithWeekday } from '../../lib/format'

export type DetailBackMeta = {
  label: string
  value: string
}

const RANGE_PATTERN =
  /^(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})$/

/** 조회기간 meta는 요일이 잘리지 않도록 날짜+요일로 정규화 */
function displayMetaValue(label: string, value: string) {
  if (label !== '조회기간') return value
  const m = RANGE_PATTERN.exec(value.trim())
  if (!m) return value
  return formatDateRangeWithWeekday(m[1], m[2])
}

/**
 * 품번·검사자·성형작업자 상세 공통 돌아가기 바.
 */
export function DetailBackNav({
  to,
  label,
  ariaLabel,
  Icon,
  metas = [],
}: {
  to: string
  label: string
  ariaLabel: string
  Icon: LucideIcon
  metas?: DetailBackMeta[]
}) {
  const desktopMetas = metas.slice(0, 2)

  return (
    <nav aria-label={ariaLabel} className="sticky top-16 z-10">
      <Link to={to} className="detail-back group">
        <span className="detail-back-back-icon" aria-hidden>
          <ArrowLeft size={18} strokeWidth={2.5} />
        </span>
        <span className="detail-back-type-icon" aria-hidden>
          <Icon size={18} strokeWidth={2.25} />
        </span>

        <span className="min-w-0 shrink">
          <span className="detail-back-kicker">돌아가기</span>
          <span className="detail-back-label">{label}</span>
        </span>

        <span className="detail-back-trailing">
          {desktopMetas.map((meta) => {
            const shown = displayMetaValue(meta.label, meta.value)
            return (
              <span
                key={`${meta.label}:${meta.value}`}
                className="detail-back-meta"
              >
                <span className="detail-back-meta-label">{meta.label}</span>
                <span className="detail-back-meta-value" title={shown}>
                  {shown}
                </span>
              </span>
            )
          })}

          <ChevronRight size={18} className="detail-back-chevron" aria-hidden />
        </span>
      </Link>

      {metas.length > 0 ? (
        <p className="detail-back-mobile-metas">
          {metas.map((meta, idx) => {
            const shown = displayMetaValue(meta.label, meta.value)
            return (
              <span key={`${meta.label}:${meta.value}`}>
                {idx > 0 ? <span className="mx-1.5 opacity-40">·</span> : null}
                <span>
                  {meta.label}{' '}
                  <span className="font-semibold text-ink">{shown}</span>
                </span>
              </span>
            )
          })}
        </p>
      ) : null}
    </nav>
  )
}

export function DetailHero({
  eyebrow,
  title,
  description,
  chips = [],
  actions,
}: {
  eyebrow?: string
  title: string
  description?: string
  chips?: string[]
  actions?: ReactNode
}) {
  return (
    <header className="detail-hero">
      <div className="detail-hero-glow" aria-hidden />
      <div className="detail-hero-inner">
        <div className="min-w-0 flex-1">
          {eyebrow ? <p className="detail-hero-eyebrow">{eyebrow}</p> : null}
          <h1 className="detail-hero-title">{title}</h1>
          {description ? (
            <p className="detail-hero-desc">{description}</p>
          ) : null}
          {chips.length > 0 ? (
            <div className="detail-hero-chips">
              {chips.map((chip) => (
                <span key={chip} className="detail-chip">
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        {actions ? <div className="detail-hero-actions">{actions}</div> : null}
      </div>
    </header>
  )
}

export function DetailKpiStrip({
  items,
}: {
  items: Array<{
    label: string
    value: string
    hint?: string
    tone?: 'default' | 'accent' | 'ok' | 'warn' | 'danger'
    icon?: LucideIcon
  }>
}) {
  return (
    <div className="grid-kpi">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div
            key={item.label}
            className={`detail-kpi detail-kpi-${item.tone ?? 'default'}`}
          >
            <div className="detail-kpi-head">
              <p className="detail-kpi-label">{item.label}</p>
              {Icon ? (
                <span className="detail-kpi-icon" aria-hidden>
                  <Icon size={15} strokeWidth={2.25} />
                </span>
              ) : null}
            </div>
            <p className="detail-kpi-value">{item.value}</p>
            {item.hint ? <p className="detail-kpi-hint">{item.hint}</p> : null}
          </div>
        )
      })}
    </div>
  )
}

import { DEFECT_TYPE_COLORS, defectTypeColor } from '../../lib/defectColors'

function defectChipColor(name: string, fallbackIndex = 0): string {
  if (!name) return defectTypeColor(fallbackIndex)
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return DEFECT_TYPE_COLORS[hash % DEFECT_TYPE_COLORS.length] ?? defectTypeColor(fallbackIndex)
}

/** 불량 요약 문자열 → 유형·건수 뱃지 (예: "BURR 5, 뜯김/찢어짐 3") */
export function DetailDefectChips({ summary }: { summary: string }) {
  const parts = summary
    .split(/[,，、]/)
    .map((s) => s.trim())
    .filter(Boolean)
  if (!parts.length) return <span className="text-muted">—</span>
  return (
    <span className="detail-defect-chips">
      {parts.map((part, index) => {
        const matched = part.match(/^(.*?)(?:\s+(\d[\d,]*))?$/)
        const name = (matched?.[1] ?? part).trim()
        const count = matched?.[2]
        const color = defectChipColor(name, index)
        return (
          <span
            key={`${part}-${index}`}
            className="detail-defect-chip"
            style={{ ['--defect-chip' as string]: color }}
          >
            <span className="detail-defect-chip-name">{name}</span>
            {count ? (
              <span className="detail-defect-chip-count">{count}</span>
            ) : null}
          </span>
        )
      })}
    </span>
  )
}

export function DetailSnapshotBanner({
  status,
  error,
}: {
  status: 'loading' | 'missing' | 'error' | 'ready' | string
  error?: string | null
}) {
  if (status === 'loading') {
    return (
      <div className="detail-banner detail-banner-info" role="status">
        스냅샷 원본 DATA를 불러오는 중…
      </div>
    )
  }
  if (status === 'missing') {
    return (
      <div className="detail-banner detail-banner-warn" role="status">
        이 스냅샷에는 상세용 원본 DATA가 없습니다. 주간보고에서 스냅샷을 다시
        저장해 주세요.
      </div>
    )
  }
  if (status === 'error') {
    return (
      <div className="detail-banner detail-banner-danger" role="alert">
        {error ?? '스냅샷 DATA를 불러오지 못했습니다.'}
      </div>
    )
  }
  if (status === 'ready') {
    return (
      <div className="detail-banner detail-banner-info" role="status">
        스냅샷 확정본 기준 조회 · 현재 업로드 DATA와 무관합니다.
      </div>
    )
  }
  return null
}

export function DetailProductPicker({
  title = '작업 품번 선택',
  description = '카드를 고르면 아래 KPI·차트가 해당 품번 기준으로 바뀝니다.',
  productQuery,
  onQueryChange,
  selectId,
  activeProduct,
  onSelectProduct,
  productOptions,
  visibleProducts,
  totalQty,
  qtyLabel = '검수',
  renderMeta,
}: {
  title?: string
  description?: string
  productQuery: string
  onQueryChange: (value: string) => void
  selectId: string
  activeProduct: string
  onSelectProduct: (value: string) => void
  productOptions: Array<{ product: string; qty: number }>
  visibleProducts: Array<{
    product: string
    qty: number
    failRate?: number
    uph?: number
  }>
  totalQty: number
  qtyLabel?: string
  renderMeta: (product: {
    product: string
    qty: number
    failRate?: number
    uph?: number
  }) => ReactNode
}) {
  const hasSelection = Boolean(activeProduct)

  return (
    <section className="detail-picker">
      <div className="detail-picker-head">
        <div className="min-w-0">
          <h2 className="detail-picker-title">{title}</h2>
          <p className="detail-picker-desc">{description}</p>
        </div>
        <span className="detail-chip detail-chip-accent">
          {hasSelection ? activeProduct : `전체 ${productOptions.length}개`}
        </span>
      </div>

      <div className="detail-picker-body">
        {!productOptions.length ? (
          <p className="text-sm text-muted">해당 기간에 작업한 품번이 없습니다.</p>
        ) : (
          <>
            <div className="detail-picker-controls">
              <label className="detail-field">
                <span>품번 검색</span>
                <input
                  type="search"
                  value={productQuery}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="품번명으로 찾기"
                />
              </label>
              <label className="detail-field">
                <span>빠른 선택</span>
                <select
                  id={selectId}
                  value={activeProduct}
                  onChange={(e) => onSelectProduct(e.target.value)}
                  aria-label="작업 품번 빠른 선택"
                >
                  <option value="">전체 ({productOptions.length})</option>
                  {productOptions.map((p) => (
                    <option key={p.product} value={p.product}>
                      {p.product} · {p.qty.toLocaleString()} EA
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div
              className="grid-dense max-h-[320px] overflow-y-auto pr-1"
              role="radiogroup"
              aria-label="작업 품번 선택"
            >
              <button
                type="button"
                role="radio"
                aria-checked={!hasSelection}
                onClick={() => onSelectProduct('')}
                className={`detail-pick-card ${!hasSelection ? 'is-active' : ''}`}
              >
                <span className="detail-pick-radio" aria-hidden>
                  {!hasSelection ? <span /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="detail-pick-card-top">
                    <span className="detail-pick-name">전체 품번</span>
                    {!hasSelection ? (
                      <span className="detail-pick-badge">선택됨</span>
                    ) : null}
                  </span>
                  <span className="detail-pick-meta">
                    <span>
                      품번{' '}
                      <strong className="num">{productOptions.length}</strong>
                    </span>
                    <span>
                      {qtyLabel}{' '}
                      <strong className="num">{totalQty.toLocaleString()}</strong>
                    </span>
                  </span>
                </span>
              </button>

              {visibleProducts.map((p) => {
                const active = p.product === activeProduct
                return (
                  <button
                    key={p.product}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onSelectProduct(p.product)}
                    className={`detail-pick-card ${active ? 'is-active' : ''}`}
                  >
                    <span className="detail-pick-radio" aria-hidden>
                      {active ? <span /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="detail-pick-card-top">
                        <span className="detail-pick-name" title={p.product}>
                          {p.product}
                        </span>
                        {active ? (
                          <span className="detail-pick-badge">선택됨</span>
                        ) : null}
                      </span>
                      {renderMeta(p)}
                    </span>
                  </button>
                )
              })}
            </div>

            {productQuery.trim() && !visibleProducts.length ? (
              <p className="pt-1 text-center text-sm text-muted">
                「{productQuery.trim()}」에 맞는 품번이 없습니다.
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  )
}
