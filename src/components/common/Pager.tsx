function pageItems(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }

  // 앞쪽(1~3): 1 2 3 4 5 … last
  if (current <= 3) {
    const items: (number | 'ellipsis')[] = [1, 2, 3, 4, 5]
    if (total > 5) {
      if (total > 6) items.push('ellipsis')
      items.push(total)
    }
    return items
  }

  // 뒤쪽: 1 … (last-4) … last
  if (current >= total - 2) {
    const items: (number | 'ellipsis')[] = [1, 'ellipsis']
    for (let p = total - 4; p <= total; p += 1) items.push(p)
    return items
  }

  // 중간: 1 … (current-1) current (current+1) … last
  return [1, 'ellipsis', current - 1, current, current + 1, 'ellipsis', total]
}

export function Pager({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  onPage: (p: number) => void
}) {
  const items = pageItems(page, totalPages)

  return (
    <div className="mt-4 space-y-3 text-sm">
      <p className="text-center text-muted">전체 {total.toLocaleString()}건</p>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {items.map((item, idx) =>
          item === 'ellipsis' ? (
            <span key={`e-${idx}`} className="px-1.5 text-muted">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPage(item)}
              aria-current={item === page ? 'page' : undefined}
              className={`min-w-9 rounded-full border px-3 py-1.5 ${
                item === page
                  ? 'border-ink bg-ink text-white'
                  : 'border-line bg-white hover:bg-canvas'
              }`}
            >
              {item}
            </button>
          ),
        )}
      </div>
    </div>
  )
}
