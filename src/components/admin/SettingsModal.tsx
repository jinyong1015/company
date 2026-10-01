import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  X,
} from 'lucide-react'
import { useAdmin, type SettingsTab } from '../../context/AdminContext'
import { useToast } from '../../context/ToastContext'
import { getInitialTheme, saveTheme, type ColorTheme } from '../../lib/theme'

const THEME_OPTIONS: Array<{
  value: ColorTheme
  label: string
  description: string
  Icon: typeof Sun
}> = [
  {
    value: 'light',
    label: '라이트',
    description: '밝은 배경과 어두운 글자',
    Icon: Sun,
  },
  {
    value: 'dark',
    label: '다크',
    description: '깊은 검정 배경과 밝은 글자',
    Icon: Moon,
  },
]

function clsx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function DisplayModePanel() {
  const [preference, setPreference] = useState<ColorTheme>(() => getInitialTheme())

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <div className="settings-panel-icon" aria-hidden="true">
          <Palette size={18} strokeWidth={2} />
        </div>
        <div>
          <h3 className="settings-section-title">화면 모드</h3>
          <p className="settings-panel-lead">
            보기 편한 테마를 선택하세요. 선택 즉시 전체 화면에 적용됩니다.
          </p>
        </div>
      </div>

      <div className="settings-theme-grid" role="radiogroup" aria-label="화면 모드">
        {THEME_OPTIONS.map((option) => {
          const selected = preference === option.value
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              className={clsx(
                'settings-theme-card',
                `settings-theme-card-${option.value}`,
                selected && 'settings-theme-card-active',
              )}
              onClick={() => {
                setPreference(option.value)
                saveTheme(option.value)
                window.dispatchEvent(
                  new CustomEvent('qualitics-theme-change', {
                    detail: option.value,
                  }),
                )
              }}
            >
              <span
                className={clsx(
                  'settings-theme-preview',
                  `settings-theme-preview-${option.value}`,
                )}
                aria-hidden="true"
              >
                <span className="settings-theme-preview-bar" />
                <span className="settings-theme-preview-row" />
                <span className="settings-theme-preview-row short" />
              </span>
              <span className="settings-theme-meta">
                <span className="settings-theme-icon-wrap">
                  <option.Icon size={16} strokeWidth={2} />
                </span>
                <span className="settings-theme-copy">
                  <span className="settings-theme-label">{option.label}</span>
                  <span className="settings-theme-desc">{option.description}</span>
                </span>
                {selected ? (
                  <span className="settings-theme-check" aria-hidden="true">
                    <Check size={14} strokeWidth={2.5} />
                  </span>
                ) : null}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function AdminLoginForm({ onCancel }: { onCancel: () => void }) {
  const { login, preferredLoginRole } = useAdmin()
  const { pushToast } = useToast()
  const [loginRole, setLoginRole] = useState<'manager' | 'admin'>(
    preferredLoginRole,
  )
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setLoginRole(preferredLoginRole)
  }, [preferredLoginRole])

  useEffect(() => {
    const t = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(t)
  }, [loginRole])

  const submit = async () => {
    if (!password.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const result = await login(password, loginRole)
      setPassword('')
      if (result.ok) {
        pushToast(result.message, 'success')
      } else {
        setError(result.message)
        inputRef.current?.focus()
      }
    } catch {
      setPassword('')
      setError('로그인 처리 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <div className="settings-panel-icon settings-panel-icon-lock" aria-hidden="true">
          <Lock size={18} strokeWidth={2} />
        </div>
        <div>
          <h3 className="settings-section-title">실무자 / 관리자 로그인</h3>
          <p className="settings-panel-lead">
            역할을 선택한 뒤 비밀번호를 입력해 주세요. 주간업무 보고·데이터
            업로드는 실무자 또는 관리자만 이용할 수 있습니다.
          </p>
        </div>
      </div>

      <form
        className="settings-login-form"
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div
          className="flex gap-2 rounded-xl border border-line bg-canvas/60 p-1"
          role="tablist"
          aria-label="로그인 역할"
        >
          {(
            [
              { id: 'manager' as const, label: '실무자' },
              { id: 'admin' as const, label: '관리자' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="tab"
              aria-selected={loginRole === opt.id}
              className={clsx(
                'flex-1 rounded-lg px-3 py-2 text-sm font-medium transition',
                loginRole === opt.id
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-muted hover:text-ink',
              )}
              onClick={() => setLoginRole(opt.id)}
              disabled={submitting}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <label className="settings-field">
          <span className="settings-field-label">
            {loginRole === 'manager' ? '실무자 비밀번호' : '관리자 비밀번호'}
          </span>
          <div className="admin-password-wrap">
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              name="staff-password"
              placeholder={
                loginRole === 'manager'
                  ? '실무자 비밀번호'
                  : '관리자 비밀번호'
              }
              disabled={submitting}
            />
            <button
              type="button"
              className="admin-password-toggle"
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </label>

        {error ? (
          <p className="settings-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="settings-login-actions">
          <button
            type="button"
            className="btn"
            disabled={submitting}
            onClick={() => {
              setPassword('')
              onCancel()
            }}
          >
            취소
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !password.trim()}
          >
            {submitting ? '확인 중…' : '로그인'}
          </button>
        </div>
      </form>
    </div>
  )
}

function AdminStatusPanel() {
  const { isAdmin, isStaff, role, setAdminPanel, logout } = useAdmin()
  const { pushToast } = useToast()

  const statusLabel =
    role === 'admin'
      ? '관리자 로그인 중'
      : role === 'manager'
        ? '실무자 로그인 중'
        : '일반 사용자'

  return (
    <div className="settings-panel">
      <div className="settings-panel-intro">
        <div
          className={clsx(
            'settings-panel-icon',
            isStaff && 'settings-panel-icon-admin',
          )}
          aria-hidden="true"
        >
          <ShieldCheck size={18} strokeWidth={2} />
        </div>
        <div>
          <h3 className="settings-section-title">권한 · 로그인</h3>
          <p className="settings-panel-lead">
            {role === 'admin'
              ? '관리자 권한이 활성화되어 있습니다.'
              : role === 'manager'
                ? '실무자 권한이 활성화되어 있습니다. (검사 DATA 수정·사진 삭제는 관리자만)'
                : '주간업무 보고·데이터 업로드는 실무자 또는 관리자 로그인이 필요합니다.'}
          </p>
        </div>
      </div>

      <div
        className={clsx(
          'settings-status-card',
          isStaff ? 'settings-status-card-on' : 'settings-status-card-off',
        )}
      >
        <div className="settings-status-top">
          <span className="settings-status-label">현재 상태</span>
          <span
            className={clsx(
              'settings-status-badge',
              isStaff ? 'settings-status-badge-on' : 'settings-status-badge-off',
            )}
          >
            <span
              className={clsx(
                'settings-status-dot',
                isStaff ? 'settings-status-dot-on' : 'settings-status-dot-off',
              )}
              aria-hidden="true"
            />
            {statusLabel}
          </span>
        </div>
        <ul className="settings-capability-list">
          <li data-allowed="true">분석 화면 · 기본 데이터 조회</li>
          <li data-allowed={isStaff ? 'true' : 'false'}>
            주간업무 보고 · 데이터 업로드
          </li>
          <li data-allowed={isStaff ? 'true' : 'false'}>
            고객사 부적합 · 주간 ISSUE 작성/수정
          </li>
          <li data-allowed={isStaff ? 'true' : 'false'}>품번 사진 업로드·변경</li>
          <li data-allowed={isAdmin ? 'true' : 'false'}>품번 사진 삭제</li>
          <li data-allowed={isAdmin ? 'true' : 'false'}>검사 DATA 행 수정 · 변경 이력</li>
        </ul>
      </div>

      <div className="settings-admin-actions">
        {isStaff ? (
          <button
            type="button"
            className="btn settings-logout-btn"
            onClick={() => {
              void (async () => {
                const done = await logout()
                if (done) {
                  pushToast(
                    role === 'manager'
                      ? '실무자 모드가 종료되었습니다.'
                      : '관리자 모드가 종료되었습니다.',
                    'info',
                  )
                }
              })()
            }}
          >
            <LogOut size={16} />
            로그아웃
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary settings-login-btn"
            onClick={() => setAdminPanel('login')}
          >
            <Lock size={16} />
            실무자 / 관리자 로그인
          </button>
        )}
      </div>
    </div>
  )
}

export function SettingsModal() {
  const {
    settingsOpen,
    settingsTab,
    adminPanel,
    isStaff,
    setSettingsTab,
    setAdminPanel,
    closeSettings,
  } = useAdmin()
  const titleId = useId()
  const tabListRef = useRef<HTMLDivElement>(null)
  const [loginFormKey, setLoginFormKey] = useState(0)

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (settingsTab === 'admin' && adminPanel === 'login') {
          setAdminPanel('status')
          return
        }
        closeSettings()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen, settingsTab, adminPanel, closeSettings, setAdminPanel])

  if (!settingsOpen) return null

  const selectTab = (tab: SettingsTab) => {
    setSettingsTab(tab)
    if (tab === 'admin') setAdminPanel('status')
  }

  const onTabListKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next: SettingsTab =
      e.key === 'ArrowRight'
        ? settingsTab === 'display'
          ? 'admin'
          : 'display'
        : settingsTab === 'admin'
          ? 'display'
          : 'admin'
    selectTab(next)
    const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']")
    const idx = next === 'display' ? 0 : 1
    buttons?.[idx]?.focus()
  }

  const onBackdropClick = () => {
    if (settingsTab === 'admin' && adminPanel === 'login') {
      setLoginFormKey((k) => k + 1)
      return
    }
    closeSettings()
  }

  return (
    <div
      className="settings-modal-backdrop"
      role="presentation"
      onClick={onBackdropClick}
    >
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="settings-modal-handle" aria-hidden="true" />

        <div className="settings-modal-header">
          <div>
            <h2 id={titleId} className="settings-modal-title">
              설정
            </h2>
            <p className="settings-modal-subtitle">화면 표시와 권한</p>
          </div>
          <button
            type="button"
            className="settings-close-icon"
            aria-label="설정 닫기"
            onClick={closeSettings}
          >
            <X size={18} />
          </button>
        </div>

        <div className="settings-tabs-wrap">
          <div
            ref={tabListRef}
            className="settings-tabs"
            role="tablist"
            aria-label="설정 구분"
            onKeyDown={onTabListKeyDown}
          >
            <button
              type="button"
              role="tab"
              id="settings-tab-display"
              aria-selected={settingsTab === 'display'}
              aria-controls="settings-panel-display"
              tabIndex={settingsTab === 'display' ? 0 : -1}
              className={clsx(
                'settings-tab',
                settingsTab === 'display' && 'settings-tab-active',
              )}
              onClick={() => selectTab('display')}
            >
              <Palette size={15} strokeWidth={2} aria-hidden="true" />
              화면 모드
            </button>
            <button
              type="button"
              role="tab"
              id="settings-tab-admin"
              aria-selected={settingsTab === 'admin'}
              aria-controls="settings-panel-admin"
              tabIndex={settingsTab === 'admin' ? 0 : -1}
              className={clsx(
                'settings-tab',
                settingsTab === 'admin' && 'settings-tab-active',
              )}
              onClick={() => selectTab('admin')}
            >
              <ShieldCheck size={15} strokeWidth={2} aria-hidden="true" />
              권한
              {isStaff ? <span className="settings-tab-dot" aria-hidden="true" /> : null}
            </button>
          </div>
        </div>

        <div className="settings-modal-body">
          {settingsTab === 'display' ? (
            <div
              role="tabpanel"
              id="settings-panel-display"
              aria-labelledby="settings-tab-display"
              className="settings-tabpanel"
            >
              <DisplayModePanel />
            </div>
          ) : (
            <div
              role="tabpanel"
              id="settings-panel-admin"
              aria-labelledby="settings-tab-admin"
              className="settings-tabpanel"
            >
              {adminPanel === 'login' ? (
                <AdminLoginForm
                  key={loginFormKey}
                  onCancel={() => setAdminPanel('status')}
                />
              ) : (
                <AdminStatusPanel />
              )}
            </div>
          )}
        </div>

        <div className="settings-modal-footer">
          <button type="button" className="btn" onClick={closeSettings}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}
