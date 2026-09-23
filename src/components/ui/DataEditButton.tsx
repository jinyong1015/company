import type { ReactNode } from 'react'
import { History, Lock, Pencil } from 'lucide-react'

type EditTone = 'production' | 'error'

export function DataEditButton({
  isAdmin,
  canEdit,
  onEdit,
  onRequestLogin,
  lockedTitle,
  label = '수정',
  size = 'md',
  tone = 'production',
}: {
  isAdmin: boolean
  canEdit: boolean
  onEdit: () => void
  onRequestLogin?: () => void
  lockedTitle: string
  label?: string
  size?: 'sm' | 'md'
  tone?: EditTone
}) {
  if (!isAdmin) {
    return (
      <button
        type="button"
        className={`data-edit-btn data-edit-btn-${size}`}
        data-locked="true"
        data-tone={tone}
        title={lockedTitle}
        onClick={onRequestLogin}
      >
        <span className="data-edit-btn-icon" aria-hidden>
          <Pencil size={size === 'sm' ? 13 : 15} />
          <Lock size={9} className="data-edit-btn-lock" />
        </span>
        <span>{label}</span>
        <span className="data-edit-btn-badge">관리자</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={`data-edit-btn data-edit-btn-${size}`}
      data-tone={tone}
      data-ready={canEdit ? 'true' : 'false'}
      disabled={!canEdit}
      onClick={onEdit}
      title={canEdit ? undefined : '수정할 행을 먼저 선택해 주세요.'}
    >
      <span className="data-edit-btn-icon" aria-hidden>
        <Pencil size={size === 'sm' ? 13 : 15} />
      </span>
      <span>{label}</span>
      {canEdit ? <span className="data-edit-btn-dot" aria-hidden /> : null}
    </button>
  )
}

/** 테이블 작업 열: 행 수정 버튼 */
export function DataRowSelectEdit({
  selected,
  isAdmin,
  tone = 'production',
  onSelect,
  onEdit,
  onRequestLogin,
  lockedTitle,
}: {
  selected: boolean
  isAdmin: boolean
  tone?: EditTone
  onSelect: () => void
  onEdit: () => void
  onRequestLogin?: () => void
  lockedTitle: string
}) {
  return (
    <div className="data-row-select-edit" data-selected={selected ? 'true' : 'false'}>
      <button
        type="button"
        className="data-row-edit-btn"
        data-tone={tone}
        data-locked={isAdmin ? 'false' : 'true'}
        title={isAdmin ? '이 행 수정' : lockedTitle}
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
          if (!isAdmin) {
            onRequestLogin?.()
            return
          }
          onEdit()
        }}
      >
        <Pencil size={13} aria-hidden />
        <span>수정</span>
        {!isAdmin ? <Lock size={10} aria-hidden /> : null}
      </button>
    </div>
  )
}

export function DataHistoryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="data-edit-btn data-edit-btn-md data-edit-btn-ghost"
      onClick={onClick}
    >
      <span className="data-edit-btn-icon" aria-hidden>
        <History size={15} />
      </span>
      <span>변경 이력</span>
    </button>
  )
}

export function DataEditToolbar({
  selectionLabel,
  selectionContent,
  emptyLabel,
  children,
}: {
  selectionLabel?: string | null
  selectionContent?: ReactNode
  emptyLabel: string
  children: ReactNode
}) {
  const hasSelection = Boolean(selectionContent) || Boolean(selectionLabel)

  return (
    <div className="data-edit-toolbar">
      <div className="data-edit-toolbar-info">
        {hasSelection ? (
          <div className="data-edit-toolbar-selected">
            <span className="data-edit-toolbar-chip">선택</span>
            {selectionContent ?? (
              <span className="data-edit-toolbar-label">{selectionLabel}</span>
            )}
          </div>
        ) : (
          <p className="data-edit-toolbar-hint">{emptyLabel}</p>
        )}
      </div>
      <div className="data-edit-toolbar-actions">{children}</div>
    </div>
  )
}
