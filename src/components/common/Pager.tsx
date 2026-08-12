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
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm">
      <p className="text-muted">
        전체 {total.toLocaleString()}건 · {page} / {totalPages} 페이지
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
        >
          이전
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          className="rounded-full border border-line px-3 py-1.5 disabled:opacity-40"
        >
          다음
        </button>
      </div>
    </div>
  )
}
