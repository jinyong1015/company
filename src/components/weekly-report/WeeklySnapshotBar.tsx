import { Camera, History, Trash2, X } from 'lucide-react'
import type { WeeklyReportSnapshotMeta } from '../../lib/weeklyReportSnapshot'
import {
  formatSnapshotPeriodKey,
  formatSnapshotTime,
} from '../../lib/weeklyReportSnapshot'

export function WeeklySnapshotBar({
  isAdmin,
  cloudReady,
  saving,
  loadingList,
  snapshots,
  activeSnapshotId,
  onSave,
  onSelect,
  onClear,
  onDelete,
  onRequestLogin,
}: {
  isAdmin: boolean
  cloudReady: boolean
  saving: boolean
  loadingList: boolean
  snapshots: WeeklyReportSnapshotMeta[]
  activeSnapshotId: string | null
  onSave: () => void
  onSelect: (id: string) => void
  onClear: () => void
  onDelete: (id: string) => void
  onRequestLogin: () => void
}) {
  const active = snapshots.find((s) => s.id === activeSnapshotId) ?? null

  return (
    <div className="rounded-2xl border border-line bg-white px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <History size={15} className="text-accent" aria-hidden />
            주간보고 스냅샷
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {active
              ? `확정본 보는 중 · ${formatSnapshotTime(active.createdAt)}`
              : cloudReady
                ? '선택 월의 확정본을 모두 보거나, 현재 화면을 확정 저장합니다.'
                : '공유 저장소 연결 후 사용할 수 있습니다.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {active ? (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted hover:text-ink"
            >
              <X size={12} aria-hidden />
              실시간으로 돌아가기
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (!isAdmin) {
                onRequestLogin()
                return
              }
              onSave()
            }}
            disabled={!cloudReady || saving || Boolean(active)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            title={
              !isAdmin
                ? '관리자 로그인 후 저장'
                : active
                  ? '스냅샷 보기 중에는 저장할 수 없습니다'
                  : '현재 보고 내용을 확정 저장'
            }
          >
            <Camera size={13} aria-hidden />
            {saving ? '저장 중…' : '현재 보고 확정 저장'}
          </button>
        </div>
      </div>

      <div className="mt-3 border-t border-line/70 pt-3">
        {loadingList ? (
          <p className="text-xs text-muted">스냅샷 목록 불러오는 중…</p>
        ) : snapshots.length === 0 ? (
          <p className="text-xs text-muted">이 월에 저장된 확정본이 없습니다.</p>
        ) : (
          <ul className="space-y-1.5">
            {snapshots.map((item) => {
              const selected = item.id === activeSnapshotId
              return (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs ${
                    selected
                      ? 'bg-accent/10 ring-1 ring-accent/30'
                      : 'bg-canvas/60'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelect(item.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block font-medium text-ink">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-muted">
                      {formatSnapshotPeriodKey(item.periodKey)}
                      {' · '}
                      {formatSnapshotTime(item.createdAt)}
                      {item.note ? ` · ${item.note}` : ''}
                    </span>
                  </button>
                  {isAdmin ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item.id)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
                      title="스냅샷 삭제"
                      aria-label="스냅샷 삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
