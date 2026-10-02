import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { AdminAuthError } from '../lib/admin/errors'

export type SettingsTab = 'display' | 'admin'
export type AdminPanelView = 'status' | 'login'
/** 세션 역할 — 비로그인(user)은 role=null */
export type StaffRole = 'manager' | 'admin'
export type LoginRole = StaffRole

type AdminContextValue = {
  ready: boolean
  /** @deprecated 호환용 — isAdmin과 동일. 실무자는 false */
  isAdmin: boolean
  /** 관리자 로그인 중 */
  role: StaffRole | null
  /** 실무자 또는 관리자 */
  isStaff: boolean
  /** 주간보고·데이터 업로드 접근 */
  canAccessStaffMenus: boolean
  /** 주간 ISSUE·고객사 부적합·승인서류·측정현황·정보공유 작성/수정/삭제 */
  canEditWeeklyContent: boolean
  /** 품번 상세 사진 업로드·변경 */
  canUploadProductPhoto: boolean
  /** 품번 상세 사진 삭제 (관리자만) */
  canDeleteProductPhoto: boolean
  hasUnsavedEdits: boolean
  settingsOpen: boolean
  settingsTab: SettingsTab
  adminPanel: AdminPanelView
  /** 로그인 폼 기본 역할 (주간보고 등에서 실무자 유도) */
  preferredLoginRole: LoginRole
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
  setSettingsTab: (tab: SettingsTab) => void
  setAdminPanel: (view: AdminPanelView) => void
  openLogin: (preferredRole?: LoginRole) => void
  login: (
    password: string,
    role?: LoginRole,
  ) => Promise<{ ok: boolean; message: string; role?: StaffRole }>
  logout: () => Promise<boolean>
  refreshSession: () => Promise<boolean>
  setHasUnsavedEdits: (value: boolean) => void
  markSessionExpired: () => void
}

const AdminContext = createContext<AdminContextValue | null>(null)

function roleLabel(role: StaffRole | null) {
  if (role === 'admin') return '관리자'
  if (role === 'manager') return '실무자'
  return '사용자'
}

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [role, setRole] = useState<StaffRole | null>(null)
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('display')
  const [adminPanel, setAdminPanel] = useState<AdminPanelView>('status')
  const [preferredLoginRole, setPreferredLoginRole] =
    useState<LoginRole>('admin')

  const isAdmin = role === 'admin'
  const isStaff = role === 'manager' || role === 'admin'

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'include' })
      const data = (await res.json()) as {
        authenticated?: boolean
        role?: string | null
      }
      if (data.authenticated && data.role === 'manager') {
        setRole('manager')
        return true
      }
      if (data.authenticated && data.role === 'admin') {
        setRole('admin')
        return true
      }
      // 구버전 세션(role 없음)은 관리자로 취급
      if (data.authenticated) {
        setRole('admin')
        return true
      }
      setRole(null)
      return false
    } catch {
      setRole(null)
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      await refreshSession()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [refreshSession])

  useEffect(() => {
    if (!isStaff) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void refreshSession()
      }
    }
    const timer = window.setInterval(() => {
      void refreshSession()
    }, 5 * 60 * 1000)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [isStaff, refreshSession])

  const openSettings = useCallback((tab: SettingsTab = 'display') => {
    setSettingsTab(tab)
    if (tab === 'admin') setAdminPanel('status')
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setAdminPanel('status')
  }, [])

  const openLogin = useCallback((preferredRole: LoginRole = 'manager') => {
    setPreferredLoginRole(preferredRole)
    setSettingsTab('admin')
    setAdminPanel('login')
    setSettingsOpen(true)
  }, [])

  const login = useCallback(async (password: string, loginRole: LoginRole = 'admin') => {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, role: loginRole }),
      })
      const contentType = res.headers.get('content-type') ?? ''
      if (!contentType.includes('application/json')) {
        return {
          ok: false,
          message:
            '권한 API에 연결할 수 없습니다. Vercel 배포·환경변수를 확인해 주세요.',
        }
      }
      const data = (await res.json()) as {
        ok?: boolean
        message?: string
        role?: string
      }
      if (res.ok && data?.ok) {
        const nextRole: StaffRole =
          data.role === 'manager' ? 'manager' : 'admin'
        setRole(nextRole)
        setAdminPanel('status')
        return {
          ok: true,
          role: nextRole,
          message:
            data.message ??
            `${roleLabel(nextRole)} 모드로 로그인되었습니다.`,
        }
      }
      return {
        ok: false,
        message:
          data?.message ??
          (loginRole === 'manager'
            ? '실무자 비밀번호가 올바르지 않습니다.'
            : '관리자 비밀번호가 올바르지 않습니다.'),
      }
    } catch {
      return {
        ok: false,
        message: '권한 API 요청에 실패했습니다. 네트워크·배포 상태를 확인해 주세요.',
      }
    }
  }, [])

  const logout = useCallback(async () => {
    if (hasUnsavedEdits) {
      const confirmed = window.confirm(
        '저장하지 않은 변경사항이 있습니다. 로그아웃하시겠습니까?',
      )
      if (!confirmed) return false
    }
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
    })
    setRole(null)
    setHasUnsavedEdits(false)
    setAdminPanel('status')
    return true
  }, [hasUnsavedEdits])

  const markSessionExpired = useCallback(() => {
    setRole(null)
    setHasUnsavedEdits(false)
  }, [])

  const value = useMemo(
    () => ({
      ready,
      isAdmin,
      role,
      isStaff,
      canAccessStaffMenus: isStaff,
      canEditWeeklyContent: isStaff,
      canUploadProductPhoto: isStaff,
      canDeleteProductPhoto: isAdmin,
      hasUnsavedEdits,
      settingsOpen,
      settingsTab,
      adminPanel,
      preferredLoginRole,
      openSettings,
      closeSettings,
      setSettingsTab,
      setAdminPanel,
      openLogin,
      login,
      logout,
      refreshSession,
      setHasUnsavedEdits,
      markSessionExpired,
    }),
    [
      ready,
      isAdmin,
      role,
      isStaff,
      hasUnsavedEdits,
      settingsOpen,
      settingsTab,
      adminPanel,
      preferredLoginRole,
      openSettings,
      closeSettings,
      openLogin,
      login,
      logout,
      refreshSession,
      markSessionExpired,
    ],
  )

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
}

export function useAdmin() {
  const ctx = useContext(AdminContext)
  if (!ctx) throw new Error('useAdmin must be used within AdminProvider')
  return ctx
}

export { AdminAuthError }
