import type { ReactNode } from 'react'
import {
  ArrowDownWideNarrow,
  ArrowUpWideNarrow,
  ChevronDown,
  Download,
  Search,
} from 'lucide-react'

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

export function SortSearchBar({
  query,
  onQuery,
  placeholder,
  sortKey,
  sortKeys,
  asc,
  onSortKey,
  onToggleDir,
  pageSize,
  onPageSize,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  onDownload,
  extra,
  variant = 'query',
  title = '조회조건',
  resultTitle = '조회 내역',
  children,
}: {
  query: string
  onQuery: (v: string) => void
  placeholder: string
  sortKey: string
  sortKeys: { id: string; label: string }[]
  asc: boolean
  onSortKey: (id: string) => void
  onToggleDir: () => void
  pageSize?: number
  onPageSize?: (size: number) => void
  pageSizeOptions?: readonly number[]
  onDownload?: () => void
  extra?: ReactNode
  /** query = companysangsan 상세 조회조건 카드 스타일 */
  variant?: 'default' | 'query'
  title?: string
  /** children이 있으면 조회조건+내역을 한 카드로 연결 */
  resultTitle?: string
  children?: ReactNode
}) {
  const sortControls = (
    <>
      <label className="query-filter-inline">
        <span className="query-filter-inline-label">정렬</span>
        <span className="query-filter-select-wrap">
          <select
            value={sortKey}
            onChange={(e) => onSortKey(e.target.value)}
            className="query-filter-input query-filter-select"
            aria-label="정렬 기준"
          >
            {sortKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </select>
          <ChevronDown size={15} className="query-filter-select-chevron" aria-hidden />
        </span>
      </label>
      <button
        type="button"
        onClick={onToggleDir}
        className="query-filter-sort-btn"
        aria-label={asc ? '오름차순으로 전환' : '내림차순으로 전환'}
        title={asc ? '클릭하여 내림차순' : '클릭하여 오름차순'}
      >
        {asc ? <ArrowUpWideNarrow size={15} aria-hidden /> : <ArrowDownWideNarrow size={15} aria-hidden />}
        <span>{asc ? '오름차순' : '내림차순'}</span>
      </button>
      {pageSize != null && onPageSize ? (
        <label className="query-filter-inline">
          <span className="query-filter-inline-label">표시</span>
          <span className="query-filter-select-wrap">
            <select
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
              className="query-filter-input query-filter-select query-filter-select-sm"
              aria-label="페이지당 표시 개수"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}개
                </option>
              ))}
            </select>
            <ChevronDown size={15} className="query-filter-select-chevron" aria-hidden />
          </span>
        </label>
      ) : null}
    </>
  )

  const toolbar = (
    <div className="query-filter-toolbar-row">
      <label className="query-filter-search-wrap">
        <span className="settings-sr-only">검색</span>
        <Search size={16} className="query-filter-search-icon" aria-hidden />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="query-filter-input query-filter-search-input"
          aria-label="검색"
        />
      </label>
      <div className="query-filter-toolbar-controls">{sortControls}</div>
    </div>
  )

  if (variant === 'query') {
    const linked = children != null
    return (
      <section
        className={`query-filter query-filter-toolbar${linked ? ' query-result-shell' : ''}`}
      >
        <div className="query-filter-header">
          <div className="query-filter-title-row">
            <h2 className="query-filter-title">{title}</h2>
            {extra ? <div className="query-filter-extra">{extra}</div> : null}
          </div>
          <div className="query-filter-actions">
            {onDownload ? (
              <button type="button" className="query-filter-action" onClick={onDownload}>
                <Download size={14} aria-hidden />
                Excel 다운로드
              </button>
            ) : null}
          </div>
        </div>
        <div className="query-filter-body">{toolbar}</div>
        {linked ? (
          <div className="query-result-panel">
            <div className="query-result-panel-head">
              <h3 className="query-result-panel-title">{resultTitle}</h3>
            </div>
            <div className="query-result-panel-body">{children}</div>
          </div>
        ) : null}
      </section>
    )
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-muted">검색</p>
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-accent"
          />
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-muted">정렬</p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sortKey}
              onChange={(e) => onSortKey(e.target.value)}
              className="min-w-0 flex-1 rounded-full border border-line bg-white px-3 py-2 text-sm sm:flex-none"
            >
              {sortKeys.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={onToggleDir}
              className="rounded-full border border-line px-3 py-2 text-sm hover:bg-canvas"
            >
              {asc ? '↑ 오름차순' : '↓ 내림차순'}
            </button>
            {pageSize != null && onPageSize && (
              <select
                value={pageSize}
                onChange={(e) => onPageSize(Number(e.target.value))}
                className="rounded-full border border-line bg-white px-3 py-2 text-sm"
                aria-label="페이지당 표시 개수"
              >
                {pageSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}개
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {(extra || onDownload) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div className="min-w-0">{extra}</div>
          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-2 text-sm hover:bg-canvas"
            >
              <Download size={14} />
              Excel 다운로드
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  )
}
