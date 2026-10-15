import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  Eye,
  EyeOff,
  Globe2,
  Loader2,
  Lock,
  Shield,
  UserRound,
} from 'lucide-react'
import { useAdmin, type LoginRole } from '../../context/AdminContext'
import './AccessLogin.css'

const ACCESS_OPTIONS = [
  {
    id: 'user' as const,
    label: '기본 사용자',
    hint: '조회 및 기본 분석',
    Icon: UserRound,
    color: '#2563eb',
  },
  {
    id: 'manager' as const,
    label: '실무자',
    hint: '업무 권한',
    Icon: Briefcase,
    color: '#059669',
  },
  {
    id: 'admin' as const,
    label: '관리자',
    hint: '전체 관리 권한',
    Icon: Shield,
    color: '#7c3aed',
  },
  {
    id: 'vina' as const,
    label: 'VINA',
    hint: 'VINA 전용 관리',
    Icon: Globe2,
    color: '#ea580c',
  },
] as const

function roleColor(role: LoginRole) {
  return ACCESS_OPTIONS.find((option) => option.id === role)?.color ?? '#2563eb'
}

function roleLabel(role: LoginRole) {
  if (role === 'manager') return '실무자'
  if (role === 'admin') return '관리자'
  if (role === 'vina') return 'VINA'
  return '기본 사용자'
}

export function AccessGate({ children }: { children: ReactNode }) {
  const { ready, isAuthenticated } = useAdmin()

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-2 bg-canvas px-4 text-sm text-muted">
        <Loader2 size={16} className="access-spin" aria-hidden />
        로그인 상태를 확인하고 있습니다…
      </div>
    )
  }

  if (!isAuthenticated) return <AccessLogin />
  return <>{children}</>
}

export function AccessLogin() {
  const { login } = useAdmin()
  const [selectedRole, setSelectedRole] = useState<LoginRole | null>(null)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (selectedRole && selectedRole !== 'user') {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 50)
      return () => window.clearTimeout(timer)
    }
  }, [selectedRole])

  const chooseRole = async (role: LoginRole) => {
    setSelectedRole(role)
    setPassword('')
    setError(null)
    if (role !== 'user') return

    setSubmitting(true)
    const result = await login('', 'user')
    if (!result.ok) setError(result.message)
    setSubmitting(false)
  }

  const submit = async () => {
    if (!selectedRole || selectedRole === 'user' || !password.trim()) return
    setSubmitting(true)
    setError(null)
    const result = await login(password, selectedRole)
    if (!result.ok) {
      setError(result.message)
      setPassword('')
      inputRef.current?.focus()
    }
    setSubmitting(false)
  }

  return (
    <main className="access-login-page">
      <div className="access-login-bg" aria-hidden />
      <div className="access-login-grid" aria-hidden />

      <div className="access-shell">
        <section className="access-card">
          <header className="access-header">
            <img src="/hyundai-logo.png" alt="Hyundae Corporation" />
            <span className="access-eyebrow">Inspection Data</span>
            <h1 className="access-title">검사 DATA 분석</h1>
            <p className="access-subtitle">사용할 접근 유형을 선택해 주세요.</p>
          </header>

          <div className="access-options" role="radiogroup" aria-label="접근 유형">
            {ACCESS_OPTIONS.map((option) => {
              const selected = selectedRole === option.id
              const entering = selected && option.id === 'user' && submitting
              const Icon = option.Icon
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={submitting}
                  onClick={() => void chooseRole(option.id)}
                  className="access-option"
                  style={{ '--role': option.color } as CSSProperties}
                >
                  <span className="access-option-icon">
                    <Icon size={19} aria-hidden />
                  </span>
                  <span>
                    <span className="access-option-label">{option.label}</span>
                    <span className="access-option-hint">
                      {entering ? '입장하는 중…' : option.hint}
                    </span>
                  </span>
                  <span className="access-option-mark" aria-hidden>
                    {entering ? (
                      <Loader2 size={11} className="access-spin" />
                    ) : selected ? (
                      <Check size={11} strokeWidth={3.5} />
                    ) : option.id !== 'user' ? (
                      <Lock size={12} />
                    ) : null}
                  </span>
                </button>
              )
            })}
          </div>

          {selectedRole && selectedRole !== 'user' ? (
            <form
              key={selectedRole}
              className="access-form"
              style={{ '--role': roleColor(selectedRole) } as CSSProperties}
              onSubmit={(event) => {
                event.preventDefault()
                void submit()
              }}
            >
              <label className="block">
                <span className="access-form-label">
                  {roleLabel(selectedRole)} 비밀번호
                </span>
                <span className="access-input-wrap">
                  <input
                    ref={inputRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    name="access-password"
                    autoComplete="current-password"
                    className="access-input"
                    placeholder="비밀번호를 입력하세요"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    className="access-eye"
                    aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              <button
                type="submit"
                className="access-submit"
                disabled={submitting || !password.trim()}
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="access-spin" aria-hidden />
                    확인 중…
                  </>
                ) : (
                  <>
                    {roleLabel(selectedRole)} 로그인
                    <ArrowRight size={16} className="access-arrow" aria-hidden />
                  </>
                )}
              </button>
            </form>
          ) : null}

          {error ? (
            <p className="access-error" role="alert">
              <AlertCircle size={16} aria-hidden />
              {error}
            </p>
          ) : null}
        </section>

        <p className="access-footer">© Hyundae Corporation</p>
      </div>
    </main>
  )
}
