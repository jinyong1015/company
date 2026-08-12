import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  Bell,
  Boxes,
  ChevronDown,
  ClipboardList,
  Coins,
  Factory,
  GitCompare,
  LayoutDashboard,
  MessageSquare,
  Package,
  ShieldCheck,
  Upload,
  Users,
} from 'lucide-react'
import { GlobalFilter } from '../filters/GlobalFilter'
import { AnalysisGroupBar } from '../filters/AnalysisGroupBar'
import { useData } from '../../context/DataContext'

const nav = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true, group: 'main' },
  { to: '/quality', label: '품질 분석', icon: Activity, group: '분석' },
  { to: '/inspectors', label: '검사자 분석', icon: Users, group: '분석' },
  { to: '/products', label: '품번 분석', icon: Package, group: '분석' },
  { to: '/molds', label: '금형 분석', icon: Boxes, group: '분석' },
  { to: '/equipment', label: '설비 분석', icon: Factory, group: '분석' },
  { to: '/costs', label: '비용 분석', icon: Coins, group: '분석' },
  { to: '/compare', label: '스마트 비교', icon: GitCompare, group: '비교' },
  { to: '/data', label: '검사 DATA', icon: ClipboardList, group: '데이터' },
  { to: '/manage', label: '데이터 업로드', icon: Upload, group: '데이터' },
  { to: '/quality-data', label: '데이터 품질', icon: ShieldCheck, group: '데이터' },
  { to: '/anomalies', label: '이상징후', icon: AlertTriangle, group: 'main' },
  { to: '/ai', label: 'AI에게 질문하기', icon: MessageSquare, group: 'AI 분석' },
]

const groups = ['main', '분석', '비교', '데이터', 'AI 분석'] as const

export function Layout() {
  const { meta, hasUploadedData } = useData()

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex h-14 items-center gap-2 border-b border-line px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-sm font-bold text-white">
            QA
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">검사 DATA 분석</p>
            <p className="text-[11px] text-muted">Quality Intelligence</p>
          </div>
        </div>
        <nav className="space-y-3 p-3">
          {groups.map((group) => (
            <div key={group}>
              {group !== 'main' && (
                <p className="mb-1 px-3 text-[11px] font-medium uppercase tracking-wide text-muted">
                  {group}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {nav
                  .filter((item) => item.group === group)
                  .map((item) => {
                    const Icon = item.icon
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? 'bg-accent-soft font-medium text-accent'
                              : 'text-muted hover:bg-canvas hover:text-ink'
                          }`
                        }
                      >
                        <Icon size={16} />
                        {item.label}
                      </NavLink>
                    )
                  })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line/80 bg-surface/90 backdrop-blur">
          <div className="flex h-14 items-center justify-between gap-4 px-5 lg:px-7">
            <div>
              <p className="text-sm font-semibold text-ink">검사 DATA 분석</p>
              <p className="text-xs text-muted">현재 상태 → 변화 → 문제 → 원인 → 비교 → 상세</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="relative rounded-lg border border-line p-2 text-muted hover:bg-canvas hover:text-ink"
                aria-label="알림"
              >
                <Bell size={16} />
              </button>
              <div className="hidden text-right sm:block">
                <p className="text-[11px] text-muted">
                  {hasUploadedData ? '업로드 데이터 업데이트' : '데이터 마지막 업데이트'}
                </p>
                <p className="num text-xs font-medium text-ink">{meta.lastUpdated}</p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm hover:bg-canvas"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-ink text-[11px] font-semibold text-white">
                  관
                </span>
                <span className="hidden md:inline">품질관리자</span>
                <ChevronDown size={14} className="text-muted" />
              </button>
            </div>
          </div>
        </header>

        <main className="space-y-5 px-5 py-5 lg:px-7 lg:py-6">
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <AnalysisGroupBar />
          </div>
          <GlobalFilter />
          <Outlet />
        </main>
      </div>
    </div>
  )
}
