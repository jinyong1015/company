import { useEffect, type ReactNode } from 'react'
import { Lock } from 'lucide-react'
import { useAdmin } from '../../context/AdminContext'
import { PageHeader } from '../common/PageHeader'

/**
 * 주간업무 보고 · 데이터 업로드 등 — 실무자/관리자만 본문 표시.
 * 미인증 시 메뉴는 유지하고 로그인 유도 화면을 보여 준다.
 */
export function StaffRouteGate({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const { ready, isStaff, openLogin } = useAdmin()

  useEffect(() => {
    if (ready && !isStaff) openLogin('manager')
  }, [ready, isStaff, openLogin])

  if (!ready) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} />
        <p className="text-sm text-muted">권한 확인 중…</p>
      </div>
    )
  }

  if (!isStaff) {
    return (
      <div className="space-y-4">
        <PageHeader title={title} />
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Lock size={18} aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-ink">
                실무자 또는 관리자 로그인이 필요합니다
              </p>
              <p className="text-sm text-muted">
                이 메뉴는 권한이 있는 계정만 이용할 수 있습니다. 로그인 후 다시
                시도해 주세요.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary shrink-0"
              onClick={() => openLogin('manager')}
            >
              로그인
            </button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
