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

type AdminContextValue = {
  ready: boolean
  isAdmin: boolean
  hasUnsavedEdits: boolean
  settingsOpen: boolean
  settingsTab: SettingsTab
  adminPanel: AdminPanelView
  openSettings: (tab?: SettingsTab) => void
  closeSettings: () => void
  setSettingsTab: (tab: SettingsTab) => void
  setAdminPanel: (view: AdminPanelView) => void
  openLogin: () => void
  login: (password: string) => Promise<{ ok: boolean; message: string }>
  logout: () => Promise<boolean>
  refreshSession: () => Promise<boolean>
  setHasUnsavedEdits: (value: boolean) => void
  markSessionExpired: () => void
}

const AdminContext = createContext<AdminContextValue | null>(null)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('display')
  const [adminPanel, setAdminPanel] = useState<AdminPanelView>('status')

  const refreshSession = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'include' })
      const data = (await res.json()) as { authenticated?: boolean }
      const ok = Boolean(data.authenticated)
      setIsAdmin(ok)
      return ok
    } catch {
      setIsAdmin(false)
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
    if (!isAdmin) return
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
  }, [isAdmin, refreshSession])

  const openSettings = useCallback((tab: SettingsTab = 'display') => {
    setSettingsTab(tab)
    if (tab === 'admin') setAdminPanel('status')
    setSettingsOpen(true)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    setAdminPanel('status')
  }, [])

  const openLogin = useCallback(() => {
    setSettingsTab('admin')
    setAdminPanel('login')
    setSettingsOpen(true)
  }, [])

  const login = useCallback(async (password: string) => {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = (await res.json().catch(() => null)) as {
      ok?: boolean
      message?: string
    } | null
    if (res.ok && data?.ok) {
      setIsAdmin(true)
      setAdminPanel('status')
      return {
        ok: true,
        message: data.message ?? '관리자 모드로 로그인되었습니다.',
      }
    }
    return {
      ok: false,
      message: data?.message ?? '관리자 비밀번호가 올바르지 않습니다.',
    }
  }, [])

  const logout = useCallback(async () => {
    if (hasUnsavedEdits) {
      const confirmed = window.confirm(
        '저장하지 않은 변경사항이 있습니다. 관리자 모드를 종료하시겠습니까?',
      )
      if (!confirmed) return false
    }
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include',
    })
    setIsAdmin(false)
    setHasUnsavedEdits(false)
    setAdminPanel('status')
    return true
  }, [hasUnsavedEdits])

  const markSessionExpired = useCallback(() => {
    setIsAdmin(false)
    setHasUnsavedEdits(false)
  }, [])

  const value = useMemo(
    () => ({
      ready,
      isAdmin,
      hasUnsavedEdits,
      settingsOpen,
      settingsTab,
      adminPanel,
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
      hasUnsavedEdits,
      settingsOpen,
      settingsTab,
      adminPanel,
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
