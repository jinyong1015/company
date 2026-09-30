import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export function WeeklyFullscreenOverlay({
  open,
  title,
  description,
  onClose,
  actions,
  centerContent = false,
  children,
}: {
  open: boolean
  title: string
  description?: string
  onClose: () => void
  actions?: ReactNode
  centerContent?: boolean
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex flex-col bg-canvas"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-line bg-white px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-ink sm:text-xl">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-muted">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {actions}
          <button
            type="button"
            className="btn inline-flex items-center gap-1.5"
            onClick={onClose}
            aria-label="전체화면 닫기"
          >
            <X size={16} strokeWidth={2.25} aria-hidden />
            닫기
          </button>
        </div>
      </header>
      <div
        className={
          centerContent
            ? 'flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6'
            : 'min-h-0 flex-1 overflow-auto p-4 sm:p-6'
        }
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}
