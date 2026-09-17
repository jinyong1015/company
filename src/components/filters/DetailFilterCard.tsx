import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useData } from '../../context/DataContext'
import {
  useFilters,
  type MultiKey,
} from '../../context/FilterContext'
import { useToast } from '../../context/ToastContext'

/** 메뉴별·상세 조회조건 공통 카드 셸 */
export function QueryFilterShell({
  title,
  activeCount = 0,
  collapsible = false,
  defaultCollapsed = false,
  onReset,
  summary,
  children,
}: {
  title: string
  activeCount?: number
  collapsible?: boolean
  defaultCollapsed?: boolean
  onReset?: () => void
  summary?: string[]
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const bodyId = useId()

  useEffect(() => {
    if (!collapsible || defaultCollapsed) return
    if (window.matchMedia('(max-width: 767px)').matches) {
      setCollapsed(true)
    }
  }, [collapsible, defaultCollapsed])

  return (
    <section className="query-filter">
      <div className="query-filter-header">
        <div className="query-filter-title-row">
          <h2 className="query-filter-title">{title}</h2>
          {activeCount > 0 ? (
            <span className="query-filter-badge" aria-label={`적용 중 ${activeCount}개`}>
              {activeCount}
            </span>
          ) : null}
        </div>
        <div className="query-filter-actions">
          {onReset ? (
            <button
              type="button"
              className="query-filter-action"
              data-tone="reset"
              onClick={onReset}
            >
              <RotateCcw size={14} aria-hidden />
              초기화
            </button>
          ) : null}
          {collapsible ? (
            <button
              type="button"
              className="query-filter-action"
              aria-expanded={!collapsed}
              aria-controls={bodyId}
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? '펼치기' : '접기'}
              <ChevronDown
                size={15}
                aria-hidden
                style={{
                  transform: collapsed ? undefined : 'rotate(180deg)',
                  transition: 'transform 160ms ease',
                }}
              />
            </button>
          ) : null}
        </div>
      </div>

      {collapsible && collapsed && summary && summary.length > 0 ? (
        <div className="query-filter-summary" aria-live="polite">
          {summary.map((s) => (
            <span key={s} className="query-filter-summary-chip">
              {s}
            </span>
          ))}
        </div>
      ) : null}

      <div
        id={bodyId}
        className="query-filter-body"
        data-collapsed={collapsible && collapsed ? 'true' : 'false'}
      >
        {children}
      </div>
    </section>
  )
}

function MultiSelect({
  label,
  options,
  values,
  onChange,
}: {
  label: string
  options: Array<{ id: string; label: string }>
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listId = useId()

  const filtered = useMemo(
    () => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())),
    [options, q],
  )

  const selectedLabels = useMemo(() => {
    const map = new Map(options.map((o) => [o.id, o.label]))
    return values.map((id) => map.get(id)).filter(Boolean) as string[]
  }, [options, values])

  const triggerText =
    values.length === 0
      ? `전체 ${label}`
      : values.length === 1
        ? (selectedLabels[0] ?? '1개 선택')
        : values.length <= 2
          ? selectedLabels.join(', ')
          : `${selectedLabels[0]} 외 ${values.length - 1}개`

  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => searchRef.current?.focus(), 0)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(t)
    }
  }, [open])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  return (
    <div className="query-filter-field query-filter-ms" ref={rootRef}>
      <p className="query-filter-label">{label}</p>
      <button
        type="button"
        className="query-filter-ms-trigger"
        data-open={open}
        data-active={values.length > 0}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="query-filter-ms-value" data-muted={values.length === 0}>
          {triggerText}
        </span>
        <ChevronDown size={16} className="query-filter-ms-chevron" aria-hidden />
      </button>
      {open ? (
        <div className="query-filter-ms-panel" id={listId} role="listbox">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${label} 검색`}
            className="query-filter-ms-search"
            aria-label={`${label} 검색`}
          />
          <div className="query-filter-ms-toolbar">
            <span>
              {values.length > 0
                ? `${values.length}개 선택`
                : `${filtered.length}개 항목`}
            </span>
            <div className="flex gap-2">
              {filtered.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const ids = new Set(values)
                    filtered.forEach((o) => ids.add(o.id))
                    onChange([...ids])
                  }}
                >
                  모두 선택
                </button>
              ) : null}
              {values.length > 0 ? (
                <button type="button" onClick={() => onChange([])}>
                  선택 해제
                </button>
              ) : null}
            </div>
          </div>
          <div className="query-filter-ms-list">
            {filtered.length === 0 ? (
              <p className="query-filter-ms-empty">검색 결과가 없습니다.</p>
            ) : (
              filtered.map((opt) => {
                const checked = values.includes(opt.id)
                return (
                  <label key={opt.id} className="query-filter-ms-option">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        if (checked) onChange(values.filter((v) => v !== opt.id))
                        else onChange([...values, opt.id])
                      }}
                    />
                    <span className="truncate">{opt.label}</span>
                  </label>
                )
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function toOptions(list: string[]) {
  return list.filter(Boolean).map((v) => ({ id: v, label: v }))
}

export function DetailFilterCard({
  showTeams = true,
  showInspectors = true,
  showWorkTypes = true,
  showProductTypes = true,
  showProducts = true,
  showMolds = true,
  showEquipment = true,
  showWorkers = false,
  showLots = false,
}: {
  showTeams?: boolean
  showInspectors?: boolean
  showWorkTypes?: boolean
  showProductTypes?: boolean
  showProducts?: boolean
  showMolds?: boolean
  showEquipment?: boolean
  showWorkers?: boolean
  showLots?: boolean
}) {
  const { filters, setMulti, resetDetailFilters } = useFilters()
  const { analytics } = useData()
  const { pushToast } = useToast()
  const opts = analytics.filterOptions

  const chips: Array<{ key: string; label: string; clear: () => void }> = []

  const pushChips = (key: MultiKey, prefix: string, values: string[]) => {
    values.forEach((id) => {
      chips.push({
        key: `${key}-${id}`,
        label: `${prefix} ${id}`,
        clear: () => setMulti(key, values.filter((x) => x !== id)),
      })
    })
  }

  if (showTeams) pushChips('teams', '소속', filters.teams)
  if (showInspectors) pushChips('inspectors', '검사자', filters.inspectors)
  if (showWorkTypes) pushChips('workTypes', '작업구분', filters.workTypes)
  if (showProductTypes) pushChips('productTypes', '제품유형', filters.productTypes)
  if (showProducts) pushChips('products', '품번', filters.products)
  if (showMolds) pushChips('molds', '금형', filters.molds)
  if (showEquipment) pushChips('equipment', '설비', filters.equipment)
  if (showWorkers) pushChips('workers', '작업자', filters.workers)
  if (showLots) pushChips('lots', 'LOT', filters.lots)

  const summary = chips.map((c) => c.label)

  return (
    <QueryFilterShell
      title="상세 조회조건"
      activeCount={chips.length}
      collapsible
      onReset={() => {
        resetDetailFilters()
        pushToast('조회조건을 초기화했습니다.', 'info')
      }}
      summary={summary}
    >
      <div className="query-filter-grid">
        {showTeams ? (
          <MultiSelect
            label="소속"
            options={toOptions(opts.teams)}
            values={filters.teams}
            onChange={(v) => setMulti('teams', v)}
          />
        ) : null}
        {showInspectors ? (
          <MultiSelect
            label="검사자"
            options={toOptions(opts.inspectors)}
            values={filters.inspectors}
            onChange={(v) => setMulti('inspectors', v)}
          />
        ) : null}
        {showWorkTypes ? (
          <MultiSelect
            label="작업구분"
            options={toOptions(opts.workTypes)}
            values={filters.workTypes}
            onChange={(v) => setMulti('workTypes', v)}
          />
        ) : null}
        {showProductTypes ? (
          <MultiSelect
            label="제품유형"
            options={toOptions(opts.productTypes)}
            values={filters.productTypes}
            onChange={(v) => setMulti('productTypes', v)}
          />
        ) : null}
        {showProducts ? (
          <MultiSelect
            label="품번"
            options={toOptions(opts.products)}
            values={filters.products}
            onChange={(v) => setMulti('products', v)}
          />
        ) : null}
        {showMolds ? (
          <MultiSelect
            label="금형번호"
            options={toOptions(opts.molds)}
            values={filters.molds}
            onChange={(v) => setMulti('molds', v)}
          />
        ) : null}
        {showEquipment ? (
          <MultiSelect
            label="설비"
            options={toOptions(opts.equipment)}
            values={filters.equipment}
            onChange={(v) => setMulti('equipment', v)}
          />
        ) : null}
        {showWorkers ? (
          <MultiSelect
            label="성형 작업자"
            options={toOptions(opts.workers)}
            values={filters.workers}
            onChange={(v) => setMulti('workers', v)}
          />
        ) : null}
        {showLots ? (
          <MultiSelect
            label="LOT"
            options={toOptions(opts.lots)}
            values={filters.lots}
            onChange={(v) => setMulti('lots', v)}
          />
        ) : null}
      </div>
      {chips.length > 0 ? (
        <div className="query-filter-chips">
          <span className="query-filter-chips-label">적용 중</span>
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              className="query-filter-chip"
              onClick={c.clear}
              aria-label={`${c.label} 제거`}
            >
              <span className="truncate">{c.label}</span>
              <span className="query-filter-chip-x" aria-hidden>
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </QueryFilterShell>
  )
}
