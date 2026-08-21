import type { ReactNode } from 'react'
import { Download } from 'lucide-react'

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
  onDownload,
  extra,
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
  onDownload?: () => void
  extra?: ReactNode
}) {
  return (
    <div className="mb-4 space-y-3">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">검색</p>
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-full border border-line bg-white px-4 py-2 text-sm outline-none focus:border-accent"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">정렬</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => onSortKey(e.target.value)}
            className="rounded-full border border-line bg-white px-3 py-2 text-sm"
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
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}개
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {(extra || onDownload) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <div>{extra}</div>
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
    </div>
  )
}
